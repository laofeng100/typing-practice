/**
 * 流程测试 14/14：规模与性能——大数据量下积压防护与队列（深度测试第 3 轮）
 * ① 构造 300 张到期卡（3 批 × 100 提交，逼近 records 上限 200）
 * ② dueCount=300 → 积压防护触发：mixed 模式新词停发（newWords=0）
 * ③ review 队列按 wordReviewBatchSize(20) 截断返回，且耗时 < 5s（宽松性能阈值）
 * ④ 复习提交 20 张 → 成功且 due 延后（大数据量下事务正常）
 */
import { test, expect } from '@playwright/test'
import { query, exec, waitFor } from './helpers'

const USER = 'e2e-didi'

test('规模：300 卡到期 → 积压停发 + 队列截断 + 性能阈值', async ({ page }) => {
  // ===== ① 取 300 个未学词（全局词库，排除前面流程已学的卡） =====
  const learned = query(
    `SELECT cardId FROM FsrsCard WHERE userId=? AND cardType='word' AND state>0`,
    [USER]
  ).map((r: any) => r.cardId)
  const learnedPh = learned.map(() => '?').join(',')
  // SQL 中只有 NOT IN 的占位符（无 userId 列），参数数组只传 learned（勿多传 USER）
  const words = learned.length > 0
    ? query(
        `SELECT id, en FROM WordDict WHERE length(en) >= 4 AND id NOT IN (${learnedPh}) ORDER BY id LIMIT 300`,
        [...learned]
      )
    : query(`SELECT id, en FROM WordDict WHERE length(en) >= 4 ORDER BY id LIMIT 300`)
  expect(words.length).toBe(300)

  // ===== ② 3 批 × 100 提交（records 上限 200 之内，测试大批量事务） =====
  const record = (w: any) => ({
    cardType: 'word', cardId: w.id, cardState: 0, targetText: w.en, inputText: w.en,
    durationMs: 3000, totalKeys: w.en.length, correctKeys: w.en.length,
    errorKeys: [], hintCount: 0, rating: 2,
  })
  for (let b = 0; b < 3; b++) {
    const r = await page.request.post('/api/session', {
      data: {
        module: 'word', subModule: 'new', durationMs: 3000, totalKeys: 0, correctKeys: 0, totalChars: 0,
        records: words.slice(b * 100, b * 100 + 100).map(record),
      },
    })
    expect(r.ok(), `批 ${b + 1} 提交失败: ${await r.text()}`).toBeTruthy()
  }
  await waitFor('300 卡全部落库', async () =>
    query(`SELECT COUNT(*) AS c FROM FsrsCard WHERE userId=? AND cardType='word' AND state>0`, [USER])[0].c >= 300
  )

  // ===== ③ 仅快进本次 300 张到期（不误伤前面流程的卡）；基线记录前面流程已到期的卡（如 12 的 liveR 测试） =====
  const scaleIds = words.map((w: any) => w.id)
  const dueBefore = query(
    `SELECT COUNT(*) AS c FROM FsrsCard WHERE userId=? AND cardType='word' AND state>0 AND due<=?`,
    [USER, Date.now()]
  )[0].c
  exec(
    `UPDATE FsrsCard SET due=? WHERE userId=? AND cardType='word' AND cardId IN (${scaleIds.map(() => '?').join(',')})`,
    [Date.now() - 3600_000, USER, ...scaleIds]
  )

  // ===== ④ 积压防护：dueCount = 基线 + 300 > 20×5=100 → 新词停发 =====
  const t0 = Date.now()
  const mixed = await (await page.request.get('/api/word?mode=mixed')).json()
  const mixedMs = Date.now() - t0
  expect(mixed.stats.dueCount).toBe(dueBefore + 300)
  expect(mixed.newWords.length).toBe(0) // 积压停发
  expect(mixed.stats.backlog).toBe(true)

  // ===== ⑤ 复习队列：截断返回 20 张（wordReviewBatchSize），耗时 < 5s =====
  const t1 = Date.now()
  const review = await (await page.request.get('/api/word?mode=review')).json()
  const reviewMs = Date.now() - t1
  expect(review.reviewWords.length).toBe(20)
  expect(review.reviewWords.every((w: any) => w.cardState > 0)).toBeTruthy()
  expect(reviewMs).toBeLessThan(5000)

  // ===== ⑥ 复习提交 20 张 → 成功且 due 延后 =====
  const recs = review.reviewWords.map((w: any) => ({
    cardType: 'word', cardId: w.id, cardState: w.cardState, targetText: w.en, inputText: w.en,
    durationMs: 3000, totalKeys: w.en.length, correctKeys: w.en.length,
    errorKeys: [], hintCount: 0, rating: 3,
  }))
  const sub = await page.request.post('/api/session', {
    data: { module: 'word', subModule: 'review', durationMs: 3000, totalKeys: 0, correctKeys: 0, totalChars: 0, records: recs },
  })
  expect(sub.ok(), `规模复习提交失败: ${await sub.text()}`).toBeTruthy()
  await waitFor('规模提交后 20 张 due 延后', async () => {
    const c = query(
      `SELECT COUNT(*) AS c FROM FsrsCard WHERE userId=? AND cardType='word' AND due > ?`,
      [USER, Date.now()]
    )
    return c[0].c >= 20
  })

  // 性能摘要（宽松阈值，仅供趋势参考；断言只看 <5s 硬门槛）
  expect(mixedMs).toBeLessThan(5000)
  expect(reviewMs).toBeLessThan(5000)
})
