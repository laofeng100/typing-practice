import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { calculateRetrievability } from '@/lib/fsrs'

// 获取错题本：高错误率的单词/句子（仅 FSRS 学科，阅读与听力不参与）
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  // 查找错误积累多的卡片：
  // 注意不能用 difficulty>=5 做门槛——首学评 Hard 难度即达 5.11，会把所有首学 Hard 的卡全量收进错题本，
  // 错题本应聚焦"实际出错"的卡（遗忘过 / 累计错 ≥2 次）
  const cards = await db.fsrsCard.findMany({
    where: {
      userId: user.id,
      cardType: { in: ['word', 'sentence'] },
      OR: [
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
  }

  // 按 cardType 分组收集 ID，每类型一次批量查询（避免 N+1），保持原 select 字段
  // word 卡 cardId 为 head_word 字符串；sentence 卡仍为数字 id
  const wordIds = sorted.filter(c => c.cardType === 'word').map(c => c.cardId)
  const sentenceIds = sorted.filter(c => c.cardType === 'sentence').map(c => parseInt(c.cardId)).filter(n => !isNaN(n))
  const [wordRows, sentenceRows] = await Promise.all([
    db.wordDict.findMany({ where: { id: { in: wordIds } }, select: { id: true, en: true, zh: true, pos: true, usPhone: true, isPrimary: true, isMiddle: true, isHigh: true } }),
    db.sentence.findMany({ where: { id: { in: sentenceIds } }, select: { id: true, en: true, zh: true, grammarPoint: true, stage: true, difficulty: true } }),
  ])
  const itemMaps: Record<string, Map<any, any>> = {
    // wordDict 无 stage 字段，按学段标签映射回中文学段（错题本 Badge 展示用）
    word: new Map(wordRows.map(w => [w.id, { ...w, stage: w.isPrimary ? '小学' : w.isMiddle ? '初中' : w.isHigh ? '高中' : '' }])),
    sentence: new Map(sentenceRows.map(s => [s.id, s])),
  }

  for (const c of sorted) {
    const map = itemMaps[c.cardType]
    const key = c.cardType === 'word' ? c.cardId : parseInt(c.cardId)
    const item = map ? map.get(key) : null
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
    },
    highDifficulty: sorted.filter(c => c.difficulty >= 7).length,
    forgotten: sorted.filter(c => c.lapses >= 2).length,
  }

  return NextResponse.json({ grouped, stats })
}
