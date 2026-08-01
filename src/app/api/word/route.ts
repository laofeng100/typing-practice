import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSettings, checkDailyLimit } from '@/lib/settings'
import { calculateRetrievability } from '@/lib/fsrs'
import { bookSortKey } from '@/app/api/books/route'

// 学段顺序（与 Book.stage 对应）
const STAGE_ORDER = ['primary', 'middle', 'high']
const STAGE_LABEL: Record<string, string> = { primary: '小学', middle: '初中', high: '高中' }

// 词条详情 select（新词/复习词共用）：音标/记忆法/例句/短语/近义词/相关词
const wordDetailSelect = {
  id: true, en: true, zh: true, pos: true, usPhone: true, ukPhone: true, memoryMethod: true,
  examples: { take: 3, orderBy: { ord: 'asc' as const }, select: { en: true, cn: true } },
  phrases: { take: 8, orderBy: { ord: 'asc' as const }, select: { phrase: true, cn: true } },
  synonyms: { select: { pos: true, word: true, tranCn: true } },
  related: { select: { pos: true, word: true, tranCn: true } },
}

/**
 * 获取今日练习队列：新词 + 待复习词
 *
 * 教材推进逻辑：
 * - 新词从用户当前教材（user.bookId）按教材词序（wordRank）获取
 * - 当前教材全部学完后，自动晋级：同版本下一册 → 跨学段第一本 → 末本停留
 * - 复习词跨教材（所有已学过的到期卡片都会复习）
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const limit = await checkDailyLimit(user.id)
  if (limit.exceeded) {
    return NextResponse.json(
      { error: `今日练习已达上限（${limit.limitMin}分钟），明天再来吧`, usedMin: limit.usedMin, limitMin: limit.limitMin },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') || 'mixed'
  const settings = await getSettings(user.id)

  // ===== 复习词：跨教材获取到期卡片，按实时可提取性 R 升序（最可能遗忘的优先） =====
  const now = new Date()
  const cramAheadDays = settings.examCramMode ? 7 : 0 // 考前突击：提前拉取未来7天到期的卡
  const dueBefore = new Date(now.getTime() + cramAheadDays * 86400000)
  const dueCardsRaw = await db.fsrsCard.findMany({
    where: {
      userId: user.id,
      cardType: 'word',
      due: { lte: dueBefore },
      state: { gt: 0 },
    },
    take: settings.wordReviewBatchSize * 3,
    orderBy: { due: 'asc' },
  })
  const dueCards = dueCardsRaw
    .map(c => ({ ...c, liveR: calculateRetrievability(c, now) }))
    .sort((a, b) => a.liveR - b.liveR)
    .slice(0, settings.wordReviewBatchSize)
  // 积压量必须用真实 count（findMany 的 take 会截断，截断后的长度会让积压防护失效）
  const dueCount = await db.fsrsCard.count({
    where: {
      userId: user.id,
      cardType: 'word',
      due: { lte: dueBefore },
      state: { gt: 0 },
    },
  })

  // ===== 新词获取（含自动教材推进） =====
  const newWords: any[] = []
  let stageUpgraded = false
  let currentBook = await db.book.findUnique({ where: { id: user.bookId } })
  if (!currentBook) {
    // 兜底：bookId 数据异常时取第一本
    const allBooks = await db.book.findMany()
    currentBook = allBooks.sort((a, b) => bookSortKey(a).localeCompare(bookSortKey(b)))[0]
  }

  // 积压防护：复习债越多，新词越少，避免滚雪球
  const newWordTarget = mode === 'new'
    ? settings.wordBatchSize
    : dueCount > settings.wordReviewBatchSize * 5
      ? 0
      : dueCount > settings.wordReviewBatchSize * 3
        ? Math.ceil(settings.wordBatchSize / 2)
        : settings.wordBatchSize

  const needNewWords = (mode === 'new' || mode === 'mixed') && newWordTarget > 0

  // 已学单词ID集合（仅新词模式需要：过滤候选词；纯复习模式用 SQL count 统计，不拉全量）
  let learnedWordIds = new Set<string>()
  if (needNewWords) {
    const allCards = await db.fsrsCard.findMany({
      where: { userId: user.id, cardType: 'word', state: { gt: 0 } },
      select: { cardId: true },
    })
    learnedWordIds = new Set<string>(allCards.map(c => c.cardId))
  }

  if (needNewWords) {
    // 当前教材词集（教材词最多几百，一次拉取，按 wordRank 排序）
    let bookWordRows = await db.bookWord.findMany({
      where: { bookId: currentBook.id },
      select: { wordId: true, wordRank: true },
    })
    let unlearnedRows = bookWordRows
      .filter(r => !learnedWordIds.has(r.wordId))
      .sort((a, b) => (a.wordRank ?? 999999) - (b.wordRank ?? 999999))

    // 当前教材全部学完 → 自动推进（同版本下一册 → 跨学段第一本 → 末本停留）
    let guard = 0
    while (unlearnedRows.length === 0 && bookWordRows.length > 0 && guard < 10) {
      const nextBook = await findNextBook(currentBook)
      if (!nextBook) break
      await db.user.update({ where: { id: user.id }, data: { bookId: nextBook.id } })
      currentBook = nextBook
      stageUpgraded = true
      bookWordRows = await db.bookWord.findMany({
        where: { bookId: currentBook.id },
        select: { wordId: true, wordRank: true },
      })
      unlearnedRows = bookWordRows
        .filter(r => !learnedWordIds.has(r.wordId))
        .sort((a, b) => (a.wordRank ?? 999999) - (b.wordRank ?? 999999))
      guard++
    }

    // 只按需取目标数量的词详情（原实现先拉全教材词详情再 slice，
    // 详情含例句/短语/近义词/相关词，全教材拉取开销大）
    const newWordIds = unlearnedRows.slice(0, newWordTarget).map(r => r.wordId)
    if (newWordIds.length > 0) {
      const detailRows = await db.wordDict.findMany({
        where: { id: { in: newWordIds } },
        select: {
          ...wordDetailSelect,
          books: { where: { bookId: currentBook.id }, select: { wordRank: true } },
        },
      })
      const rankMap = new Map(unlearnedRows.map(r => [r.wordId, r.wordRank]))
      detailRows.sort((a, b) => (rankMap.get(a.id) ?? 999999) - (rankMap.get(b.id) ?? 999999))
      for (const w of detailRows) {
        const card = await db.fsrsCard.findUnique({
          where: { userId_cardType_cardId: { userId: user.id, cardType: 'word', cardId: w.id } },
        })
        const { books, ...rest } = w
        newWords.push({ ...rest, wordRank: books[0]?.wordRank ?? null, cardState: card?.state || 0 })
      }
    }
  }

  // ===== 复习词详情（批量查询，避免 N+1） =====
  const reviewWords: any[] = []
  const dueIds = dueCards.map(c => c.cardId) // head_word 字符串，不再 parseInt
  if (dueIds.length > 0) {
    const wordRows = await db.wordDict.findMany({
      where: { id: { in: dueIds } },
      select: wordDetailSelect,
    })
    const wordMap = new Map(wordRows.map(w => [w.id, w]))
    for (const c of dueCards) {
      const w = wordMap.get(c.cardId)
      if (w) {
        reviewWords.push({
          ...w,
          wordRank: null, // 复习词跨教材，无单一教材词序
          cardState: c.state,
          stability: c.stability,
          difficulty: c.difficulty,
          // 实时计算可提取性（库存值恒为1.0，不可信）
          retrievability: calculateRetrievability({
            stability: c.stability,
            difficulty: c.difficulty,
            retrievability: c.retrievability,
            due: c.due,
            lastReview: c.lastReview,
            reps: c.reps,
            lapses: c.lapses,
            state: c.state,
          }),
          reps: c.reps,
          lapses: c.lapses,
        })
      }
    }
  }

  // ===== 统计 =====
  // 已学总数与当前教材进度用 SQL count（不再依赖全量已学 ID 集合）
  const currentBookRows = await db.bookWord.findMany({ where: { bookId: currentBook.id }, select: { wordId: true } })
  const currentBookTotal = currentBookRows.length
  const [totalLearned, currentBookLearned] = await Promise.all([
    db.fsrsCard.count({ where: { userId: user.id, cardType: 'word', state: { gt: 0 } } }),
    db.fsrsCard.count({
      where: {
        userId: user.id,
        cardType: 'word',
        state: { gt: 0 },
        cardId: { in: currentBookRows.map(r => r.wordId) },
      },
    }),
  ])

  // 全部词库去重词总数（展示用）
  const totalWordsCurrent = await db.wordDict.count()

  return NextResponse.json({
    mode,
    newWords,
    reviewWords,
    currentStage: STAGE_LABEL[currentBook.stage] || currentBook.stage,
    stageUpgraded,
    currentBook: {
      id: currentBook.id,
      title: currentBook.title,
      version: currentBook.version,
      stage: currentBook.stage,
      grade: currentBook.grade,
      term: currentBook.term,
    },
    stats: {
      totalLearned,
      totalWords: totalWordsCurrent,
      dueCount,
      backlog: dueCount > settings.wordReviewBatchSize * 3,
      newCount: newWords.length,
      currentStageLearned: currentBookLearned,
      currentStageTotal: currentBookTotal,
      currentStageProgress: currentBookTotal > 0 ? Math.round((currentBookLearned / currentBookTotal) * 100) : 0,
    },
  })
}

// 教材推进：同 version 同 stage 的下一册（grade/term 升序）；无则跨学段取下一 stage 第一本
async function findNextBook(currentBook: { id: string; stage: string; version: string | null }) {
  const sameVersionBooks = await db.book.findMany({
    where: { stage: currentBook.stage, version: currentBook.version },
    orderBy: [{ grade: 'asc' }, { term: 'asc' }],
  })
  const idx = sameVersionBooks.findIndex(b => b.id === currentBook.id)
  if (idx >= 0 && idx < sameVersionBooks.length - 1) return sameVersionBooks[idx + 1]

  const nextStageIdx = STAGE_ORDER.indexOf(currentBook.stage) + 1
  if (nextStageIdx >= STAGE_ORDER.length) return null
  const nextStageBooks = await db.book.findMany({ where: { stage: STAGE_ORDER[nextStageIdx] } })
  return nextStageBooks.sort((a, b) => bookSortKey(a).localeCompare(bookSortKey(b)))[0] || null
}
