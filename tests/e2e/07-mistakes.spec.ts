/**
 * 流程测试 7/10：错题本收录规则
 * ① 首学 Hard（1 次错误）不入错题本
 * ② 同一词累计错误 ≥2 次 → 收录；lapses 不因 Hard 增加
 * ③ 错题本 UI 展示收录词
 *
 * 第一轮通过 API 直接提交（消除 UI 打字队列词序不稳定导致的 fill 错位）：
 * A/B 打错（各 1 次错误）、C 打对，其余全对，全部显式 rating=2（首学 Hard）
 */
import { test, expect } from '@playwright/test'
import { query, waitFor, ensureAdvancedUnlocked } from './helpers'

const USER = 'e2e-didi'

/** 构造"非遗忘"的错误输入：只错最后一个字符。
 * 准确率 (len-1)/len：len>=3 时 ≥66.7%，rateTyping 不落 Again（lapses 不增），totalErrors=1 */
function wrongInput(en: string): string {
  const wrong = en.endsWith('x') ? 'y' : 'x'
  return en.slice(0, -1) + wrong
}

test('错题本：首学 Hard 不收录，累计 2 次错误收录', async ({ page }) => {
  // 预取新词队列（过滤过短词：只错 1 字符时 len<3 的准确率 <60% 会触发 Again → lapses+1）
  const queueRes = await page.request.get('/api/word?mode=new')
  const allNew = (await queueRes.json()).newWords || []
  const words: { id: string; en: string }[] = allNew.filter((w: any) => w.en.length >= 3)
  expect(words.length).toBeGreaterThanOrEqual(3)
  const [wordA, wordB] = words

  // ===== 第一轮：API 提交，A/B 打错（各 1 次错误）、其余打对 =====
  // 显式 rating=2（Hard）：首学 Hard 不增 lapses；A/B totalErrors 各 +1
  // 卡数基线必须在提交前记录
  const beforeCount = query(`SELECT COUNT(*) AS c FROM FsrsCard WHERE cardType='word' AND userId=? AND state>0`, [USER])[0].c
  const r1 = await page.request.post('/api/session', {
    data: {
      module: 'word', subModule: 'new', durationMs: 3000, totalKeys: 0, correctKeys: 0, totalChars: 0,
      records: words.map((w, i) => {
        const isWrong = i < 2 // A/B 打错
        return {
          cardType: 'word', cardId: w.id, cardState: 0, targetText: w.en,
          inputText: isWrong ? wrongInput(w.en) : w.en, durationMs: 3000,
          totalKeys: w.en.length, correctKeys: isWrong ? w.en.length - 1 : w.en.length,
          errorKeys: isWrong ? ['x'] : [], hintCount: 0, rating: 2,
        }
      }),
    },
  })
  expect(r1.ok(), `第一轮提交失败: ${await r1.text()}`).toBeTruthy()

  // ===== 第一轮校验：错 1 次的卡不入错题本 =====
  await waitFor('卡片落库（本轮全部词）', async () => {
    const rows = query(`SELECT COUNT(*) AS c FROM FsrsCard WHERE cardType='word' AND userId=? AND state>0`, [USER])
    return rows[0].c === beforeCount + words.length
  })
  // A/B：totalErrors=1、lapses=0（Hard 不产生遗忘）
  for (const w of [wordA, wordB]) {
    const row = query(`SELECT totalErrors, lapses, difficulty FROM FsrsCard WHERE cardId=? AND userId=?`, [w.id, USER])[0]
    expect(row.totalErrors).toBe(1)
    expect(row.lapses).toBe(0)
  }
  const mistakes1 = await (await page.request.get('/api/mistakes')).json()
  expect(mistakes1.stats.totalMistakes).toBe(0)

  // ===== 第二轮：A 再打错（API 提交，累计 2 次）→ 应被收录 =====
  const r2 = await page.request.post('/api/session', {
    data: {
      module: 'word', subModule: 'new', durationMs: 3000, totalKeys: wordA.en.length,
      correctKeys: Math.floor(wordA.en.length * 0.7), totalChars: wordA.en.length,
      records: [{
        cardType: 'word', cardId: wordA.id, cardState: 1, targetText: wordA.en,
        inputText: wrongInput(wordA.en), durationMs: 3000, totalKeys: wordA.en.length,
        correctKeys: Math.floor(wordA.en.length * 0.7), errorKeys: ['x'], hintCount: 0,
      }],
    },
  })
  expect(r2.ok(), `第二轮提交失败: ${await r2.text()}`).toBeTruthy()

  // ===== 第二轮校验：错题本收录 A =====
  await waitFor('错题本收录 A', async () => {
    const r = await page.request.get('/api/mistakes')
    const d = await r.json()
    const found = (d.grouped?.word || []).find((x: any) => String(x.id) === String(wordA.id))
    return !!found && found.totalErrors >= 2
  })
  const mistakes2 = await (await page.request.get('/api/mistakes')).json()
  const got = (mistakes2.grouped?.word || []).map((x: any) => String(x.id))
  expect(got).toContain(String(wordA.id))
  expect(got).not.toContain(String(wordB.id)) // B 只有 1 次错误，不收录
  expect(mistakes2.stats.totalMistakes).toBe(1)

  // ===== 错题本 UI 展示 =====
  // 确保解锁必须在 goto 前：直写解锁后页面已加载的 dashData 不会刷新，按钮仍会 disabled
  await ensureAdvancedUnlocked(page)
  await page.goto('/')
  await page.getByRole('button', { name: '错题本' }).click()
  await expect(page.getByText(wordA.en).first()).toBeVisible({ timeout: 15_000 })
})
