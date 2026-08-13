/**
 * 流程测试 11/12：考前突击模式（examCram）——盲区补齐
 * 覆盖链路：settings.examCramMode=true
 *   → getSettings 动态放大 wordBatchSize（10 → intensity50% → 20）
 *   → word/route 复习窗口提前 7 天（due ≤ now+7d，普通模式不可见的未来卡可被拉取）
 *   → session 提交 retention=0.95 分支
 * 数值方向（0.95 < 0.9 间隔）由 vitest fsrs-unit 确定性验证，此处验证全链路代码路径。
 */
import { test, expect } from '@playwright/test'
import { query, exec, waitFor } from './helpers'

const USER = 'e2e-didi'

test('突击模式：提前 7 天拉取 + batch 放大 + 0.95 保留率提交', async ({ page }) => {
  // ===== 准备：API 提交 10 张新卡（显式 rating=2 首学 Hard） =====
  const queueRes = await page.request.get('/api/word?mode=new')
  const words = ((await queueRes.json()).newWords || []).slice(0, 10)
  expect(words.length).toBe(10)
  const r1 = await page.request.post('/api/session', {
    data: {
      module: 'word', subModule: 'new', durationMs: 3000, totalKeys: 0, correctKeys: 0, totalChars: 0,
      records: words.map(w => ({
        cardType: 'word', cardId: w.id, cardState: 0, targetText: w.en, inputText: w.en,
        durationMs: 3000, totalKeys: w.en.length, correctKeys: w.en.length, errorKeys: [], hintCount: 0, rating: 2,
      })),
    },
  })
  expect(r1.ok(), `首轮提交失败: ${await r1.text()}`).toBeTruthy()
  await waitFor('10 张卡落库', async () =>
    query(`SELECT COUNT(*) AS c FROM FsrsCard WHERE userId=? AND cardType='word' AND state>0`, [USER])[0].c === 10
  )

  // ===== 快进：5 张到期（过去 1h，普通可见）、5 张未来 3 天（普通不可见，突击 7 天窗口可见） =====
  const rows = query(`SELECT id FROM FsrsCard WHERE userId=? AND cardType='word' AND state>0 ORDER BY cardId`, [USER])
  expect(rows.length).toBe(10)
  const pastMs = Date.now() - 3600_000
  const futureMs = Date.now() + 3 * 86400000
  for (let i = 0; i < 5; i++) exec(`UPDATE FsrsCard SET due=? WHERE id=?`, [futureMs, rows[i].id])
  for (let i = 5; i < 10; i++) exec(`UPDATE FsrsCard SET due=? WHERE id=?`, [pastMs, rows[i].id])

  // ===== 基线：未开突击只拉到 5 张到期卡 =====
  const base = await (await page.request.get('/api/word?mode=review')).json()
  expect(base.reviewWords.length).toBe(5)
  expect(base.stats.dueCount).toBe(5)

  // ===== 开启突击模式（e2e.db 无 parentPin，不需要令牌） =====
  const put = await page.request.put('/api/settings', { data: { examCramMode: true } })
  expect(put.ok(), `开启突击失败: ${await put.text()}`).toBeTruthy()

  // ===== 突击下：7 天窗口拉到全部 10 张（含未来 3 天） =====
  const cram = await (await page.request.get('/api/word?mode=review')).json()
  expect(cram.reviewWords.length).toBe(10)
  expect(cram.stats.dueCount).toBe(10)

  // ===== batch 放大：wordBatchSize 默认 10 → intensity 50% → ×(1+0.5×2)=×2 → 20 =====
  const mixed = await (await page.request.get('/api/word?mode=mixed')).json()
  expect(mixed.newWords.length).toBeGreaterThanOrEqual(15)

  // ===== 突击提交全部 10 张（显式 Good）：走 retention=0.95 分支，due 全部延后 =====
  const recs = cram.reviewWords.map((w: any) => ({
    cardType: 'word', cardId: w.id, cardState: w.cardState, targetText: w.en, inputText: w.en,
    durationMs: 3000, totalKeys: w.en.length, correctKeys: w.en.length, errorKeys: [], hintCount: 0, rating: 3,
  }))
  const sub = await page.request.post('/api/session', {
    data: { module: 'word', subModule: 'review', durationMs: 3000, totalKeys: 0, correctKeys: 0, totalChars: 0, records: recs },
  })
  expect(sub.ok(), `突击提交失败: ${await sub.text()}`).toBeTruthy()
  await waitFor('突击提交后全部 due 延后到未来', async () => {
    const c = query(`SELECT COUNT(*) AS c FROM FsrsCard WHERE userId=? AND cardType='word' AND due > ?`, [USER, Date.now()])
    return c[0].c === 10
  })

  // ===== 恢复设置（保持测试环境整洁） =====
  const restore = await page.request.put('/api/settings', { data: { examCramMode: false } })
  expect(restore.ok(), `恢复设置失败: ${await restore.text()}`).toBeTruthy()
  const after = await (await page.request.get('/api/settings')).json()
  expect(after.settings.examCramMode).toBe(false)
})
