/**
 * 流程测试 6/10：句子练习（顺序学习）
 * 选择学段 → 顺序学习 → 打字 → 会话/卡片落库
 */
import { test, expect } from '@playwright/test'
import { query, waitFor, ensureAdvancedUnlocked } from './helpers'

const USER = 'e2e-didi'

test('句子：顺序学习 2 句 → 提交 → 会话与卡片落库', async ({ page }) => {
  // 预取句子队列（小学学段，与 UI 默认一致）
  const queueRes = await page.request.get('/api/sentence?stage=小学&mode=practice')
  expect(queueRes.ok()).toBeTruthy()
  const queueData = await queueRes.json()
  const sentences: { id: string; en: string }[] = queueData.sentences || []
  expect(sentences.length).toBeGreaterThanOrEqual(2)

  // 导航：句子练习 → 顺序学习（键盘流程未通关时先确保解锁；
  // 必须在 goto 前调用：直写解锁后页面已加载的 dashData 不会刷新，按钮仍会 disabled）
  await ensureAdvancedUnlocked(page)
  await page.goto('/')
  await page.getByRole('button', { name: '句子练习' }).click()
  await expect(page.getByRole('heading', { name: '句子练习' })).toBeVisible()
  await page.getByText('顺序学习', { exact: true }).click()

  const input = page.locator('input[type="text"]')
  await expect(input).toBeVisible({ timeout: 15_000 })

  // 完成 2 句（答对自动前进）
  for (let i = 0; i < 2; i++) {
    const en = sentences[i].en
    await waitFor(`第 ${i + 1} 句输入框就绪`, async () => (await input.inputValue()) === '')
    await input.fill(en)
    await waitFor(`第 ${i + 1} 句自动前进`, async () => (await input.inputValue()) === '', 20_000)
  }

  // 返回选择页（中途退出不提交，UI 验证学习区正常即可；提交走 API 验证）
  await page.getByRole('button', { name: '← 返回' }).click()
  await expect(page.getByRole('heading', { name: '句子练习' })).toBeVisible()

  // ===== API 提交 1 句（模拟完整会话） =====
  const target = sentences[0]
  const sessionRes = await page.request.post('/api/session', {
    data: {
      module: 'sentence',
      subModule: 'practice',
      durationMs: 3000,
      totalKeys: target.en.length,
      correctKeys: target.en.length,
      totalChars: target.en.length,
      records: [{
        cardType: 'sentence',
        cardId: target.id,
        cardState: 0,
        targetText: target.en,
        inputText: target.en,
        durationMs: 3000,
        totalKeys: target.en.length,
        correctKeys: target.en.length,
        errorKeys: [],
      }],
    },
  })
  expect(sessionRes.ok()).toBeTruthy()
  const sessionData = await sessionRes.json()
  // 成功返回体为 { session: { id, wpm, accuracy }, ... }（无 success 字段）
  expect(sessionData.session?.id).toBeTruthy()

  // 会话落库
  await waitFor('TypingSession 落库', async () => {
    const rows = query(`SELECT COUNT(*) AS c FROM TypingSession WHERE userId=? AND module='sentence'`, [USER])
    return rows[0].c >= 1
  })
  // sentence 卡创建
  await waitFor('sentence 卡创建', async () => {
    const rows = query(`SELECT COUNT(*) AS c FROM FsrsCard WHERE userId=? AND cardType='sentence' AND cardId=?`, [USER, String(target.id)])
    return rows[0].c === 1
  })
})
