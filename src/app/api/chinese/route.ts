import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { checkDailyLimit } from '@/lib/settings'
import { calculateRetrievability } from '@/lib/fsrs'

// 古诗词背诵模块：FSRS-6 调度的背诵复习（与英语单词队列按 cardType 天然隔离）
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
  const stage = searchParams.get('stage') || '小学'
  const textId = searchParams.get('id')

  if (textId) {
    const idNum = Number(textId)
    if (!Number.isInteger(idNum) || idNum <= 0) return NextResponse.json({ error: '无效的课文ID' }, { status: 400 })
    const text = await db.chineseText.findUnique({ where: { id: idNum } })
    if (!text) return NextResponse.json({ error: '课文不存在' }, { status: 404 })
    const card = await db.fsrsCard.findUnique({
      where: { userId_cardType_cardId: { userId: user.id, cardType: 'chinese', cardId: String(idNum) } },
    })
    return NextResponse.json({
      text,
      card: card ? { state: card.state, due: card.due, reps: card.reps, lapses: card.lapses } : null,
    })
  }

  const now = new Date()

  // 全部古诗词卡片（跨学段），用于状态标注与到期队列
  const cards = await db.fsrsCard.findMany({
    where: { userId: user.id, cardType: 'chinese' },
  })
  const cardMap = new Map(cards.map(c => [c.cardId, c]))

  // 今日待复习队列：到期卡按实时可提取性升序（最快遗忘的优先）
  const dueCards = cards
    .filter(c => c.state > 0 && c.due <= now)
    .map(c => ({ ...c, liveR: calculateRetrievability(c, now) }))
    .sort((a, b) => a.liveR - b.liveR)
    .slice(0, 20)
  const dueIds = dueCards.map(c => parseInt(c.cardId)).filter(n => !isNaN(n))
  const dueTexts = await db.chineseText.findMany({
    where: { id: { in: dueIds } },
    select: { id: true, stage: true, grade: true, title: true, author: true, dynasty: true, category: true, wordCount: true, difficulty: true },
  })
  const dueTextMap = new Map(dueTexts.map(t => [t.id, t]))
  const reviewQueue = dueCards
    .map(c => {
      const t = dueTextMap.get(parseInt(c.cardId))
      if (!t) return null
      return {
        ...t,
        cardState: c.state,
        reps: c.reps,
        lapses: c.lapses,
        due: c.due,
        retrievability: Math.round(c.liveR * 100) / 100,
      }
    })
    .filter(Boolean)

  // 当前学段课文列表（带卡片状态徽章）
  const texts = await db.chineseText.findMany({
    where: { stage },
    orderBy: [{ grade: 'asc' }, { order: 'asc' }],
    select: { id: true, stage: true, grade: true, order: true, title: true, author: true, dynasty: true, category: true, wordCount: true, difficulty: true },
  })

  return NextResponse.json({
    texts: texts.map(t => {
      const c = cardMap.get(String(t.id))
      return {
        ...t,
        practiced: !!c,
        cardState: c?.state ?? 0,
        reps: c?.reps ?? 0,
        lapses: c?.lapses ?? 0,
        due: c?.due ?? null,
        isDue: !!c && c.state > 0 && c.due <= now,
      }
    }),
    reviewQueue,
    stage,
  })
}
