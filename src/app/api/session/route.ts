import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { schedule, rateTyping, createNewCard, Rating, type FsrsCardState } from '@/lib/fsrs'
import { getSettings } from '@/lib/settings'
import { localDateStr } from '@/lib/datetime'
import { computeAchievements } from '@/lib/achievements'

/**
 * 提交练习结果（通用）
 * body: {
 *   module: 'keyboard'|'word'|'sentence'|'article'|'chinese'|'listening',
 *   subModule?: string,
 *   durationMs: number,
 *   totalKeys, correctKeys, totalChars,
 *   records: [{ cardType?, cardId?, targetText, inputText, durationMs, totalKeys, errorKeys, rating? }],
 *   level?, score?, stars?  // 关卡用
 * }
 */
const VALID_MODULES = new Set(['keyboard', 'word', 'sentence', 'article', 'chinese', 'listening'])
// 纳入 FSRS 调度的学科：英语打字（word/sentence）与古诗词背诵（chinese，独立学科队列）；
// article/listening 属理解型练习，不建卡、不参与复习调度
const FSRS_CARD_TYPES = new Set(['word', 'sentence', 'chinese'])

// 数值兜底：非法/负数一律归零，防御异常 payload
const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)

export async function POST(req: NextRequest) {
  try {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const body = await req.json()
  const { module, subModule, records = [], level, score, stars } = body

  // payload 基础校验：非法模块/超量记录直接拒绝
  if (typeof module !== 'string' || !VALID_MODULES.has(module)) {
    return NextResponse.json({ error: '非法模块' }, { status: 400 })
  }
  if (!Array.isArray(records) || records.length > 200) {
    return NextResponse.json({ error: '记录格式非法' }, { status: 400 })
  }
  for (const r of records) {
    if (!r || typeof r.targetText !== 'string') {
      return NextResponse.json({ error: '记录格式非法' }, { status: 400 })
    }
  }

  const settings = await getSettings(user.id)

  const totalKeys = num(body.totalKeys)
  const correctKeys = Math.min(num(body.correctKeys), totalKeys)
  const totalChars = num(body.totalChars)
  // 单次时长按 singleLimitMin 截断，防止挂机/异常时长灌水统计
  const durationMs = Math.min(num(body.durationMs), settings.singleLimitMin * 60000)

  // 提交前成就快照（用于计算本次新解锁）
  const achievementsBefore = new Set(
    (await computeAchievements(user.id)).filter(a => a.unlocked).map(a => a.id)
  )

  // 时长限制改为「开始练习时」拦截（见各内容 GET 接口）；
  // 提交时只记录状态不拒绝，避免用户练完后 FSRS 成果被丢弃
  const today = localDateStr()
  const todayStat = await db.dailyStat.upsert({
    where: { userId_date: { userId: user.id, date: today } },
    update: {},
    create: { userId: user.id, date: today },
  })
  const usedMinBefore = Math.floor(todayStat.totalMs / 60000)

  // 计算 WPM 和准确率
  const wpm = durationMs > 0 ? Math.round((correctKeys / 5) / (durationMs / 60000)) : 0
  const accuracy = totalKeys > 0 ? Math.round((correctKeys / totalKeys) * 1000) / 10 : 0

  // 创建会话
  const session = await db.typingSession.create({
    data: {
      userId: user.id,
      module,
      subModule: subModule || null,
      durationMs,
      totalKeys,
      correctKeys,
      errorKeys: totalKeys - correctKeys,
      totalChars,
      wpm,
      accuracy,
      status: 'completed',
      score: score ?? null,
      stars: stars ?? null,
      endedAt: new Date(),
    },
  })

  // 写入逐条记录 + 更新FSRS卡片
  // Easy 档速度基准跟随解锁门槛（默认 40 WPM → 基准 30），避免写死不随孩子水平成长
  const targetWpm = Math.max(20, Math.round(settings.wpmUnlockThreshold * 0.75))
  let allCorrectKeys = 0
  let allTotalKeys = 0
  for (const r of records) {
    const rWpm = r.durationMs > 0 ? Math.round((r.correctKeys ?? 0) / 5 / (r.durationMs / 60000)) : 0
    const rAcc = r.totalKeys > 0 ? Math.round((r.correctKeys / r.totalKeys) * 1000) / 10 : 0
    const isCorrect = rAcc >= 80
    // 显式 rating 校验（1=Again..4=Easy 整数），非法值视为未提供
    const hasExplicitRating = typeof r.rating === 'number' && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 4
    let rating = hasExplicitRating ? r.rating : rateTyping(rAcc / 100, rWpm, r.durationMs, targetWpm)

    // 教研降权规则（仅针对打字自动评级；显式自评如古诗词背诵是真实提取，不降权）：
    // 1) 新卡首次记录（cardState=0，多为照打/编码环节）封顶 Hard，避免首间隔被虚假拉长
    if (!hasExplicitRating && r.cardState === 0 && rating > 2) rating = 2
    // 2) 使用了提示（支架）的提取封顶 Hard，避免 R 被高估
    if (typeof r.hintCount === 'number' && r.hintCount > 0 && rating > 2) rating = 2

    await db.typingRecord.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        module,
        cardType: r.cardType || null,
        cardId: r.cardId ? String(r.cardId) : null,
        targetText: r.targetText,
        inputText: r.inputText || null,
        durationMs: r.durationMs || 0,
        totalKeys: r.totalKeys || 0,
        errorKeys: Array.isArray(r.errorKeys) ? r.errorKeys.length : (r.errorKeys || 0),
        accuracy: rAcc,
        wpm: rWpm,
        isCorrect,
        rating,
        errorKeysList: r.errorKeys ? JSON.stringify(r.errorKeys) : null,
      },
    })

    allCorrectKeys += r.correctKeys || 0
    allTotalKeys += r.totalKeys || 0

    // 更新 FSRS 卡片（仅限 word/sentence/chinese 三类学科卡；article/listening 不建卡）
    // 守卫：零击键记录（背诵自评等非打字场景）必须显式提供合法 rating，
    // 否则自动评级会误判为 Again 并惩罚卡片
    if (r.cardType && r.cardId && FSRS_CARD_TYPES.has(r.cardType)) {
      const hasTyping = (r.totalKeys || 0) > 0
      if (hasTyping || hasExplicitRating) {
        const errCount = Array.isArray(r.errorKeys) ? r.errorKeys.length : (r.errorKeys || 0)
        // 考前突击：目标保留率临时提到 0.95，压实短期记忆
        const retention = settings.examCramMode ? 0.95 : settings.fsrsRetention
        await updateFsrsCard(user.id, r.cardType, String(r.cardId), rating as Rating, r.durationMs || 0, rAcc, errCount, retention, settings.fsrsMaxInterval)
      }
    }
  }

  // 更新今日统计
  // 对单词模块，区分新词和复习词
  let newWordCount = 0
  let reviewWordCount = 0
  if (module === 'word') {
    for (const r of records) {
      // cardState=0 或无cardState的是新词
      if (r.cardState === 0 || (!r.cardState && r.cardType === 'word')) {
        newWordCount++
      } else {
        reviewWordCount++
      }
    }
  }
  await updateDailyStat(user.id, today, module, durationMs, totalKeys, correctKeys, wpm, accuracy, records.length, newWordCount, reviewWordCount)

  // 更新关卡进度
  if (module === 'keyboard' && level) {
    const passed = wpm >= (body.passWpm || 20) && accuracy >= (body.passAccuracy || 90)
    await upsertProgress(user.id, 'keyboard', level, wpm, accuracy, stars || (passed ? (wpm >= (body.passWpm || 20) * 1.5 ? 3 : wpm >= (body.passWpm || 20) * 1.2 ? 2 : 1) : 0), passed)
  }

  // 提交后对比，得出本次新解锁成就
  const newAchievements = (await computeAchievements(user.id))
    .filter(a => a.unlocked && !achievementsBefore.has(a.id))
    .map(a => ({ id: a.id, name: a.name, icon: a.icon, desc: a.desc }))

  return NextResponse.json({
    session: { id: session.id, wpm, accuracy },
    wpm,
    accuracy,
    allCorrectKeys,
    allTotalKeys,
    newAchievements,
    dailyLimit: {
      exceeded: usedMinBefore >= settings.dailyLimitMin,
      usedMin: usedMinBefore,
      limitMin: settings.dailyLimitMin,
    },
  })
  } catch (e: any) {
    console.error('[session] submit error:', e)
    return NextResponse.json({ error: '提交失败，请重试' }, { status: 500 })
  }
}

async function updateFsrsCard(userId: string, cardType: string, cardId: string, rating: Rating, responseMs: number, accuracy: number, errorCount: number, retention?: number, maxInterval?: number) {
  await db.$transaction(async (tx) => {
    const existing = await tx.fsrsCard.findUnique({
      where: { userId_cardType_cardId: { userId, cardType, cardId } },
    })
    const currentState: FsrsCardState = existing
      ? {
          stability: existing.stability,
          difficulty: existing.difficulty,
          retrievability: existing.retrievability,
          due: existing.due,
          lastReview: existing.lastReview,
          reps: existing.reps,
          lapses: existing.lapses,
          state: existing.state,
        }
      : createNewCard()

    const newState = schedule(currentState, rating, responseMs, new Date(), retention, maxInterval)

    await tx.fsrsCard.upsert({
      where: { userId_cardType_cardId: { userId, cardType, cardId } },
      update: {
        stability: newState.stability,
        difficulty: newState.difficulty,
        retrievability: newState.retrievability,
        due: newState.due,
        lastReview: newState.lastReview,
        reps: newState.reps,
        lapses: newState.lapses,
        state: newState.state,
        totalTyping: { increment: 1 },
        totalErrors: { increment: errorCount },
      },
      create: {
        userId, cardType, cardId,
        stability: newState.stability,
        difficulty: newState.difficulty,
        retrievability: newState.retrievability,
        due: newState.due,
        lastReview: newState.lastReview,
        reps: newState.reps,
        lapses: newState.lapses,
        state: newState.state,
        totalTyping: 1,
        totalErrors: errorCount,
      },
    })

    await tx.fsrsReview.create({
      data: { userId, cardType, cardId, rating, state: newState.state, stability: newState.stability, difficulty: newState.difficulty, responseMs, accuracy, errorCount },
    })
  })
}

async function updateDailyStat(userId: string, date: string, module: string, durationMs: number, totalKeys: number, correctKeys: number, wpm: number, accuracy: number, recordCount: number, newWordCount: number = 0, reviewWordCount: number = 0) {
  // 事务内先原子累加，再基于累加后的最新值回写均值，避免并发提交下读改写竞态
  await db.$transaction(async (tx) => {
    await tx.dailyStat.upsert({
      where: { userId_date: { userId, date } },
      update: {},
      create: { userId, date },
    })
    const updates: any = {
      totalMs: { increment: durationMs },
      totalKeys: { increment: totalKeys },
      correctKeys: { increment: correctKeys },
    }
    if (module === 'keyboard') updates.keyboardMs = { increment: durationMs }
    if (module === 'word') {
      updates.wordNew = { increment: newWordCount }
      updates.wordReview = { increment: reviewWordCount }
      updates.wordCorrect = { increment: Math.floor(recordCount * accuracy / 100) }
    }
    if (module === 'sentence') updates.sentenceDone = { increment: recordCount }
    if (module === 'article') updates.articleDone = { increment: recordCount }
    if (module === 'chinese') updates.chineseDone = { increment: recordCount }
    if (module === 'listening') updates.listeningDone = { increment: recordCount }

    const updated = await tx.dailyStat.update({ where: { userId_date: { userId, date } }, data: updates })

    await tx.dailyStat.update({
      where: { id: updated.id },
      data: {
        avgWpm: updated.totalMs > 0 ? Math.round((updated.correctKeys / 5) / (updated.totalMs / 60000) * 10) / 10 : 0,
        avgAccuracy: updated.totalKeys > 0 ? Math.round((updated.correctKeys / updated.totalKeys) * 1000) / 10 : 0,
      },
    })
  })
}

async function upsertProgress(userId: string, module: string, level: number, wpm: number, accuracy: number, stars: number, passed: boolean) {
  const existing = await db.userProgress.findUnique({
    where: { userId_module_level: { userId, module, level } },
  })
  if (existing) {
    await db.userProgress.update({
      where: { id: existing.id },
      data: {
        bestWpm: Math.max(existing.bestWpm, wpm),
        bestAccuracy: Math.max(existing.bestAccuracy, accuracy),
        stars: Math.max(existing.stars, stars),
        attempts: { increment: 1 },
        status: passed ? 'completed' : (existing.status === 'completed' ? 'completed' : 'active'),
        completedAt: passed && !existing.completedAt ? new Date() : existing.completedAt,
      },
    })
  } else {
    await db.userProgress.create({
      data: {
        userId, module, level,
        status: passed ? 'completed' : 'active',
        bestWpm: wpm,
        bestAccuracy: accuracy,
        stars: passed ? stars : 0,
        attempts: 1,
        completedAt: passed ? new Date() : null,
      },
    })
  }
  // 解锁下一关
  if (passed) {
    const next = await db.userProgress.findUnique({
      where: { userId_module_level: { userId, module, level: level + 1 } },
    })
    if (!next) {
      await db.userProgress.create({
        data: { userId, module, level: level + 1, status: 'active' },
      })
    } else if (next.status === 'locked') {
      await db.userProgress.update({ where: { id: next.id }, data: { status: 'active' } })
    }
  }
}
