import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { localDateStr } from '@/lib/datetime'

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const range = searchParams.get('range') || 'week'

  const now = new Date()
  let startDate: Date
  if (range === 'week') startDate = new Date(now.getTime() - 7 * 86400000)
  else if (range === 'month') startDate = new Date(now.getTime() - 30 * 86400000)
  else startDate = new Date(0)

  const sessions = await db.typingSession.findMany({
    where: { userId: user.id, startedAt: { gte: startDate } },
    orderBy: { startedAt: 'asc' },
  })
  const records = await db.typingRecord.findMany({
    where: { userId: user.id, createdAt: { gte: startDate } },
    orderBy: { createdAt: 'asc' },
  })
  // 仅统计参与 FSRS 调度的三类卡（article/listening 已退出 FSRS，存量卡不再展示）
  const allCards = await db.fsrsCard.findMany({
    where: { userId: user.id, cardType: { in: ['word', 'sentence', 'chinese'] } },
  })

  const totalMs = sessions.reduce((s, sess) => s + sess.durationMs, 0)
  const totalMinutes = Math.floor(totalMs / 60000)
  const totalKeys = sessions.reduce((s, sess) => s + sess.totalKeys, 0)
  const correctKeys = sessions.reduce((s, sess) => s + sess.correctKeys, 0)
  const overallAccuracy = totalKeys > 0 ? Math.round((correctKeys / totalKeys) * 1000) / 10 : 0
  const avgWpm = totalMs > 0 ? Math.round((correctKeys / 5) / (totalMs / 60000)) : 0
  const bestWpm = sessions.length > 0 ? Math.max(...sessions.map(s => s.wpm)) : 0

  const moduleStats: Record<string, { count: number; ms: number; keys: number; correct: number }> = {}
  for (const s of sessions) {
    if (!moduleStats[s.module]) moduleStats[s.module] = { count: 0, ms: 0, keys: 0, correct: 0 }
    moduleStats[s.module].count++
    moduleStats[s.module].ms += s.durationMs
    moduleStats[s.module].keys += s.totalKeys
    moduleStats[s.module].correct += s.correctKeys
  }

  const dailyMap: Record<string, { ms: number; keys: number; correct: number; sessions: number }> = {}
  for (const s of sessions) {
    const day = localDateStr(s.startedAt)
    if (!dailyMap[day]) dailyMap[day] = { ms: 0, keys: 0, correct: 0, sessions: 0 }
    dailyMap[day].ms += s.durationMs
    dailyMap[day].keys += s.totalKeys
    dailyMap[day].correct += s.correctKeys
    dailyMap[day].sessions++
  }
  const dailyArray = Object.entries(dailyMap).sort((a, b) => a[0].localeCompare(b[0]))

  const errorKeysMap: Record<string, number> = {}
  for (const r of records) {
    let errs: string[] = []
    try { const p = r.errorKeysList ? JSON.parse(r.errorKeysList) : []; errs = Array.isArray(p) ? p : [] } catch { errs = [] }
    for (const k of errs) errorKeysMap[k.toLowerCase()] = (errorKeysMap[k.toLowerCase()] || 0) + 1
  }
  const topErrorKeys = Object.entries(errorKeysMap).sort((a, b) => b[1] - a[1]).slice(0, 10)

  const cardsByType: Record<string, { total: number; learning: number; review: number; due: number }> = {}
  const nowDate = new Date()
  for (const c of allCards) {
    if (!cardsByType[c.cardType]) cardsByType[c.cardType] = { total: 0, learning: 0, review: 0, due: 0 }
    cardsByType[c.cardType].total++
    if (c.state === 1) cardsByType[c.cardType].learning++
    if (c.state === 2 || c.state === 3) cardsByType[c.cardType].review++
    if (c.due <= nowDate && c.state > 0) cardsByType[c.cardType].due++
  }

  const allDays = await db.dailyStat.findMany({
    where: { userId: user.id, totalMs: { gt: 0 } },
    orderBy: { date: 'desc' },
    select: { date: true },
  })
  // 连续打卡：从今天（若今天未练则从昨天）向前逐日回溯，与成就页算法一致
  const daySet = new Set(allDays.map(d => d.date))
  let streak = 0
  const cursor = new Date()
  if (!daySet.has(localDateStr(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (daySet.has(localDateStr(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  const activeDays = dailyArray.length

  const suggestions: string[] = []
  if (topErrorKeys.length > 0) {
    suggestions.push(`重点关注键位：${topErrorKeys.slice(0, 3).map(k => k[0].toUpperCase()).join('、')}，建议多加练习`)
  }
  if (avgWpm < 20) suggestions.push('打字速度还有提升空间，建议每天坚持15分钟键盘练习')
  else if (avgWpm < 40) suggestions.push('打字速度稳步提升中，继续保持！')
  else if (avgWpm >= 60) suggestions.push('打字速度优秀，可以挑战更高难度的内容')
  if (overallAccuracy < 85) suggestions.push('准确率偏低，练习时注意"先准后快"')
  if (cardsByType.word?.due > 0) suggestions.push(`有 ${cardsByType.word.due} 个单词待复习，及时巩固记忆`)
  if (streak >= 7) suggestions.push(`已连续打卡 ${streak} 天，习惯养成中，非常棒！`)
  if (activeDays < 3 && range === 'week') suggestions.push('本周练习天数较少，建议增加练习频率')

  let progressComparison: any = null
  if (range === 'week' || range === 'month') {
    const prevStart = new Date(startDate.getTime() - (now.getTime() - startDate.getTime()))
    const prevSessions = await db.typingSession.findMany({
      where: { userId: user.id, startedAt: { gte: prevStart, lt: startDate } },
    })
    const prevMs = prevSessions.reduce((s, sess) => s + sess.durationMs, 0)
    const prevKeys = prevSessions.reduce((s, sess) => s + sess.totalKeys, 0)
    const prevCorrect = prevSessions.reduce((s, sess) => s + sess.correctKeys, 0)
    const prevWpm = prevMs > 0 ? Math.round((prevCorrect / 5) / (prevMs / 60000)) : 0
    const prevAcc = prevKeys > 0 ? Math.round((prevCorrect / prevKeys) * 1000) / 10 : 0
    progressComparison = {
      wpm: { prev: prevWpm, curr: avgWpm, delta: avgWpm - prevWpm },
      accuracy: { prev: prevAcc, curr: overallAccuracy, delta: Math.round((overallAccuracy - prevAcc) * 10) / 10 },
      minutes: { prev: Math.floor(prevMs / 60000), curr: totalMinutes, delta: totalMinutes - Math.floor(prevMs / 60000) },
    }
  }

  return NextResponse.json({
    range,
    summary: { totalMinutes, totalSessions: sessions.length, activeDays, streak, totalKeys, correctKeys, overallAccuracy, avgWpm, bestWpm },
    moduleStats,
    dailyArray,
    topErrorKeys,
    cardsByType,
    suggestions,
    progressComparison,
  })
}
