/** 第三批（安全）冒烟测试 */
const BASE = 'http://localhost:3000'
let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail?: any) {
  if (cond) { passed++; console.log(`  PASS ${name}`) }
  else { failed++; console.log(`  FAIL ${name}`, detail ?? '') }
}
async function post(path: string, data: any, cookie?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cookie) headers.Cookie = cookie
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(data) })
  return { status: res.status, body: await res.json().catch(() => null), setCookie: res.headers.get('set-cookie') || '' }
}
async function put(path: string, cookie: string, data: any) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(data),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}
async function get(path: string, cookie?: string) {
  const headers: Record<string, string> = {}
  if (cookie) headers.Cookie = cookie
  const res = await fetch(`${BASE}${path}`, { headers })
  return { status: res.status, body: await res.json().catch(() => null) }
}
async function loginByUserId(userId: string): Promise<string> {
  const res = await post('/api/auth', { userId })
  if (res.status !== 200) throw new Error(`login failed ${res.status}`)
  const m = res.setCookie.match(/typing_user_id=[^;]+/)
  if (!m) throw new Error('no session cookie')
  return m[0]
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
  const usersRes = await get('/api/users')
  const u1 = usersRes.body?.users?.find((u: any) => u.name === '安全一')
  if (!u1) throw new Error('seed user not found')
  // === 各任务在此追加测试 section ===

  console.log('\n[C-4] 会话 Cookie 应为签名格式，篡改后失效')
  const cookie1 = await loginByUserId(u1.id)
  {
    check('Cookie 含签名（格式 id.sig）', /^[^.]+\.[0-9a-f]{64}$/.test(decodeURIComponent(cookie1.split('=')[1])), cookie1)
    const ok = await get('/api/dashboard', cookie1)
    check('合法 Cookie → 200', ok.status === 200, ok.status)
    const raw = decodeURIComponent(cookie1.split('=')[1])
    const userId = raw.split('.')[0]
    const forged = `typing_user_id=${userId}.${'0'.repeat(64)}`
    const bad = await get('/api/dashboard', forged)
    check('伪造签名 → 401', bad.status === 401, bad.status)
    const bare = await get('/api/dashboard', `typing_user_id=${userId}`)
    check('无签名明文 Cookie → 401', bare.status === 401, bare.status)
    const other = await get('/api/users')
    const u2id = other.body?.users?.find((x: any) => x.name === '安全二')?.id
    const swapped = `typing_user_id=${u2id}.${raw.split('.')[1]}`
    const sw = await get('/api/dashboard', swapped)
    check('挪用他人签名 → 401', sw.status === 401, sw.status)
  }

  console.log('\n[C-5] 用户列表不泄露 phone；失败统一文案并限流')
  {
    check('/api/users 不含 phone', !('phone' in (usersRes.body?.users?.[0] || {})), usersRes.body?.users?.[0])
    const bad = await post('/api/auth', { userId: 'not-exist-id' })
    check('不存在账号 → 401 统一文案', bad.status === 401 && bad.body?.error === '登录失败，请重试', `${bad.status} ${bad.body?.error}`)
    // phone 兼容路径须在暴力循环前验证，避免被全量限流 429
    const byPhone = await post('/api/auth', { phone: '13900000002' })
    check('phone 兼容登录 → 200', byPhone.status === 200, byPhone.status)
    // 全量限流：每 IP 每分钟 20 次尝试（成功失败均计数；此处前面已消耗若干次）
    // 注意：短时间内重复跑套件可能撞限流，等 60 秒重跑
    let limited = false
    for (let i = 0; i < 25; i++) {
      const r = await post('/api/auth', { userId: `brute-${i}` })
      if (r.status === 429) { limited = true; break }
    }
    check('连续失败触发 429 限流', limited)
  }

  console.log('\n[C-7] ttsServerUrl/ttsToken 仅 env 可配，用户不可写')
  {
    const attack = await put('/api/settings', cookie1, { ttsServerUrl: 'http://evil.example.com', ttsToken: 'stolen' })
    check('PUT 恶意 TTS 配置 → 200（忽略不报错）', attack.status === 200, attack.status)
    const after = await get('/api/settings', cookie1)
    check('ttsServerUrl 未被篡改（仍 env 值）', after.body?.settings?.ttsServerUrl === 'http://127.0.0.1:9', after.body?.settings?.ttsServerUrl)
    check('ttsToken 掩码返回', after.body?.settings?.ttsToken === '••••••••', after.body?.settings?.ttsToken)
    check('effectiveSettings 同步掩码', after.body?.effectiveSettings?.ttsToken === '••••••••', after.body?.effectiveSettings?.ttsToken)
  }

  console.log('\n[C-6] TTS token 不接触前端；音频代理有路径校验')
  {
    const noAuth = await get('/api/tts/audio?u=/audio/test.mp3')
    check('未登录访问音频代理 → 401', noAuth.status === 401, noAuth.status)
    const noParam = await get('/api/tts/audio', cookie1)
    check('缺少 u 参数 → 400', noParam.status === 400, noParam.status)
    const traversal = await get('/api/tts/audio?u=' + encodeURIComponent('/../etc/passwd'), cookie1)
    check('路径穿越 → 400', traversal.status === 400, traversal.status)
    const absolute = await get('/api/tts/audio?u=' + encodeURIComponent('http://evil.com/x'), cookie1)
    check('绝对 URL → 400', absolute.status === 400, absolute.status)
    // synthesize 的 audioUrl 必须为本站代理路径（TTS 服务器不可达会 502，此处仅静态验证代码行为，见注）
  }

  console.log('\n[SEC-FINAL] dashboard/auth 不泄露 phone 与 ttsToken；登录全量限流')
  {
    // C-5 暴力循环已打满限流桶，先等窗口重置（轮询至非 429）
    for (let i = 0; i < 25; i++) {
      const probe = await post('/api/auth', { userId: u1.id })
      if (probe.status !== 429) break
      await new Promise(r => setTimeout(r, 5000))
    }
    const dash = await get('/api/dashboard', cookie1)
    check('dashboard user 不含 phone', !('phone' in (dash.body?.user || {})), dash.body?.user)
    check('dashboard settings.ttsToken 掩码', dash.body?.settings?.ttsToken === '••••••••', dash.body?.settings?.ttsToken)
    const loginRes = await post('/api/auth', { userId: u1.id })
    check('auth 响应 user 不含 phone', loginRes.status === 200 && !('phone' in (loginRes.body?.user || {})), loginRes.body?.user)
    let limited = false
    for (let i = 0; i < 25; i++) {
      const r = await post('/api/auth', { userId: u1.id })
      if (r.status === 429) { limited = true; break }
    }
    check('成功登录也计入限流（25 次内触发 429）', limited)
  }

  console.log(`\n结果: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })

export {}
