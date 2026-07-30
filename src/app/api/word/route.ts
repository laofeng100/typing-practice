import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSettings, checkDailyLimit } from '@/lib/settings'
import { calculateRetrievability } from '@/lib/fsrs'

// 学段顺序
const STAGE_ORDER = ['小学', '初中', '高中']

/**
 * 获取今日练习队列：新词 + 待复习词
 *
 * 学段晋级逻辑：
 * - 新词从用户当前学段获取
 * - 如果当前学段所有词都已学完（state>0），自动晋级到下一学段
 * - 复习词跨学段（所有已学过的到期卡片都会复习）
 *
 * 性能优化：避免使用 notIn 传大量ID（SQLite参数限制），
 * 改用分批查询已学ID + 内存过滤
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

  // ===== 复习词：跨学段获取到期卡片，按实时可提取性 R 升序（最可能遗忘的优先） =====
  const now = new Date()
  const cramAheadDays = settings.examCramMode ? 7 : 0 // 考前突击：提前拉取未来7天到期的卡
  const dueCardsRaw = await db.fsrsCard.findMany({
    where: {
      userId: user.id,
      cardType: 'word',
      due: { lte: new Date(now.getTime() + cramAheadDays * 86400000) },
      state: { gt: 0 },
    },
    take: settings.wordReviewBatchSize * 3,
    orderBy: { due: 'asc' },
  })
  const dueCards = dueCardsRaw
    .map(c => ({ ...c, liveR: calculateRetrievability(c, now) }))
    .sort((a, b) => a.liveR - b.liveR)
    .slice(0, settings.wordReviewBatchSize)
  const dueCount = dueCardsRaw.length // 积压量（用于新词减发防护）

  // ===== 已学单词ID集合（仅获取ID，避免大量字段） =====
  const allCards = await db.fsrsCard.findMany({
    where: { userId: user.id, cardType: 'word', state: { gt: 0 } },
    select: { cardId: true },
  })
  const learnedWordIds = new Set<string>()
  const learnedNums: number[] = []
  for (const c of allCards) {
    learnedWordIds.add(c.cardId)
    const n = parseInt(c.cardId)
    if (!isNaN(n)) learnedNums.push(n)
  }

  // ===== 新词获取（含自动学段晋级） =====
  const newWords: any[] = []
  let currentStage = user.stage
  let stageUpgraded = false

  // 积压防护：复习债越多，新词越少，避免滚雪球
  const newWordTarget = mode === 'new'
    ? settings.wordBatchSize
    : dueCount > settings.wordReviewBatchSize * 5
      ? 0
      : dueCount > settings.wordReviewBatchSize * 3
        ? Math.ceil(settings.wordBatchSize / 2)
        : settings.wordBatchSize

  if ((mode === 'new' || mode === 'mixed') && newWordTarget > 0) {
    // 获取当前学段的候选新词（多取一些，内存过滤已学的）
    // SQLite notIn 有参数限制，所以用内存过滤
    const candidateBatch = Math.min(settings.wordBatchSize * 5, 200) // 取5倍候选量

    // 第一次尝试：从当前学段获取候选
    let candidates = await db.word.findMany({
      where: { stage: currentStage },
      orderBy: [{ difficulty: 'asc' }, { id: 'asc' }],
      take: candidateBatch,
    })

    // 内存过滤已学的
    let newWordRows = candidates.filter(w => !learnedWordIds.has(String(w.id)))

    // 如果候选不足，可能是因为当前学段剩余词不够，检查是否需要晋级
    if (newWordRows.length === 0) {
      // 检查当前学段是否真的全部学完
      const currentStageTotal = await db.word.count({ where: { stage: currentStage } })
      // 内存交集统计已学数（避免 take 截断导致无法晋级）
      const currentStageWordIds = await db.word.findMany({ where: { stage: currentStage }, select: { id: true } })
      const currentStageLearned = currentStageWordIds.filter(w => learnedWordIds.has(String(w.id))).length

      if (currentStageLearned >= currentStageTotal) {
        // 自动晋级
        const currentIdx = STAGE_ORDER.indexOf(currentStage)
        if (currentIdx < STAGE_ORDER.length - 1) {
          currentStage = STAGE_ORDER[currentIdx + 1]
          stageUpgraded = true
          // 更新用户学段
          await db.user.update({
            where: { id: user.id },
            data: { stage: currentStage },
          })
          // 从新学段获取新词
          candidates = await db.word.findMany({
            where: { stage: currentStage },
            orderBy: [{ difficulty: 'asc' }, { id: 'asc' }],
            take: candidateBatch,
          })
          newWordRows = candidates.filter(w => !learnedWordIds.has(String(w.id)))
        }
      }
    }

    // 如果候选量不够（已学的一部分在候选里），继续取更多
    let offset = candidateBatch
    while (newWordRows.length < newWordTarget && offset < 10000) {
      const more = await db.word.findMany({
        where: { stage: currentStage },
        orderBy: [{ difficulty: 'asc' }, { id: 'asc' }],
        skip: offset,
        take: candidateBatch,
      })
      if (more.length === 0) break
      newWordRows.push(...more.filter(w => !learnedWordIds.has(String(w.id))))
      offset += candidateBatch
    }

    newWordRows = newWordRows.slice(0, newWordTarget)

    for (const w of newWordRows) {
      const card = await db.fsrsCard.findUnique({
        where: { userId_cardType_cardId: { userId: user.id, cardType: 'word', cardId: String(w.id) } },
      })
      newWords.push({ ...w, cardState: card?.state || 0 })
    }
  }

  // ===== 复习词详情（批量查询，避免 N+1） =====
  const reviewWords: any[] = []
  const dueIds = dueCards.map(c => parseInt(c.cardId)).filter(n => !isNaN(n))
  const wordRows = await db.word.findMany({ where: { id: { in: dueIds } } })
  const wordMap = new Map(wordRows.map(w => [w.id, w]))
  for (const c of dueCards) {
    const w = wordMap.get(parseInt(c.cardId))
    if (w) {
      reviewWords.push({
        ...w,
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

  // ===== 统计 =====
  const totalLearned = allCards.length

  // 当前学段进度（用count查询，不用notIn）
  const currentStageTotal = await db.word.count({ where: { stage: currentStage } })
  // 当前学段已学数：获取该学段所有词ID，和已学ID取交集
  const currentStageWordIds = (await db.word.findMany({ where: { stage: currentStage }, select: { id: true } })).map(w => String(w.id))
  const currentStageLearned = currentStageWordIds.filter(id => learnedWordIds.has(id)).length

  // 累计学段词库总量（当前及之前）
  const currentStageIdx = STAGE_ORDER.indexOf(currentStage)
  const stagesToCount = STAGE_ORDER.slice(0, currentStageIdx + 1)
  const totalWordsCurrent = await db.word.count({ where: { stage: { in: stagesToCount } } })

  return NextResponse.json({
    mode,
    newWords,
    reviewWords,
    currentStage,
    stageUpgraded,
    stats: {
      totalLearned,
      totalWords: totalWordsCurrent,
      dueCount,
      backlog: dueCount > settings.wordReviewBatchSize * 3,
      newCount: newWords.length,
      currentStageLearned,
      currentStageTotal,
      currentStageProgress: currentStageTotal > 0 ? Math.round((currentStageLearned / currentStageTotal) * 100) : 0,
    },
  })
}
