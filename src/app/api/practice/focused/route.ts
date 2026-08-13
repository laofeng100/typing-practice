import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { checkDailyLimit } from '@/lib/settings'
import { calculateRetrievability } from '@/lib/fsrs'

// 获取专项练习内容
// type: keys（薄弱键）/ words（错题单词）/ sentences（错题句子）
// focusId: 从错题本「立即攻克」跳入时指定的卡片ID，置顶优先练
export async function GET(req: Request) {
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
  const type = searchParams.get('type') || 'keys'
  // focusId 按原始字符串透传：word 卡 cardId 为 head_word（如 "about"），sentence 卡为数字 id 字符串，
  // 两者都以字符串形式存于 FsrsCard.cardId，直接字符串匹配即可（不再强制数字解析，否则 word 置顶失效）
  const focusIdRaw = searchParams.get('focusId')
  const focusId = focusIdRaw && focusIdRaw.length > 0 && focusIdRaw.length <= 64 ? focusIdRaw : null
  const now = new Date()
  // 错题卡排序：实时可提取性升序（最危险的优先），focusId 指定卡置顶
  const sortWeakCards = (cards: any[], take: number) => {
    const sorted = cards
      .map(c => ({ ...c, liveR: c.state > 0 ? calculateRetrievability(c, now) : 1 }))
      .sort((a: any, b: any) => a.liveR - b.liveR || b.difficulty - a.difficulty)
    if (focusId) {
      const idx = sorted.findIndex(c => c.cardId === focusId)
      if (idx > 0) sorted.unshift(sorted.splice(idx, 1)[0])
    }
    return sorted.slice(0, take)
  }

  if (type === 'keys') {
    // 薄弱键专项：找出错误最多的键，生成针对性练习文本
    // 窗口限制：只看近 90 天（与 stats/keys 一致），避免全量历史查询无上限（错误习惯随进步改变，旧数据会稀释诊断）
    const KEY_STATS_WINDOW_DAYS = 90
    const windowStart = new Date(Date.now() - KEY_STATS_WINDOW_DAYS * 86400000)
    const records = await db.typingRecord.findMany({
      where: { userId: user.id, createdAt: { gte: windowStart } },
      select: { errorKeysList: true },
    })
    const errorMap: Record<string, number> = {}
    for (const r of records) {
      let errs: string[] = []
      try { const p = r.errorKeysList ? JSON.parse(r.errorKeysList) : []; errs = Array.isArray(p) ? p : [] } catch { errs = [] }
      for (const k of errs) errorMap[k.toLowerCase()] = (errorMap[k.toLowerCase()] || 0) + 1
    }
    const weakKeys = Object.entries(errorMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0])

    // 如果没有数据，使用默认薄弱键
    const targetKeys = weakKeys.length > 0 ? weakKeys : ['a', 's', 'd', 'f', 'j', 'k', 'l', ';']

    // 生成针对性练习文本（每个键强化训练）
    const exercises: { title: string; text: string; focusKeys: string[] }[] = []
    // 练习1：单键强化
    for (const k of targetKeys.slice(0, 4)) {
      exercises.push({
        title: `${k.toUpperCase()} 键强化`,
        text: `${k} ${k} ${k} ${k} ${k} ${k} ${k} ${k} ${k} ${k}`,
        focusKeys: [k],
      })
    }
    // 练习2：双键交替
    if (targetKeys.length >= 2) {
      const pairs: string[][] = []
      for (let i = 0; i < targetKeys.length - 1; i += 2) {
        pairs.push([targetKeys[i], targetKeys[i + 1]])
      }
      for (const [a, b] of pairs.slice(0, 3)) {
        exercises.push({
          title: `${a.toUpperCase()} / ${b.toUpperCase()} 交替`,
          text: `${a}${b} ${a}${b} ${a}${b} ${a}${b} ${a}${b} ${a}${b} ${a}${b} ${a}${b}`,
          focusKeys: [a, b],
        })
      }
    }
    // 练习3：综合单词（包含薄弱键的常见单词，取自当前教材词表）
    const wordsWithWeakKeys: string[] = []
    const words = await db.wordDict.findMany({ where: { books: { some: { bookId: user.bookId } } }, take: 200, select: { en: true } })
    for (const w of words) {
      const lower = w.en.toLowerCase()
      if (targetKeys.some(k => lower.includes(k)) && w.en.length >= 3 && w.en.length <= 8) {
        wordsWithWeakKeys.push(w.en)
        if (wordsWithWeakKeys.length >= 10) break
      }
    }
    if (wordsWithWeakKeys.length > 0) {
      exercises.push({
        title: '薄弱键综合应用',
        text: wordsWithWeakKeys.join(' '),
        focusKeys: targetKeys,
      })
    }

    return NextResponse.json({ type: 'keys', weakKeys: targetKeys, exercises, errorStats: Object.fromEntries(weakKeys.map(k => [k, errorMap[k] || 0])) })
  }

  if (type === 'words') {
    // 错题单词专项：门槛与错题本一致（lapses≥1 或 totalErrors≥2），
    // 不用 difficulty>=5 作门槛——首学评 Hard 难度即达 5.11，会把所有首学 Hard 的卡全量混入专项队列
    const weakCardsRaw = await db.fsrsCard.findMany({
      where: {
        userId: user.id,
        cardType: 'word',
        OR: [{ lapses: { gte: 1 } }, { totalErrors: { gte: 2 } }, ...(focusId ? [{ cardId: focusId }] : [])],
      },
      take: 100,
    })
    const weakCards = sortWeakCards(weakCardsRaw, 15)
    // 批量查询，避免 N+1（word 卡 cardId 为 head_word 字符串）
    const weakIds = weakCards.map(c => c.cardId)
    const wordRows = await db.wordDict.findMany({ where: { id: { in: weakIds } }, select: { id: true, en: true, zh: true, pos: true, usPhone: true } })
    const wordMap = new Map(wordRows.map(w => [w.id, w]))
    const words: any[] = []
    for (const c of weakCards) {
      const w = wordMap.get(c.cardId)
      if (w) words.push({ ...w, cardState: c.state, difficulty_card: c.difficulty, lapses: c.lapses, totalErrors: c.totalErrors })
    }
    return NextResponse.json({ type: 'words', words, count: words.length })
  }

  if (type === 'sentences') {
    // 错题句子专项：门槛与错题本一致（lapses≥1 或 totalErrors≥2），不用 difficulty 门槛
    const weakCardsRaw = await db.fsrsCard.findMany({
      where: {
        userId: user.id,
        cardType: 'sentence',
        OR: [{ lapses: { gte: 1 } }, { totalErrors: { gte: 2 } }, ...(focusId ? [{ cardId: focusId }] : [])],
      },
      take: 100,
    })
    const weakCards = sortWeakCards(weakCardsRaw, 10)
    // 批量查询，避免 N+1
    const weakIds = weakCards.map(c => parseInt(c.cardId)).filter(n => !isNaN(n))
    const sentenceRows = await db.sentence.findMany({ where: { id: { in: weakIds } } })
    const sentenceMap = new Map(sentenceRows.map(s => [s.id, s]))
    const sentences: any[] = []
    for (const c of weakCards) {
      const s = sentenceMap.get(parseInt(c.cardId))
      if (s) sentences.push({ ...s, cardState: c.state, difficulty_card: c.difficulty, lapses: c.lapses })
    }
    return NextResponse.json({ type: 'sentences', sentences, count: sentences.length })
  }

  return NextResponse.json({ error: '未知类型' }, { status: 400 })
}
