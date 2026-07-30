import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { localDateStr } from '@/lib/datetime'

// 仪表盘：今日学习概览、进度、待复习数、键盘关卡状态
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const today = localDateStr()
  const settings = await getSettings(user.id)

  // 今日统计
  const todayStat = await db.dailyStat.upsert({
    where: { userId_date: { userId: user.id, date: today } },
    update: {},
    create: { userId: user.id, date: today },
  })

  // 关卡进度
  const keyboardProgress = await db.userProgress.findMany({
    where: { userId: user.id, module: 'keyboard' },
    orderBy: { level: 'asc' },
  })

  // 判断是否解锁单词/阅读练习
  // 需要键盘第6关达标 OR 最近一次综合 WPM >= 阈值
  let bestWpm = 0
  let bestAccuracy = 0
  for (const p of keyboardProgress) {
    if (p.bestWpm > bestWpm) bestWpm = p.bestWpm
    if (p.bestAccuracy > bestAccuracy) bestAccuracy = p.bestAccuracy
  }
  const keyboardUnlocked = keyboardProgress.length >= 6 && keyboardProgress.every(p => p.status === 'completed')
  const wpmQualified = bestWpm >= settings.wpmUnlockThreshold && bestAccuracy >= settings.accuracyUnlockThreshold
  const advancedUnlocked = keyboardUnlocked || wpmQualified // 键盘6关通关 或 WPM达标 均可解锁

  // 待复习卡片数（仅 FSRS 学科：单词/句子/古诗词，阅读与听力不参与调度）
  const FSRS_TYPES = ['word', 'sentence', 'chinese']
  const dueCards = await db.fsrsCard.count({
    where: { userId: user.id, cardType: { in: FSRS_TYPES }, due: { lte: new Date() }, state: { gt: 0 } },
  })
  const newCards = await db.fsrsCard.count({
    where: { userId: user.id, cardType: { in: FSRS_TYPES }, state: 0 },
  })

  // 单词进度（按学段）
  const wordProgress = await db.fsrsCard.groupBy({
    by: ['cardType'],
    where: { userId: user.id, cardType: 'word' },
    _count: true,
  })

  // 最近7天练习趋势
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const recentSessions = await db.typingSession.findMany({
    where: { userId: user.id, startedAt: { gte: sevenDaysAgo } },
    orderBy: { startedAt: 'asc' },
    select: { module: true, wpm: true, accuracy: true, durationMs: true, startedAt: true },
  })

  // 真实连续打卡天数（从今天/昨天往前连续有练习的天数）
  const practiceDays = await db.dailyStat.findMany({
    where: { userId: user.id, totalMs: { gt: 0 } },
    select: { date: true },
    orderBy: { date: 'desc' },
    take: 400,
  })
  const daySet = new Set(practiceDays.map(d => d.date))
  let streak = 0
  const cursor = new Date()
  if (!daySet.has(localDateStr(cursor))) cursor.setDate(cursor.getDate() - 1) // 今天还没练不算断签
  while (daySet.has(localDateStr(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  const { phone: _phone, ...safeUser } = user
  const maskedSettings = { ...settings, ttsToken: settings.ttsToken ? '••••••••' : '' }
  return NextResponse.json({
    user: safeUser,
    settings: maskedSettings,
    todayStat,
    keyboardProgress,
    keyboardUnlocked,
    advancedUnlocked,
    bestWpm,
    bestAccuracy,
    dueCards,
    newCards,
    wordProgress,
    recentSessions,
    streak,
  })
}
