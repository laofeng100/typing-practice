/**
 * 流程测试 5/10：单词复习（次日复习场景）
 * API 快进 due → 复习词进队列 → UI 全流程复习 → 提交后 due 延后、FsrsReview 流水完整
 * 前置：word-new.spec 已学 10 卡
 */
import { test, expect } from '@playwright/test'
import { exec, query, waitFor } from './helpers'

const USER = 'e2e-didi'

test('复习：快进 due → 复习队列 → 复习提交 → due 延后 + 复习流水', async ({ page }) => {
  // 提交前 FsrsReview 流水基线（word-new 首学已写 10 条，此处记录以便断言"新增 10 条"）
  const reviewBefore = query(`SELECT COUNT(*) AS c FROM FsrsReview WHERE userId=? AND cardType='word'`, [USER])[0].c

  // ===== 1. 快进全部 word 卡到期（模拟"次日"） =====
  // 注意：Prisma(SQLite) 的 DateTime 存储为 integer 毫秒，直写必须用毫秒值；
  // 若写 ISO 字符串，SQLite 比较 text vs integer 恒不匹配，复习队列会一直为空
  const pastMs = Date.now() - 3600_000
  exec(
    `UPDATE FsrsCard SET due = ? WHERE cardType='word' AND userId = ? AND state > 0`,
    [pastMs, USER]
  )

  // ===== 2. API 验证：复习队列 10 个、dueCount=10 =====
  const queueRes = await page.request.get('/api/word?mode=review')
  expect(queueRes.ok()).toBeTruthy()
  const queueData = await queueRes.json()
  const reviewWords: { id: string; en: string; cardState: number }[] = queueData.reviewWords || []
  expect(reviewWords.length).toBe(10)
  expect(queueData.stats.dueCount).toBe(10)
  expect(reviewWords.every(w => w.cardState > 0)).toBeTruthy()

  // ===== 3. UI 全流程复习 =====
  await page.goto('/')
  await page.getByRole('button', { name: '单词练习' }).click()
  await expect(page.getByText('单词练习')).toBeVisible()
  await page.getByText('复习旧词').click()

  const input = page.locator('input[type="text"]')
  await expect(input).toBeVisible({ timeout: 15_000 })

  for (let i = 0; i < reviewWords.length; i++) {
    const en = reviewWords[i].en
    await waitFor(`第 ${i + 1} 个复习词输入框就绪`, async () => (await input.inputValue()) === '')
    await input.fill(en)
    if (i < reviewWords.length - 1) {
      // 复习词答对自动前进：等输入框清空（最后一个词完成后直接进结果页，无需等清空）
      await waitFor(`第 ${i + 1} 个复习词自动前进`, async () => (await input.inputValue()) === '', 20_000)
    }
  }

  // 结果页
  await expect(page.getByText('练习完成！')).toBeVisible({ timeout: 20_000 })

  // ===== 4. 落库验证 =====
  // 4a. 全部卡片 due 延后到未来（Good 评级 → 间隔 ≥1 天；毫秒比较，与存储格式一致）
  await waitFor('全部复习卡 due 延后', async () => {
    const rows = query(
      `SELECT COUNT(*) AS c FROM FsrsCard WHERE cardType='word' AND userId=? AND due > ?`,
      [USER, Date.now()]
    )
    return rows[0].c === 10
  })
  // 4b. 待复习归零
  const after = await (await page.request.get('/api/word?mode=review')).json()
  expect(after.stats.dueCount).toBe(0)
  // 4c. FsrsReview 流水新增 10 条（复习提交，首学流水保留）
  const reviewRows = query(`SELECT COUNT(*) AS c FROM FsrsReview WHERE userId=? AND cardType='word'`, [USER])
  expect(reviewRows[0].c).toBe(reviewBefore + 10)
})
