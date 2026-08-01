/**
 * 流程测试 9/10：每日限额管控
 * 设置 dailyLimitMin=5 → UI 显示 → 注入超时数据 → 取词 403 → 恢复默认
 */
import { test, expect } from '@playwright/test'
import { exec, query, waitFor } from './helpers'

const USER = 'e2e-didi'

test('限额：设置 5 分钟 → 超时后取词接口 403', async ({ page }) => {
  // ===== 1. API 设置每日限额 5 分钟（无 PIN，直接可改） =====
  const put = await page.request.put('/api/settings', { data: { dailyLimitMin: 5 } })
  expect(put.ok()).toBeTruthy()

  // ===== 2. UI 验证设置生效 =====
  await page.goto('/')
  await page.getByRole('button', { name: '设置中心' }).click()
  await expect(page.getByText('练习时长控制')).toBeVisible({ timeout: 15_000 })
  // 每日总时长上限显示 5 分钟
  const dailyLabel = page.locator('div', { hasText: '每日总时长上限' }).first()
  await expect(dailyLabel).toContainText('5 分钟')

  // ===== 3. 制造今日练习数据（session 提交会产生今日 DailyStat 行） =====
  const word = await (await page.request.get('/api/word?mode=new')).json()
  const w = (word.newWords || [])[0]
  expect(w).toBeTruthy()
  const sessionRes = await page.request.post('/api/session', {
    data: {
      module: 'word', subModule: 'new', durationMs: 2000, totalKeys: w.en.length,
      correctKeys: w.en.length, totalChars: w.en.length,
      records: [{
        cardType: 'word', cardId: w.id, cardState: 0, targetText: w.en, inputText: w.en,
        durationMs: 2000, totalKeys: w.en.length, correctKeys: w.en.length, errorKeys: [], hintCount: 0,
      }],
    },
  })
  expect(sessionRes.ok()).toBeTruthy()

  // 今日 DailyStat 行存在
  const today = new Date().toISOString().slice(0, 10)
  await waitFor('今日 DailyStat 存在', async () => {
    const rows = query(`SELECT COUNT(*) AS c FROM DailyStat WHERE userId=? AND date=?`, [USER, today])
    return rows[0].c >= 1
  })

  // ===== 4. 注入超时数据（总时长 > 5 分钟 = 300000ms） =====
  exec(`UPDATE DailyStat SET totalMs = 400000 WHERE userId = ? AND date = ?`, [USER, today])

  // ===== 5. 取词接口 403 =====
  const blocked = await page.request.get('/api/word?mode=mixed')
  expect(blocked.status()).toBe(403)
  expect((await blocked.json()).error).toContain('今日练习已达上限')

  // ===== 6. 恢复默认（15 分钟），不影响后续 spec =====
  const restore = await page.request.put('/api/settings', { data: { dailyLimitMin: 15 } })
  expect(restore.ok()).toBeTruthy()
})
