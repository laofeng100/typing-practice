/** 第二批冒烟测试：对运行中的 dev server 发真实 HTTP 请求 */
const BASE = 'http://localhost:3000'
let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail?: any) {
  if (cond) { passed++; console.log(`  PASS ${name}`) }
  else { failed++; console.log(`  FAIL ${name}`, detail ?? '') }
}
async function login(phone: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  })
  if (!res.ok) throw new Error(`login failed ${res.status}`)
  const m = (res.headers.get('set-cookie') || '').match(/typing_user_id=[^;]+/)
  if (!m) throw new Error('no session cookie')
  return m[0]
}
async function get(path: string, cookie: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } })
  return { status: res.status, body: await res.json().catch(() => null) }
}
async function post(path: string, cookie: string, data: any) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(data),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}
async function put(path: string, cookie: string, data: any) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(data),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/users`); if (r.ok) return } catch {}
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('server not ready')
}
async function main() {
  await waitServer()
  const c1 = await login('13800000001')
  const c2 = await login('13800000002')
  const c3 = await login('13800000003')
  const c4 = await login('13800000004')
  // === 各任务在此追加测试 section ===

  console.log('\n[C-8] 成就统计不应混入其他用户数据')
  {
    const { status, body } = await get('/api/stats/achievements', c1)
    check('HTTP 200', status === 200, status)
    check('totalMinutes=2（不含 u2 的 600 分钟）', body?.stats?.totalMinutes === 2, body?.stats?.totalMinutes)
    check('bestWpm=30（不含 u2 的 80）', body?.stats?.bestWpm === 30, body?.stats?.bestWpm)
    check('totalKeys=200（不含 u2 的 5000）', body?.stats?.totalKeys === 200, body?.stats?.totalKeys)
  }

  console.log('\n[M-13] 键盘6关通关但WPM未达标，应仍解锁高级模块')
  {
    const { status, body } = await get('/api/dashboard', c3)
    check('HTTP 200', status === 200, status)
    check('keyboardUnlocked=true', body?.keyboardUnlocked === true, body?.keyboardUnlocked)
    check('advancedUnlocked=true', body?.advancedUnlocked === true, body?.advancedUnlocked)
  }

  console.log('\n[M-3] 专项练习接口应返回 cardState；按正确 module 名提交应计入 DailyStat')
  {
    const { status, body } = await get('/api/practice/focused?type=words', c1)
    check('HTTP 200', status === 200, status)
    check('words[0] 含 cardState=3', body?.words?.[0]?.cardState === 3, body?.words?.[0]?.cardState)
    // 模拟修正后的前端负载：module='word' + cardState>0 → 计入复习而非新词
    const before = await get('/api/dashboard', c1)
    const res = await post('/api/session', c1, {
      module: 'word', subModule: 'focused-words', durationMs: 30000, totalKeys: 10, correctKeys: 9, totalChars: 10,
      records: [{ cardType: 'word', cardId: '2', cardState: 3, targetText: 'pword2', inputText: 'pword2', durationMs: 3000, totalKeys: 10, correctKeys: 9, errorKeys: [] }],
    })
    check('提交 HTTP 200', res.status === 200, res.status)
    const after = await get('/api/dashboard', c1)
    check('wordReview +1', (after.body?.todayStat?.wordReview ?? 0) === (before.body?.todayStat?.wordReview ?? 0) + 1,
      `before=${before.body?.todayStat?.wordReview} after=${after.body?.todayStat?.wordReview}`)
    check('wordNew 不增加', (after.body?.todayStat?.wordNew ?? 0) === (before.body?.todayStat?.wordNew ?? 0),
      `before=${before.body?.todayStat?.wordNew} after=${after.body?.todayStat?.wordNew}`)
  }

  console.log('\n[M-5] 复习词的 retrievability 应为实时计算值（非库存的陈旧 1.0）')
  {
    const { status, body } = await get('/api/word?mode=review', c1)
    check('HTTP 200', status === 200, status)
    const w = body?.reviewWords?.find((x: any) => x.id === 1)
    check('存在 lastReview=10天前的复习卡', !!w, body?.reviewWords?.length)
    check('retrievability < 0.99（10天未复习已衰减）', typeof w?.retrievability === 'number' && w.retrievability < 0.99, w?.retrievability)
  }

  console.log('\n[M-7] 设置校验：非法值拒绝且不落库，合法值正常保存')
  {
    const bad = await put('/api/settings', c1, { dailyLimitMin: 'abc' })
    check('字符串数字 → 400', bad.status === 400, bad.status)
    const bad2 = await put('/api/settings', c1, { dailyLimitMin: 99999 })
    check('超范围 → 400', bad2.status === 400, bad2.status)
    const after = await get('/api/settings', c1)
    check('非法值未落库（仍默认15）', after.body?.settings?.dailyLimitMin === 15, after.body?.settings?.dailyLimitMin)
    const ok = await put('/api/settings', c1, { dailyLimitMin: 20, examCramMode: false })
    check('合法值 → 200', ok.status === 200, ok.status)
    check('合法值已生效', ok.body?.settings?.dailyLimitMin === 20, ok.body?.settings?.dailyLimitMin)
    await put('/api/settings', c1, { dailyLimitMin: 15 }) // 复原，避免影响其他测试
  }

  console.log('\n[M-8] 服务器"今日"应使用本地时区（Asia/Shanghai）')
  {
    const shanghaiToday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())
    const utcToday = new Date().toISOString().slice(0, 10)
    const { status, body } = await get('/api/dashboard', c1)
    check('HTTP 200', status === 200, status)
    if (shanghaiToday === utcToday) {
      console.log('  SKIP 当前时刻 UTC 与上海日期相同，无法区分（建议换时段复测）')
    } else {
      check('todayStat.date = 上海今日', body?.todayStat?.date === shanghaiToday,
        `date=${body?.todayStat?.date} shanghai=${shanghaiToday} utc=${utcToday}`)
    }
  }

  console.log('\n[M-6] 超限用户：开始练习被拦截(403)，提交不再被拒(200+警告标记)')
  {
    const g = await get('/api/word?mode=mixed', c4)
    check('超限 GET /api/word → 403', g.status === 403, g.status)
    check('403 含限额信息', typeof g.body?.limitMin === 'number', g.body)
    const p = await post('/api/session', c4, {
      module: 'word', durationMs: 60000, totalKeys: 50, correctKeys: 45, totalChars: 50,
      records: [{ cardType: 'word', cardId: '3', cardState: 0, targetText: 'pword3', inputText: 'pword3', durationMs: 5000, totalKeys: 50, correctKeys: 45, errorKeys: [] }],
    })
    check('超限 POST /api/session → 200（练习成果不丢弃）', p.status === 200, p.status)
    check('响应含 dailyLimit.exceeded=true', p.body?.dailyLimit?.exceeded === true, p.body?.dailyLimit)
  }

  console.log('\n[M-7b] schema 与 UI 边界对齐：停顿 5000 可保存，清空 ttsServerUrl 可保存')
  {
    const ok1 = await put('/api/settings', c1, { enPauseJuHao: 5000 })
    check('enPauseJuHao=5000 → 200', ok1.status === 200, ok1.status)
    const ok2 = await put('/api/settings', c1, { ttsServerUrl: '' })
    check('ttsServerUrl="" → 200', ok2.status === 200, ok2.status)
    const bad = await put('/api/settings', c1, { enPauseJuHao: 5001 })
    check('enPauseJuHao=5001 → 400 且含 details', bad.status === 400 && !!bad.body?.details?.enPauseJuHao, bad.body)
    await put('/api/settings', c1, { enPauseJuHao: 350, ttsServerUrl: '<TTS_SERVER_URL>' }) // 复原
  }

  console.log(`\n结果: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })

export {}
