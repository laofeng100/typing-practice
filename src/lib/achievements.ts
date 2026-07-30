import { db } from './db'
import { localDateStr } from './datetime'

export interface Achievement {
  id: string
  name: string
  desc: string
  icon: string
  tier: number
  unlocked: boolean
  progress: number
  target: number
  category: string
}

// 用户核心汇总指标（成就墙统计块与成就解锁判定共用）
export interface UserMetrics {
  totalMinutes: number
  totalKeys: number
  wordLearned: number
  sentenceLearned: number
  articleRead: number
  chineseDone: number
  keyboardCompleted: number
  bestWpm: number
  activeDays: number
  streak: number
  sessionCount: number
}

// 一次性汇总用户核心指标（合并原本分散的多个 aggregate/count，供多处复用避免重复查询）
export async function computeUserMetrics(userId: string): Promise<UserMetrics> {
  const sessionAgg = await db.typingSession.aggregate({
    where: { userId },
    _sum: { durationMs: true, totalKeys: true },
    _max: { wpm: true },
    _count: true,
  })

  const wordLearned = await db.fsrsCard.count({ where: { userId, cardType: 'word', state: { gt: 0 } } })
  const sentenceLearned = await db.fsrsCard.count({ where: { userId, cardType: 'sentence', state: { gt: 0 } } })
  // 阅读已退出 FSRS，改用打字记录去重统计已读篇数
  const articleReadRecords = await db.typingRecord.findMany({
    where: { userId, module: 'article', cardId: { not: null } },
    distinct: ['cardId'],
    select: { cardId: true },
  })
  const articleRead = articleReadRecords.length
  const chineseDone = await db.fsrsCard.count({ where: { userId, cardType: 'chinese', state: { gt: 0 } } })
  const keyboardCompleted = await db.userProgress.count({ where: { userId, module: 'keyboard', status: 'completed' } })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
  const recentSessions = await db.typingSession.findMany({
    where: { userId, startedAt: { gte: thirtyDaysAgo } },
    select: { startedAt: true },
  })
  const activeDays = new Set(recentSessions.map(s => localDateStr(s.startedAt))).size

  // 连续打卡天数：从今天（若今天未练则从昨天）向前逐日回溯
  const practiceDays = await db.dailyStat.findMany({
    where: { userId, totalMs: { gt: 0 } },
    orderBy: { date: 'desc' },
    select: { date: true },
    take: 400,
  })
  const daySet = new Set(practiceDays.map(d => d.date))
  let streak = 0
  const cursor = new Date()
  if (!daySet.has(localDateStr(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (daySet.has(localDateStr(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  return {
    totalMinutes: Math.floor((sessionAgg._sum.durationMs || 0) / 60000),
    totalKeys: sessionAgg._sum.totalKeys || 0,
    wordLearned,
    sentenceLearned,
    articleRead,
    chineseDone,
    keyboardCompleted,
    bestWpm: sessionAgg._max.wpm || 0,
    activeDays,
    streak,
    sessionCount: sessionAgg._count,
  }
}

// 计算用户全部成就的当前解锁状态（成就墙与 session 提交后即时反馈共用）
// 可传入已算好的 metrics 复用，避免重复查询；不传则内部自行汇总
export async function computeAchievements(userId: string, metrics?: UserMetrics): Promise<Achievement[]> {
  const m = metrics ?? await computeUserMetrics(userId)
  const { totalMinutes, wordLearned, sentenceLearned, articleRead, chineseDone, keyboardCompleted, activeDays, streak, sessionCount } = m
  const bestWpm = m.bestWpm
  return [
    { id: 'first_login', name: '初次见面', desc: '首次登录系统', icon: '👋', tier: 1,
      unlocked: sessionCount > 0, progress: Math.min(sessionCount, 1), target: 1, category: '打卡' },
    { id: 'streak_3', name: '三日打卡', desc: '连续3天练习', icon: '🔥', tier: 1,
      unlocked: streak >= 3, progress: Math.min(streak, 3), target: 3, category: '打卡' },
    { id: 'streak_7', name: '一周坚持', desc: '连续7天练习', icon: '⚡', tier: 2,
      unlocked: streak >= 7, progress: Math.min(streak, 7), target: 7, category: '打卡' },
    { id: 'streak_30', name: '月度达人', desc: '连续30天练习', icon: '🏆', tier: 3,
      unlocked: streak >= 30, progress: Math.min(streak, 30), target: 30, category: '打卡' },
    { id: 'active_7', name: '活跃一周', desc: '30天内练习7天', icon: '📅', tier: 2,
      unlocked: activeDays >= 7, progress: Math.min(activeDays, 7), target: 7, category: '打卡' },

    { id: 'kb_level1', name: '基准起航', desc: '通过键盘第1关', icon: '⌨️', tier: 1,
      unlocked: keyboardCompleted >= 1, progress: Math.min(keyboardCompleted, 1), target: 1, category: '键盘' },
    { id: 'kb_level3', name: '初窥门径', desc: '通过键盘前3关', icon: '🎯', tier: 2,
      unlocked: keyboardCompleted >= 3, progress: Math.min(keyboardCompleted, 3), target: 3, category: '键盘' },
    { id: 'kb_all', name: '键盘达人', desc: '通过全部6关', icon: '🎖️', tier: 3,
      unlocked: keyboardCompleted >= 6, progress: Math.min(keyboardCompleted, 6), target: 6, category: '键盘' },
    { id: 'wpm_30', name: '小有所成', desc: '达到30 WPM', icon: '💨', tier: 2,
      unlocked: bestWpm >= 30, progress: Math.min(bestWpm, 30), target: 30, category: '键盘' },
    { id: 'wpm_50', name: '指尖飞舞', desc: '达到50 WPM', icon: '🚀', tier: 3,
      unlocked: bestWpm >= 50, progress: Math.min(bestWpm, 50), target: 50, category: '键盘' },
    { id: 'wpm_80', name: '闪电之手', desc: '达到80 WPM', icon: '⚡', tier: 4,
      unlocked: bestWpm >= 80, progress: Math.min(bestWpm, 80), target: 80, category: '键盘' },

    { id: 'word_10', name: '初学乍练', desc: '学习10个单词', icon: '📖', tier: 1,
      unlocked: wordLearned >= 10, progress: Math.min(wordLearned, 10), target: 10, category: '单词' },
    { id: 'word_50', name: '勤学苦练', desc: '学习50个单词', icon: '📚', tier: 2,
      unlocked: wordLearned >= 50, progress: Math.min(wordLearned, 50), target: 50, category: '单词' },
    { id: 'word_100', name: '词汇百关', desc: '学习100个单词', icon: '💯', tier: 3,
      unlocked: wordLearned >= 100, progress: Math.min(wordLearned, 100), target: 100, category: '单词' },
    { id: 'word_500', name: '词汇大师', desc: '学习500个单词', icon: '🎓', tier: 4,
      unlocked: wordLearned >= 500, progress: Math.min(wordLearned, 500), target: 500, category: '单词' },

    { id: 'sent_10', name: '造句入门', desc: '练习10个句子', icon: '✍️', tier: 1,
      unlocked: sentenceLearned >= 10, progress: Math.min(sentenceLearned, 10), target: 10, category: '句子' },
    { id: 'sent_50', name: '语法通', desc: '练习50个句子', icon: '📝', tier: 2,
      unlocked: sentenceLearned >= 50, progress: Math.min(sentenceLearned, 50), target: 50, category: '句子' },

    { id: 'read_5', name: '阅读新秀', desc: '完成5篇阅读', icon: '📰', tier: 1,
      unlocked: articleRead >= 5, progress: Math.min(articleRead, 5), target: 5, category: '阅读' },
    { id: 'read_20', name: '饱读诗书', desc: '完成20篇阅读', icon: '📚', tier: 2,
      unlocked: articleRead >= 20, progress: Math.min(articleRead, 20), target: 20, category: '阅读' },

    { id: 'cn_5', name: '诗书少年', desc: '背诵5篇中文', icon: '🏮', tier: 1,
      unlocked: chineseDone >= 5, progress: Math.min(chineseDone, 5), target: 5, category: '中文' },
    { id: 'cn_20', name: '国学达人', desc: '背诵20篇中文', icon: '🏯', tier: 3,
      unlocked: chineseDone >= 20, progress: Math.min(chineseDone, 20), target: 20, category: '中文' },

    { id: 'time_60', name: '一小时练习', desc: '累计练习60分钟', icon: '⏰', tier: 1,
      unlocked: totalMinutes >= 60, progress: Math.min(totalMinutes, 60), target: 60, category: '时长' },
    { id: 'time_300', name: '五小时坚持', desc: '累计练习300分钟', icon: '⏱️', tier: 2,
      unlocked: totalMinutes >= 300, progress: Math.min(totalMinutes, 300), target: 300, category: '时长' },
    { id: 'time_600', name: '十小时成就', desc: '累计练习600分钟', icon: '⌛', tier: 3,
      unlocked: totalMinutes >= 600, progress: Math.min(totalMinutes, 600), target: 600, category: '时长' },
  ]
}
