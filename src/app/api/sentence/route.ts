import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { checkDailyLimit, getSettings } from '@/lib/settings'
import { calculateRetrievability } from '@/lib/fsrs'

// 学段顺序
const STAGE_ORDER = ['小学', '初中', '高中']

/**
 * 获取句子练习队列
 *
 * 学段晋级逻辑与单词API一致：
 * - 当前学段句子学完后自动晋级
 * - 复习跨学段
 * - 避免notIn大量ID（SQLite限制），用内存过滤
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const dailyLimit = await checkDailyLimit(user.id)
  if (dailyLimit.exceeded) {
    return NextResponse.json(
      { error: `今日练习已达上限（${dailyLimit.limitMin}分钟），明天再来吧`, usedMin: dailyLimit.usedMin, limitMin: dailyLimit.limitMin },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') || 'practice'
  let stage = searchParams.get('stage') || user.stage
  const limit = Number(searchParams.get('limit')) || 10

  if (mode === 'review') {
    // FSRS待复习句子（跨学段），按实时可提取性 R 升序（最可能遗忘的优先）
    const settings = await getSettings(user.id)
    const now = new Date()
    const cramAheadDays = settings.examCramMode ? 7 : 0
    const dueCardsRaw = await db.fsrsCard.findMany({
      where: { userId: user.id, cardType: 'sentence', due: { lte: new Date(now.getTime() + cramAheadDays * 86400000) }, state: { gt: 0 } },
      take: limit * 3,
      orderBy: { due: 'asc' },
    })
    const dueCards = dueCardsRaw
      .map(c => ({ ...c, liveR: calculateRetrievability(c, now) }))
      .sort((a, b) => a.liveR - b.liveR)
      .slice(0, limit)
    // 批量查询，避免 N+1
    const dueIds = dueCards.map(c => parseInt(c.cardId)).filter(n => !isNaN(n))
    const sentenceRows = await db.sentence.findMany({ where: { id: { in: dueIds } } })
    const sentenceMap = new Map(sentenceRows.map(s => [s.id, s]))
    const sentences: any[] = []
    for (const c of dueCards) {
      const s = sentenceMap.get(parseInt(c.cardId))
      if (s) sentences.push({ ...s, cardState: c.state, stability: c.stability, reps: c.reps })
    }
    return NextResponse.json({ sentences, mode: 'review' })
  }

  // 普通练习：获取已学ID集合
  const learnedCards = await db.fsrsCard.findMany({
    where: { userId: user.id, cardType: 'sentence', state: { gt: 0 } },
    select: { cardId: true },
  })
  const learnedSet = new Set(learnedCards.map(c => c.cardId))

  // 获取候选句子（内存过滤已学）
  const candidateBatch = Math.min(limit * 5, 100)
  let candidates = await db.sentence.findMany({
    where: { stage },
    orderBy: { order: 'asc' },
    take: candidateBatch,
  })
  let sentences = candidates.filter(s => !learnedSet.has(String(s.id)))

  // 如果当前学段没有新句子，尝试晋级
  let stageUpgraded = false
  if (sentences.length === 0) {
    const stageTotal = await db.sentence.count({ where: { stage } })
    const stageLearned = (await db.sentence.findMany({ where: { stage }, select: { id: true }, take: 5000 }))
      .filter(s => learnedSet.has(String(s.id))).length

    if (stageLearned >= stageTotal) {
      const currentIdx = STAGE_ORDER.indexOf(stage)
      if (currentIdx < STAGE_ORDER.length - 1) {
        stage = STAGE_ORDER[currentIdx + 1]
        stageUpgraded = true
        candidates = await db.sentence.findMany({
          where: { stage },
          orderBy: { order: 'asc' },
          take: candidateBatch,
        })
        sentences = candidates.filter(s => !learnedSet.has(String(s.id)))
      }
    }
  }

  // 不够则继续取更多
  let offset = candidateBatch
  while (sentences.length < limit && offset < 5000) {
    const more = await db.sentence.findMany({
      where: { stage },
      orderBy: { order: 'asc' },
      skip: offset,
      take: candidateBatch,
    })
    if (more.length === 0) break
    sentences.push(...more.filter(s => !learnedSet.has(String(s.id))))
    offset += candidateBatch
  }

  sentences = sentences.slice(0, limit)

  // 统计
  const totalLearned = learnedCards.length
  const totalSentences = await db.sentence.count({ where: { stage } })

  return NextResponse.json({
    sentences,
    mode: 'practice',
    currentStage: stage,
    stageUpgraded,
    stats: { totalLearned, totalSentences, stage },
  })
}
