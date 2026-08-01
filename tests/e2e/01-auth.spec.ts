/**
 * 流程测试 1/10：登录流程
 * 独立空登录态（不走全局 storageState），完整走 登录页 → 选账号 → 仪表盘
 */
import { test, expect } from '@playwright/test'

// 清空登录态：本 spec 专门测未登录 → 登录流程
test.use({ storageState: { cookies: [], origins: [] } })

test('登录页展示账号 → 点击登录 → 仪表盘渲染', async ({ page }) => {
  await page.goto('/')
  // 登录页展示账号选择
  await expect(page.getByText('选择账号开始练习')).toBeVisible()
  // 标题（页头 h1 + 页脚 slogan 均有"键英双修"，用 heading 精确匹配）
  await expect(page.getByRole('heading', { name: '键英双修' })).toBeVisible()

  // 点击任一账号登录（固定账号 e2e-didi 或正式库复制账号）
  const loginBtn = page.locator('button', { hasText: '开始练习' }).first()
  await expect(loginBtn).toBeVisible()
  await loginBtn.click()

  // 登录成功 → 仪表盘（学习概览）
  await expect(page.getByText('学习概览')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('当前最佳WPM', { exact: false })).toBeVisible()
  // 会话 cookie 已种下（SESSION_COOKIE='typing_user_id'，见 src/lib/auth.ts）
  const cookies = await page.context().cookies()
  expect(cookies.some(c => c.name.includes('typing_user_id'))).toBeTruthy()
})
