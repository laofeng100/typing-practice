import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { localDateStr } from '@/lib/datetime'

// 获取用户键位统计热力图数据
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  // 键位诊断只看近 90 天：全量历史会被早期练习习惯稀释（学生进步后旧错误仍占权重），
  // 且随练习时间增长查询无上限；趋势图另有 30 天窗口
  const KEY_STATS_WINDOW_DAYS = 90
  const keyStatsWindowStart = new Date(Date.now() - KEY_STATS_WINDOW_DAYS * 86400000)
  const records = await db.typingRecord.findMany({
    where: { userId: user.id, createdAt: { gte: keyStatsWindowStart } },
    select: { errorKeysList: true, totalKeys: true, errorKeys: true },
  })

  const keyStats: Record<string, { total: number; errors: number; accuracy: number }> = {}
  let totalAllKeys = 0
  let totalAllErrors = 0

  for (const r of records) {
    let errs: string[] = []
    try { const p = r.errorKeysList ? JSON.parse(r.errorKeysList) : []; errs = Array.isArray(p) ? p : [] } catch { errs = [] }
    totalAllKeys += r.totalKeys
    totalAllErrors += r.errorKeys
    for (const k of errs) {
      const key = k.toLowerCase()
      if (!keyStats[key]) keyStats[key] = { total: 0, errors: 0, accuracy: 100 }
      keyStats[key].errors++
    }
  }

  const overallAccuracy = totalAllKeys > 0 ? (totalAllKeys - totalAllErrors) / totalAllKeys : 1
  const errorRate = 1 - overallAccuracy

  for (const key of Object.keys(keyStats)) {
    const errs = keyStats[key].errors
    const estimatedTotal = errorRate > 0 ? Math.max(errs, Math.round(errs / errorRate)) : errs
    keyStats[key].total = estimatedTotal
    keyStats[key].accuracy = estimatedTotal > 0 ? Math.round((1 - errs / estimatedTotal) * 1000) / 10 : 100
  }

  const moduleStats = await db.typingSession.groupBy({
    by: ['module'],
    where: { userId: user.id },
    _count: true,
    _avg: { wpm: true, accuracy: true },
  })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
  const recentRecords = await db.typingRecord.findMany({
    where: { userId: user.id, createdAt: { gte: thirtyDaysAgo } },
    select: { createdAt: true, totalKeys: true, errorKeys: true },
    orderBy: { createdAt: 'asc' },
  })

  const dailyStats: Record<string, { keys: number; errors: number }> = {}
  for (const r of recentRecords) {
    const day = localDateStr(r.createdAt)
    if (!dailyStats[day]) dailyStats[day] = { keys: 0, errors: 0 }
    dailyStats[day].keys += r.totalKeys
    dailyStats[day].errors += r.errorKeys
  }

  return NextResponse.json({
    keyStats,
    totalAllKeys,
    totalAllErrors,
    overallAccuracy: Math.round(overallAccuracy * 1000) / 10,
    moduleStats,
    dailyStats,
  })
}
