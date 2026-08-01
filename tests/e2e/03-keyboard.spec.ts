/**
 * 流程测试 3/10：键盘第 1 关完整打字 → 通关
 * 逐字输入（delay 20ms）保证 WPM 达标（passWpm=10 / passAccuracy=95）
 */
import { test, expect } from '@playwright/test'

const LEVEL1_EXERCISES = [
  'asdf jkl;',
  'asdf jkl; asdf jkl;',
  'aa ss dd ff jj kk ll ;;',
  'ask all dad fall ask less',
  'sad lad jazz flask',
]

test('键盘第1关：5条练习全部输入 → 通关 → 返回显示已通关', async ({ page }) => {
  await page.goto('/')
  // 导航到键盘熟悉（侧边栏按钮；仪表盘主区学习路径也有同名按钮，取第一个）
  await expect(page.getByText('继续键盘闯关')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: '键盘熟悉' }).first().click()

  // 关卡选择页：第 1 关（基准键位）未锁定（卡片标题精确匹配，页面说明含同名文本）
  await expect(page.getByText('基准键位', { exact: true })).toBeVisible()
  await page.getByText('基准键位', { exact: true }).click()

  // 练习区：逐字输入 5 条
  const input = page.locator('input[type="text"]')
  await expect(input).toBeVisible({ timeout: 15_000 })
  for (let i = 0; i < LEVEL1_EXERCISES.length; i++) {
    const ex = LEVEL1_EXERCISES[i]
    // 等待输入框清空（下一练习就绪）
    await expect(input).toHaveValue('', { timeout: 15_000 })
    await input.type(ex, { delay: 20 })
    if (i < LEVEL1_EXERCISES.length - 1) {
      // 自动前进：等待进度文本变化
      await expect(page.getByText(`练习 ${i + 2} / ${LEVEL1_EXERCISES.length}`)).toBeVisible({ timeout: 15_000 })
    }
  }

  // 结果页：达标 → 恭喜过关
  await expect(page.getByText('恭喜过关！')).toBeVisible({ timeout: 20_000 })
  // 达标徽章（1 星以上）
  await expect(page.getByText('第1关 · 基准键位')).toBeVisible()

  // 第 1 关通过后按钮为「下一关」（passed && currentLevel<6），点击进入第 2 关 → 证明第 2 关已解锁
  await page.getByRole('button', { name: '下一关' }).click()
  const nextInput = page.locator('input[type="text"]')
  await expect(nextInput).toBeVisible({ timeout: 15_000 })

  // 数据落库：progress 接口反映第 1 关通关（解锁第 2 关）
  const res = await page.request.get('/api/progress')
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  expect(data.maxUnlocked).toBeGreaterThanOrEqual(2)
})
