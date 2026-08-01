/**
 * 流程测试 4/10：单词新词 10 个全流程
 * 学习区 → 练习（fill 全对）→ 手动前进 → 结果页 → FSRS 卡片落库
 */
import { test, expect } from '@playwright/test'
import { query, waitFor, ensureAdvancedUnlocked } from './helpers'

test('单词新词：10个词全流程 → 结果页 → 卡片创建', async ({ page }) => {
  // 预取队列（与 UI 相同接口，拿到词序用于逐词输入）
  const queueRes = await page.request.get('/api/word?mode=new')
  expect(queueRes.ok()).toBeTruthy()
  const queueData = await queueRes.json()
  const words: { id: string; en: string }[] = queueData.newWords || []
  expect(words.length).toBeGreaterThanOrEqual(10)

  // 导航到单词练习 → 学习新词（键盘流程未通关时先确保解锁；
  // 必须在 goto 前调用：直写解锁后页面已加载的 dashData 不会刷新，按钮仍会 disabled）
  await ensureAdvancedUnlocked(page)
  await page.goto('/')
  await page.getByRole('button', { name: '单词练习' }).click()
  await expect(page.getByText('单词练习')).toBeVisible()
  await page.getByText('学习新词').click()

  // 练习区
  const input = page.locator('input[type="text"]')
  await expect(input).toBeVisible({ timeout: 15_000 })

  // 逐词输入（新词直接显示全文，照打即可）
  for (let i = 0; i < words.length; i++) {
    const en = words[i].en
    await waitFor(`第 ${i + 1} 个词输入框就绪`, async () => (await input.inputValue()) === '')
    await input.fill(en)
    // 新词输入完成 → 锁定 → 出现「继续 →」（或 readOnly）
    await expect(input).toHaveAttribute('readonly', '', { timeout: 15_000 })
    await input.press('Enter')
  }

  // 结果页
  await expect(page.getByText('练习完成！')).toBeVisible({ timeout: 20_000 })
  // 10 词全对
  await expect(page.getByText('10', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('正确词数')).toBeVisible()

  // FSRS 卡片落库：10 张 word 卡（登录用户为全局固定账号 e2e-didi）
  await waitFor('FsrsCard 创建 10 张', async () => {
    const rows = query(`SELECT COUNT(*) AS c FROM FsrsCard WHERE cardType='word' AND userId='e2e-didi'`)
    return rows[0].c === 10
  })

  // 待复习数正确（新学首日不到期）
  const statsRes = await page.request.get('/api/word?mode=mixed')
  const stats = await statsRes.json()
  expect(stats.stats.dueCount).toBe(0)
  expect(stats.stats.totalLearned).toBe(10)
})
