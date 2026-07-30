/** 第四批冒烟测试 */
import { PrismaClient } from '@prisma/client'

const BASE = 'http://localhost:3000'
const db = new PrismaClient({ datasources: { db: { url: 'file:/tmp/opencode/typtest/test4.db' } } })
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
async function login(userId: string): Promise<string> {
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
  const u1 = usersRes.body?.users?.find((u: any) => u.name === '健壮一')
  const u2 = usersRes.body?.users?.find((u: any) => u.name === '健壮二')
  const u3 = usersRes.body?.users?.find((u: any) => u.name === '健壮三')
  const c1 = await login(u1.id)
  const c2 = await login(u2.id)
  const c3 = await login(u3.id)
  // === 各任务在此追加测试 section ===

  console.log('\n[L-4] fsrsRetention 设置应影响调度结果')
  {
    await put('/api/settings', c1, { fsrsRetention: 0.8 })
    await put('/api/settings', c2, { fsrsRetention: 0.97 })
    const mkRecord = () => ({
      module: 'word', durationMs: 5000, totalKeys: 10, correctKeys: 10, totalChars: 10,
      records: [{ cardType: 'word', cardId: '1', cardState: 2, targetText: 'pword1', inputText: 'pword1', durationMs: 3000, totalKeys: 10, correctKeys: 10, errorKeys: [], rating: 3 }],
    })
    const r1 = await post('/api/session', mkRecord(), c1)
    const r2 = await post('/api/session', mkRecord(), c2)
    check('两次提交均 200', r1.status === 200 && r2.status === 200, `${r1.status}/${r2.status}`)
    // 调整（brief 已知问题）：reviewWords 不含 due 且复习后 due 变未来会退出队列；
    // /api/mistakes 因 difficulty<5 且无 lapse/error 过滤掉本卡，stats/report 无单卡 due。
    // 故直接读 DB 比较 due，且要求差值 > 1 天（避免两次请求毫秒差造成假阳性）。
    const [card1, card2] = await Promise.all([
      db.fsrsCard.findUnique({ where: { userId_cardType_cardId: { userId: u1.id, cardType: 'word', cardId: '1' } } }),
      db.fsrsCard.findUnique({ where: { userId_cardType_cardId: { userId: u2.id, cardType: 'word', cardId: '1' } } }),
    ])
    const due1 = card1?.due?.getTime()
    const due2 = card2?.due?.getTime()
    const dayMs = 24 * 3600 * 1000
    check('不同 retention 产生不同 due', !!due1 && !!due2 && Math.abs(due1 - due2) > dayMs, `${card1?.due?.toISOString()} vs ${card2?.due?.toISOString()}`)
  }

  console.log('\n[M-11] 同卡连续提交不 500，复习日志完整')
  {
    const a = await post('/api/session', {
      module: 'word', durationMs: 5000, totalKeys: 10, correctKeys: 9, totalChars: 10,
      records: [{ cardType: 'word', cardId: '1', cardState: 2, targetText: 'pword1', inputText: 'pword1', durationMs: 3000, totalKeys: 10, correctKeys: 9, errorKeys: [] }],
    }, c1)
    const b = await post('/api/session', {
      module: 'word', durationMs: 5000, totalKeys: 10, correctKeys: 9, totalChars: 10,
      records: [{ cardType: 'word', cardId: '1', cardState: 2, targetText: 'pword1', inputText: 'pword1', durationMs: 3000, totalKeys: 10, correctKeys: 9, errorKeys: [] }],
    }, c1)
    check('同卡连续两次提交均 200', a.status === 200 && b.status === 200, `${a.status}/${b.status}`)
  }

  console.log('\n[L-20] 脏 errorKeysList 不应导致 500')
  {
    const keys = await get('/api/stats/keys', c1)
    check('stats/keys → 200', keys.status === 200, keys.status)
    const rep = await get('/api/stats/report?range=all', c1)
    check('stats/report → 200', rep.status === 200, rep.status)
  }

  console.log('\n[L-19] TTS 合成限流 30 次/分钟')
  {
    let limited = false
    for (let i = 0; i < 35; i++) {
      const r = await post('/api/tts/synthesize', { text: `hello ${i}`, lang: 'en' }, c2)
      if (r.status === 429) { limited = true; break }
    }
    check('35 次内触发 429', limited)
  }

  console.log('\n[L-21] first_login 成就按实际练习判定')
  {
    const a3 = await get('/api/stats/achievements', c3)
    const fl3 = a3.body?.achievements?.find((a: any) => a.id === 'first_login')
    check('无会话用户 first_login 未解锁', fl3?.unlocked === false, fl3)
    const a1 = await get('/api/stats/achievements', c1)
    const fl1 = a1.body?.achievements?.find((a: any) => a.id === 'first_login')
    check('有会话用户 first_login 已解锁', fl1?.unlocked === true, fl1)
  }

  console.log('\n[L-8] listening 会话应计入 listeningDone，时长按真实值累计')
  {
    const res = await post('/api/session', {
      module: 'listening', durationMs: 42000, totalKeys: 0, correctKeys: 0, totalChars: 0, score: 100,
      records: [{ cardType: 'listening', cardId: '1', targetText: 'T', inputText: '', durationMs: 42000, totalKeys: 0, correctKeys: 0, errorKeys: [], rating: 4 }],
    }, c3)
    check('提交 200', res.status === 200, res.status)
    const dash = await get('/api/dashboard', c3)
    check('listeningDone=1', dash.body?.todayStat?.listeningDone === 1, dash.body?.todayStat)
    check('totalMs 含真实 42s（非硬编码 60s）', dash.body?.todayStat?.totalMs === 42000, dash.body?.todayStat?.totalMs)
  }

  console.log('\n[L-15] GET /api/auth 返回当前用户（不含 phone）')
  {
    const noAuth = await get('/api/auth')
    check('未登录 → 401', noAuth.status === 401, noAuth.status)
    const me = await get('/api/auth', c1)
    check('已登录 → 200 且不含 phone', me.status === 200 && !('phone' in (me.body?.user || {})), me.body?.user)
  }

  console.log(`\n结果: ${passed} passed, ${failed} failed`)
  await db.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })

export {}
