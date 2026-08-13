/**
 * 流程测试 12/12：FSRS 细节路径——盲区补齐
 * ① hintCount>0 → 自动评级封顶 Hard（rating=2），对照组无 hint 同条件 → Easy(4)
 * ② 零击键守卫：无击键 + 无显式 rating → 卡不更新、无新流水
 * ③ 自定义 fsrsRetention 保存 → 生效（提交走自定义保留率分支；数值方向由 vitest 验证）
 * ④ 复习队列按实时可提取性 R 升序（最易遗忘的排最前）
 */
import { test, expect } from '@playwright/test'
import { query, exec, waitFor } from './helpers'

const USER = 'e2e-didi'

test('FSRS 细节：hint 封顶 / 零击键守卫 / 自定义保留率 / liveR 排序', async ({ page }) => {
  // ===== ① hintCount 封顶 vs 对照（复习卡场景：cardState=2，隔离新卡封顶干扰） =====
  const queueRes = await page.request.get('/api/word?mode=new')
  const words = ((await queueRes.json()).newWords || []).filter((w: any) => w.en.length >= 5).slice(0, 2)
  expect(words.length).toBe(2)
  const [hintWord, ctrlWord] = words

  // 先建 2 张卡（显式 rating=2 首学 Hard，进 Review 态）——断言用相对基线（前面流程可能已有卡）
  const cardsBeforeInit = query(`SELECT COUNT(*) AS c FROM FsrsCard WHERE userId=? AND cardType='word' AND state>0`, [USER])[0].c
  const rInit = await page.request.post('/api/session', {
    data: {
      module: 'word', subModule: 'new', durationMs: 3000, totalKeys: 0, correctKeys: 0, totalChars: 0,
      records: [hintWord, ctrlWord].map(w => ({
        cardType: 'word', cardId: w.id, cardState: 0, targetText: w.en, inputText: w.en,
        durationMs: 3000, totalKeys: w.en.length, correctKeys: w.en.length, errorKeys: [], hintCount: 0, rating: 2,
      })),
    },
  })
  expect(rInit.ok(), `建卡提交失败: ${await rInit.text()}`).toBeTruthy()
  await waitFor('建卡 2 张', async () =>
    query(`SELECT COUNT(*) AS c FROM FsrsCard WHERE userId=? AND cardType='word' AND state>0`, [USER])[0].c === cardsBeforeInit + 2
  )

  // 复习提交：A 带 hint（自动评级 4 → hint 规则压到 2）；B 无 hint（保持 4）
  const postReview = (cardId: string, targetText: string, hintCount: number) => {
    return page.request.post('/api/session', {
      data: {
        module: 'word', subModule: 'review', durationMs: 3000, totalKeys: 0, correctKeys: 0, totalChars: 0,
        records: [{
          cardType: 'word', cardId, cardState: 2, targetText, inputText: targetText,
          // durationMs=1000 → 打字极快 → 自动评级 Easy(4)；hintCount>0 时应被压到 Hard(2)
          durationMs: 1000, totalKeys: targetText.length, correctKeys: targetText.length,
          errorKeys: [], hintCount,
        }],
      },
    })
  }
  const rHint = await postReview(hintWord.id, hintWord.en, 1)
  expect(rHint.ok(), `hint 组提交失败: ${await rHint.text()}`).toBeTruthy()
  const rCtrl = await postReview(ctrlWord.id, ctrlWord.en, 0)
  expect(rCtrl.ok(), `对照提交失败: ${await rCtrl.text()}`).toBeTruthy()
  await waitFor('两组复习流水落库', async () => {
    const c = query(`SELECT COUNT(*) AS c FROM FsrsReview WHERE userId=? AND cardId IN (?,?)`, [USER, hintWord.id, ctrlWord.id])
    return c[0].c === 4 // 每张卡 2 条（建卡 + 复习）
  })
  const latestRating = (cardId: string): number =>
    query(`SELECT rating FROM FsrsReview WHERE userId=? AND cardId=? ORDER BY reviewedAt DESC LIMIT 1`, [USER, cardId])[0].rating
  expect(latestRating(hintWord.id)).toBe(2) // 提示（支架）后提取封顶 Hard
  expect(latestRating(ctrlWord.id)).toBe(4) // 同条件无提示 → 全对极快 → Easy

  // ===== ② 零击键守卫：无击键 + 无显式 rating → 卡不更新、不写流水 =====
  const guardCard = query(`SELECT id, due FROM FsrsCard WHERE userId=? AND cardId=?`, [USER, hintWord.id])[0]
  const guardDueBefore = guardCard.due
  const rGuard = await page.request.post('/api/session', {
    data: {
      module: 'word', subModule: 'new', durationMs: 1000, totalKeys: 0, correctKeys: 0, totalChars: 0,
      records: [{
        cardType: 'word', cardId: hintWord.id, cardState: 2, targetText: hintWord.en, inputText: '',
        durationMs: 1000, totalKeys: 0, correctKeys: 0, errorKeys: [], hintCount: 0,
      }],
    },
  })
  expect(rGuard.ok()).toBeTruthy()
  // 卡总数不变（相对守卫提交前）、该卡 due 不变、流水仍 2 条（守卫未产生任何更新）
  expect(query(`SELECT COUNT(*) AS c FROM FsrsCard WHERE userId=?`, [USER])[0].c).toBe(cardsBeforeInit + 2)
  expect(query(`SELECT due FROM FsrsCard WHERE id=?`, [guardCard.id])[0].due).toBe(guardDueBefore)
  expect(query(`SELECT COUNT(*) AS c FROM FsrsReview WHERE userId=? AND cardId=?`, [USER, hintWord.id])[0].c).toBe(2)

  // ===== ③ 自定义 fsrsRetention 保存 → 生效链路 =====
  const put = await page.request.put('/api/settings', { data: { fsrsRetention: 0.8 } })
  expect(put.ok(), `保存 fsrsRetention 失败: ${await put.text()}`).toBeTruthy()
  const got = await (await page.request.get('/api/settings')).json()
  expect(got.settings.fsrsRetention).toBe(0.8)
  // 用自定义保留率提交一张新卡（显式 Good，走 getSettings → retention=0.8 → schedule）
  const w2 = await (await page.request.get('/api/word?mode=new')).json()
  const word2 = (w2.newWords || [])[0]
  expect(word2).toBeTruthy()
  // 显式 Good 建卡：走 getSettings → retention=0.8 → schedule（显式自评不降权）
  const rSub = await page.request.post('/api/session', {
    data: {
      module: 'word', subModule: 'new', durationMs: 3000, totalKeys: 0, correctKeys: 0, totalChars: 0,
      records: [{
        cardType: 'word', cardId: word2.id, cardState: 0, targetText: word2.en, inputText: word2.en,
        durationMs: 1000, totalKeys: word2.en.length, correctKeys: word2.en.length,
        errorKeys: [], hintCount: 0, rating: 3,
      }],
    },
  })
  expect(rSub.ok(), `自定义参数提交失败: ${await rSub.text()}`).toBeTruthy()
  await waitFor('自定义参数提交的卡落库', async () =>
    query(`SELECT COUNT(*) AS c FROM FsrsCard WHERE userId=? AND cardId=?`, [USER, word2.id])[0].c === 1
  )
  // 恢复默认（保持测试环境整洁）
  await page.request.put('/api/settings', { data: { fsrsRetention: 0.9 } })

  // ===== ④ liveR 排序：队列按实时可提取性非降序（最易遗忘优先） =====
  const q5 = await page.request.get('/api/word?mode=new')
  const words5 = ((await q5.json()).newWords || []).slice(0, 5)
  expect(words5.length).toBe(5)
  const r5 = await page.request.post('/api/session', {
    data: {
      module: 'word', subModule: 'new', durationMs: 3000, totalKeys: 0, correctKeys: 0, totalChars: 0,
      records: words5.map(w => ({
        cardType: 'word', cardId: w.id, cardState: 0, targetText: w.en, inputText: w.en,
        durationMs: 3000, totalKeys: w.en.length, correctKeys: w.en.length, errorKeys: [], hintCount: 0, rating: 2,
      })),
    },
  })
  expect(r5.ok(), `liveR 准备提交失败: ${await r5.text()}`).toBeTruthy()
  await waitFor('liveR 5 张卡落库', async () =>
    query(`SELECT COUNT(*) AS c FROM FsrsCard WHERE userId=? AND cardType='word' AND state>0`, [USER])[0].c >= 8
  )
  // 错开 lastReview：卡 i 的 lastReview = now-(10+i)h → elapsed 依次增大 → 实时 R 依次降低；
  // due = lastReview+2h（仍落在过去，保证全部入队；若 +24h 会到未来导致队列为空）
  // 按 cardId 精确定位这 5 张卡（不依赖 createdAt 排序，避免秒级精度下选错卡）
  const ids5 = words5.map((w: any) => w.id)
  const cards5 = query(
    `SELECT id FROM FsrsCard WHERE userId=? AND cardId IN (${ids5.map(() => '?').join(',')})`,
    [USER, ...ids5]
  )
  expect(cards5.length).toBe(5)
  const baseMs = Date.now()
  cards5.forEach((c, i) => {
    const lastReview = baseMs - (10 + i) * 3600_000
    exec(`UPDATE FsrsCard SET lastReview=?, due=? WHERE id=?`, [lastReview, lastReview + 2 * 3600_000, c.id])
  })
  const review = await (await page.request.get('/api/word?mode=review')).json()
  expect(review.reviewWords.length).toBeGreaterThanOrEqual(5)
  const rs = review.reviewWords.map((w: any) => w.retrievability)
  for (let i = 1; i < rs.length; i++) {
    expect(rs[i]).toBeGreaterThanOrEqual(rs[i - 1]) // 非降序 = 最可能遗忘的排最前
  }
})
