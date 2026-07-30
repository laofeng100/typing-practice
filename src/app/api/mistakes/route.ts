import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { calculateRetrievability } from '@/lib/fsrs'

// 获取错题本：高错误率的单词/句子/古诗词（仅 FSRS 学科，阅读与听力不参与）
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  // 查找FSRS卡片中难度高、遗忘次数多的卡片
  const cards = await db.fsrsCard.findMany({
    where: {
      userId: user.id,
      cardType: { in: ['word', 'sentence', 'chinese'] },
      OR: [
        { difficulty: { gte: 5 } },
        { lapses: { gte: 1 } },
        { totalErrors: { gte: 2 } },
      ],
    },
    take: 200,
  })

  // 按实时可提取性升序（最危险的排前面），新卡按难度兜底
  const now = new Date()
  const sorted = cards
    .map(c => ({ ...c, liveR: c.state > 0 ? calculateRetrievability(c, now) : 1 }))
    .sort((a, b) => a.liveR - b.liveR || b.difficulty - a.difficulty)
    .slice(0, 100)

  // 按类型分组
  const grouped: Record<string, any[]> = {
    word: [],
    sentence: [],
    chinese: [],
  }

  // 按 cardType 分组收集 ID，每类型一次批量查询（避免 N+1），保持原 select 字段
  const idsOf = (t: string) => sorted.filter(c => c.cardType === t).map(c => parseInt(c.cardId)).filter(n => !isNaN(n))
  const [wordRows, sentenceRows, chineseRows] = await Promise.all([
    db.word.findMany({ where: { id: { in: idsOf('word') } }, select: { id: true, en: true, zh: true, pos: true, stage: true, difficulty: true } }),
    db.sentence.findMany({ where: { id: { in: idsOf('sentence') } }, select: { id: true, en: true, zh: true, grammarPoint: true, stage: true, difficulty: true } }),
    db.chineseText.findMany({ where: { id: { in: idsOf('chinese') } }, select: { id: true, title: true, author: true, dynasty: true, category: true, wordCount: true, stage: true, difficulty: true } }),
  ])
  const itemMaps: Record<string, Map<number, any>> = {
    word: new Map(wordRows.map(w => [w.id, w])),
    sentence: new Map(sentenceRows.map(s => [s.id, s])),
    chinese: new Map(chineseRows.map(c => [c.id, c])),
  }

  for (const c of sorted) {
    const map = itemMaps[c.cardType]
    const item = map ? map.get(parseInt(c.cardId)) : null
    if (item) {
      grouped[c.cardType].push({
        ...item,
        cardState: c.state,
        stability: c.stability,
        difficulty_card: c.difficulty,
        reps: c.reps,
        lapses: c.lapses,
        totalTyping: c.totalTyping,
        totalErrors: c.totalErrors,
        errorRate: c.totalTyping > 0 ? Math.round((c.totalErrors / c.totalTyping) * 100) : 0,
        retrievability: Math.round(c.liveR * 100) / 100,
        due: c.due,
      })
    }
  }

  // 统计
  const stats = {
    totalMistakes: sorted.length,
    byType: {
      word: grouped.word.length,
      sentence: grouped.sentence.length,
      chinese: grouped.chinese.length,
    },
    highDifficulty: sorted.filter(c => c.difficulty >= 7).length,
    forgotten: sorted.filter(c => c.lapses >= 2).length,
  }

  return NextResponse.json({ grouped, stats })
}
