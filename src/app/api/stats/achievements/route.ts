import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { localDateStr } from '@/lib/datetime'
import { computeAchievements, computeUserMetrics } from '@/lib/achievements'

// 获取用户成就数据
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  // 一次汇总核心指标，成就判定与顶部统计块共用，避免重复查询
  const metrics = await computeUserMetrics(user.id)
  const achievements = await computeAchievements(user.id, metrics)

  const unlockedCount = achievements.filter(a => a.unlocked).length

  // 词汇成长曲线（按天累计）
  const wordGrowth = await db.fsrsReview.findMany({
    where: { userId: user.id, cardType: 'word' },
    orderBy: { reviewedAt: 'asc' },
    select: { reviewedAt: true, cardId: true },
  })
  // 跨天去重：同一单词只在首次复习当天计入，避免复习日重复累加
  const seenCards = new Set<string>()
  const growthByDay: Record<string, number> = {}
  for (const r of wordGrowth) {
    if (seenCards.has(r.cardId)) continue
    seenCards.add(r.cardId)
    const day = localDateStr(r.reviewedAt)
    growthByDay[day] = (growthByDay[day] || 0) + 1
  }
  const growthArray = Object.entries(growthByDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, count]) => ({ day, count }))
  let cumulative = 0
  const cumulativeGrowth = growthArray.map(g => {
    cumulative += g.count
    return { day: g.day, total: cumulative }
  })

  return NextResponse.json({
    stats: {
      totalMinutes: metrics.totalMinutes,
      totalKeys: metrics.totalKeys,
      wordLearned: metrics.wordLearned,
      sentenceLearned: metrics.sentenceLearned,
      articleRead: metrics.articleRead,
      chineseDone: metrics.chineseDone,
      keyboardCompleted: metrics.keyboardCompleted,
      bestWpm: metrics.bestWpm,
      streak: metrics.streak,
      activeDays: metrics.activeDays,
    },
    achievements,
    unlockedCount,
    totalCount: achievements.length,
    cumulativeGrowth,
  })
}
