/**
 * 流程测试 8/10：成就系统
 * 自造最小练习数据（1 条 TypingSession，与键盘/单词流程解耦，不依赖前置流程）：
 * 首次练习（first_login）+ 达 30 WPM（wpm_30）应解锁，成就 API 与 UI 展示正确
 */
import { test, expect } from '@playwright/test'
import { exec } from './helpers'

test('成就：练习数据产生后成就解锁并展示', async ({ page }) => {
  // ===== 前置：直写 1 条练习会话（不触碰键盘/单词流程数据） =====
  const now = new Date().toISOString()
  exec(
    `INSERT OR IGNORE INTO TypingSession (id, userId, module, durationMs, totalKeys, correctKeys, errorKeys, totalChars, wpm, accuracy, status, startedAt, endedAt)
     VALUES (?, ?, 'keyboard', 60000, 120, 120, 0, 120, 45, 1, 'completed', ?, ?)`,
    ['e2e-ach-s1', 'e2e-didi', now, now]
  )

  // API 校验：至少 1 个成就已解锁（首练 + WPM 成就）
  const res = await page.request.get('/api/stats/achievements')
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  expect(data.unlockedCount).toBeGreaterThanOrEqual(1)
  expect(data.totalCount).toBeGreaterThan(0)

  // UI 展示
  await page.goto('/')
  await page.getByRole('button', { name: '我的成就' }).click()
  await expect(page.getByText(/已解锁 \d+ \/ \d+ 个成就/)).toBeVisible({ timeout: 15_000 })
})
