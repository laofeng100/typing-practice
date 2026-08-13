/**
 * 流程测试 13/14：健壮性——异常 payload / 边界输入 / 并发提交（深度测试第 2 轮）
 * ① 非法 module → 400
 * ② records 超 200 / 缺 targetText → 400
 * ③ 非法 rating（99）→ 回退自动评级（不 500，卡正常建）
 * ④ 负数/NaN 数值 → 归零（不 500，会话正常落库）
 * ⑤ 空 records → 200（会话仍落库）
 * ⑥ 并发提交：两个 session 同时提交不同卡 → 都成功（SQLite WAL 并发安全）
 * ⑦ 同一卡重复提交 → 幂等更新（reps 累加，不重复建卡）
 */
import { test, expect } from '@playwright/test'
import { query, waitFor } from './helpers'

const USER = 'e2e-didi'

test('健壮性：异常 payload 拒绝/容错 + 并发提交 + 幂等更新', async ({ page }) => {
  // 从词库直取 20 个未学词（mode=new 只返回 10 个不够本流程用量；排除前面流程已学的卡）
  const learned = query(
    `SELECT cardId FROM FsrsCard WHERE userId=? AND cardType='word' AND state>0`,
    [USER]
  ).map((r: any) => r.cardId)
  const learnedPh = learned.map(() => '?').join(',')
  const allNew = learned.length > 0
    ? query(
        `SELECT id, en FROM WordDict WHERE length(en) >= 4 AND id NOT IN (${learnedPh}) ORDER BY id LIMIT 20`,
        [...learned]
      )
    : query(`SELECT id, en FROM WordDict WHERE length(en) >= 4 ORDER BY id LIMIT 20`)
  expect(allNew.length).toBe(20)
  const record = (w: any, extra: any = {}) => ({
    cardType: 'word', cardId: w.id, cardState: 0, targetText: w.en, inputText: w.en,
    durationMs: 3000, totalKeys: w.en.length, correctKeys: w.en.length,
    errorKeys: [], hintCount: 0, rating: 2, ...extra,
  })

  // ===== ① 非法 module → 400 =====
  const r1 = await page.request.post('/api/session', { data: { module: 'hacking', records: [] } })
  expect(r1.status()).toBe(400)

  // ===== ② records 超 200 / 缺 targetText → 400 =====
  const tooMany = Array.from({ length: 201 }, (_, i) => ({ targetText: `word${i}` }))
  const r2 = await page.request.post('/api/session', { data: { module: 'word', records: tooMany } })
  expect(r2.status()).toBe(400)
  const r3 = await page.request.post('/api/session', { data: { module: 'word', records: [{ cardId: 'x' }] } })
  expect(r3.status()).toBe(400)

  // ===== ③ 非法 rating（99）→ 回退自动评级，卡正常建 =====
  const w1 = allNew[0]
  const r4 = await page.request.post('/api/session', {
    data: {
      module: 'word', subModule: 'new', durationMs: 3000, totalKeys: 0, correctKeys: 0, totalChars: 0,
      records: [record(w1, { rating: 99 })],
    },
  })
  expect(r4.ok(), `非法 rating 应容错回退: ${await r4.text()}`).toBeTruthy()
  await waitFor('非法 rating 卡正常创建', async () =>
    query(`SELECT COUNT(*) AS c FROM FsrsCard WHERE userId=? AND cardId=?`, [USER, w1.id])[0].c === 1
  )
  // 自动评级 + 新卡封顶 → rating=2（Hard）
  const autoRating = query(`SELECT rating FROM FsrsReview WHERE userId=? AND cardId=?`, [USER, w1.id])[0].rating
  expect(autoRating).toBe(2)

  // ===== ④ 负数/NaN 数值 → 归零容错 =====
  const w2 = allNew[1]
  const r5 = await page.request.post('/api/session', {
    data: {
      module: 'word', subModule: 'new', durationMs: -5000, totalKeys: Number.NaN, correctKeys: -1, totalChars: 0,
      records: [record(w2)],
    },
  })
  expect(r5.ok(), `负数/NaN 应容错: ${await r5.text()}`).toBeTruthy()
  // 存在性断言（avoid startedAt 秒级精度同秒歧义）：负数/NaN 全部归零的会话已落库
  await waitFor('归零容错会话落库', async () => {
    const c = query(
      `SELECT COUNT(*) AS c FROM TypingSession WHERE userId=? AND durationMs=0 AND totalKeys=0 AND correctKeys=0`,
      [USER]
    )
    return c[0].c >= 1
  })

  // ===== ⑤ 空 records → 200，会话仍落库 =====
  const sessionsBefore = query(`SELECT COUNT(*) AS c FROM TypingSession WHERE userId=?`, [USER])[0].c
  const r6 = await page.request.post('/api/session', { data: { module: 'word', durationMs: 1000, totalKeys: 0, correctKeys: 0, totalChars: 0, records: [] } })
  expect(r6.ok(), `空 records 应 200: ${await r6.text()}`).toBeTruthy()
  expect(query(`SELECT COUNT(*) AS c FROM TypingSession WHERE userId=?`, [USER])[0].c).toBe(sessionsBefore + 1)

  // ===== ⑥ 并发提交：两个 session 同时提交 5+5 张不同卡 → 都成功 =====
  const batchA = allNew.slice(2, 7)
  const batchB = allNew.slice(7, 12)
  const postBatch = (batch: any[]) => page.request.post('/api/session', {
    data: {
      module: 'word', subModule: 'new', durationMs: 3000, totalKeys: 0, correctKeys: 0, totalChars: 0,
      records: batch.map(w => record(w)),
    },
  })
  const [ra, rb] = await Promise.all([postBatch(batchA), postBatch(batchB)])
  expect(ra.ok(), `并发 A 失败: ${await ra.text()}`).toBeTruthy()
  expect(rb.ok(), `并发 B 失败: ${await rb.text()}`).toBeTruthy()
  await waitFor('并发 10 卡全部落库', async () => {
    const ids = [...batchA, ...batchB].map((w: any) => w.id)
    const c = query(
      `SELECT COUNT(*) AS c FROM FsrsCard WHERE userId=? AND cardId IN (${ids.map(() => '?').join(',')})`,
      [USER, ...ids]
    )
    return c[0].c === 10
  })

  // ===== ⑦ 同一卡重复提交 → 幂等更新（reps 累加，不重复建卡） =====
  const dup = batchA[0]
  const before = query(`SELECT reps, totalTyping FROM FsrsCard WHERE userId=? AND cardId=?`, [USER, dup.id])[0]
  const r7 = await page.request.post('/api/session', {
    data: {
      module: 'word', subModule: 'review', durationMs: 3000, totalKeys: 0, correctKeys: 0, totalChars: 0,
      records: [record(dup, { cardState: 2, rating: 3 })],
    },
  })
  expect(r7.ok(), `重复提交失败: ${await r7.text()}`).toBeTruthy()
  await waitFor('重复提交后 reps 累加', async () => {
    const after = query(`SELECT reps, totalTyping FROM FsrsCard WHERE userId=? AND cardId=?`, [USER, dup.id])[0]
    return after.reps === before.reps + 1 && after.totalTyping === before.totalTyping + 1
  })
  // 卡数量仍为 1（未重复建卡）
  expect(query(`SELECT COUNT(*) AS c FROM FsrsCard WHERE userId=? AND cardId=?`, [USER, dup.id])[0].c).toBe(1)
})
