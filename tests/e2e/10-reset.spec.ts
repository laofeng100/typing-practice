/**
 * 流程测试 10/10：数据重置（必须最后执行）
 * 清除业务数据 → 基础表完好、账号保留 → UI 归零
 */
import { test, expect } from '@playwright/test'
import { query, waitFor } from './helpers'

const USER = 'e2e-didi'

test('重置：清空业务数据、基础表完好、账号保留', async ({ page }) => {
  // ===== 前置：确认前面 spec 产生了业务数据 =====
  const before = query(`SELECT COUNT(*) AS c FROM FsrsCard WHERE userId=?`, [USER])[0].c
  expect(before).toBeGreaterThan(0)

  // ===== 1. 调用重置接口 =====
  const res = await page.request.post('/api/data/reset')
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  expect(data.success).toBeTruthy()
  // 删除了业务数据
  expect(data.deleted.fsrsCard).toBeGreaterThan(0)
  expect(data.deleted.typingRecord).toBeGreaterThanOrEqual(0)
  // 基础教学数据完好
  expect(data.preserved.word).toBe(7572)
  expect(data.preserved.sentence).toBe(450)

  // ===== 2. 数据库直查验证 =====
  // 注：DailyStat 等业务表只清当前用户（其他复制账号若在测试中被登录过会留有各自记录），
  // 因此 daily 断言限定 e2e-didi；其余表测试期间仅 e2e-didi 产生数据，可全表断言
  const biz = query(`
    SELECT
      (SELECT COUNT(*) FROM FsrsCard WHERE userId='${USER}') AS cards,
      (SELECT COUNT(*) FROM FsrsCard) AS cardsAll,
      (SELECT COUNT(*) FROM TypingRecord) AS records,
      (SELECT COUNT(*) FROM DailyStat WHERE userId='${USER}') AS daily,
      (SELECT COUNT(*) FROM UserProgress) AS progress
  `)[0]
  expect(biz.cards).toBe(0)
  expect(biz.cardsAll).toBe(0)
  expect(biz.records).toBe(0)
  expect(biz.daily).toBe(0)
  expect(biz.progress).toBe(0)
  const base = query(`
    SELECT
      (SELECT COUNT(*) FROM WordDict) AS word,
      (SELECT COUNT(*) FROM Book) AS book,
      (SELECT COUNT(*) FROM Sentence) AS sentence,
      (SELECT COUNT(*) FROM User) AS users
  `)[0]
  expect(base.word).toBe(7572)
  expect(base.book).toBe(47)
  expect(base.sentence).toBe(450)
  expect(base.users).toBeGreaterThanOrEqual(2)

  // ===== 3. UI 归零验证 =====
  await page.goto('/')
  // 重置后键盘进度清空 → 高级练习重新锁定 → 主行动回到键盘引导（重置完整闭环）
  await expect(page.getByText('继续键盘闯关')).toBeVisible({ timeout: 15_000 })

  // ===== 4. 账号保留（登录页仍可登录） =====
  const users = await (await page.request.get('/api/users')).json()
  expect(users.users.length).toBeGreaterThanOrEqual(2)
})
