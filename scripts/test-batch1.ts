/**
 * 第一批修复冒烟测试（对运行中的 dev server 发起真实 HTTP 请求）
 * 用法: bun scripts/test-batch1.ts
 * 依赖: dev server 运行中且 DATABASE_URL=file:/tmp/opencode/typtest/test.db
 */
const BASE = 'http://localhost:3000'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail?: any) {
  if (cond) { passed++; console.log(`  PASS ${name}`) }
  else { failed++; console.log(`  FAIL ${name}`, detail ?? '') }
}

async function login(phone: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  })
  if (!res.ok) throw new Error(`login failed ${res.status}`)
  const setCookie = res.headers.get('set-cookie') || ''
  const m = setCookie.match(/typing_user_id=[^;]+/)
  if (!m) throw new Error('no session cookie')
  return m[0]
}

async function get(path: string, cookie: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function post(path: string, cookie: string, data: any) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(data),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

// 等待 dev server 就绪（路由按需编译，首次请求慢）
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/users`)
      if (res.ok) return
    } catch {}
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('server not ready')
}

async function main() {
  await waitServer()
  const cookie1 = await login('13800000001')
  const cookie2 = await login('13800000002')

  console.log('\n[C-1] 单词新词队列：首批50词已学，应仍能取到新词')
  {
    const { status, body } = await get('/api/word?mode=mixed', cookie1)
    check('HTTP 200', status === 200, status)
    check('newWords 非空（未断供）', (body?.newWords?.length ?? 0) > 0, `newWords=${body?.newWords?.length}`)
    check('新词不是已学的前50词', !body?.newWords?.some((w: any) => w.id <= 50), body?.newWords?.[0]?.id)
  }

  console.log('\n[C-2] 初中2100词全部学完，应自动晋级高中并取到新词')
  {
    const { status, body } = await get('/api/word?mode=mixed', cookie2)
    check('HTTP 200', status === 200, status)
    check('stageUpgraded = true', body?.stageUpgraded === true, `stageUpgraded=${body?.stageUpgraded} stage=${body?.currentStage}`)
    check('currentStage = 高中', body?.currentStage === '高中', body?.currentStage)
    check('取到高中新词', (body?.newWords?.length ?? 0) > 0 && body?.newWords?.[0]?.stage === '高中', body?.newWords?.[0]?.stage)
  }

  console.log('\n[C-3] 句子队列：首批50句已学，应仍能取到新句')
  {
    const { status, body } = await get('/api/sentence?mode=practice&limit=10', cookie1)
    check('HTTP 200', status === 200, status)
    check('sentences 非空（未断供）', (body?.sentences?.length ?? 0) > 0, `sentences=${body?.sentences?.length}`)
    check('新句不是已学的前50句', !body?.sentences?.some((s: any) => s.id <= 50), body?.sentences?.[0]?.id)
  }

  console.log('\n[C-9] 错题本含 listening 卡片时不应 500')
  {
    const { status, body } = await get('/api/mistakes', cookie1)
    check('HTTP 200', status === 200, `${status} ${JSON.stringify(body)?.slice(0, 200)}`)
    check('grouped 含 listening 分组', Array.isArray(body?.grouped?.listening), Object.keys(body?.grouped ?? {}))
  }

  console.log('\n[M-1] 零击键记录未传 rating 时不应创建 FSRS 卡片')
  {
    const before = await get('/api/stats/report?range=all', cookie2)
    const res = await post('/api/session', cookie2, {
      module: 'article', durationMs: 60000, totalKeys: 0, correctKeys: 0, totalChars: 0,
      records: [{ cardType: 'article', cardId: '1', targetText: 'Test', inputText: '', durationMs: 60000, totalKeys: 0, correctKeys: 0, errorKeys: [] }],
    })
    check('HTTP 200', res.status === 200, res.status)
    const after = await get('/api/stats/report?range=all', cookie2)
    check('未创建 article FSRS 卡片', (after.body?.cardsByType?.article?.total ?? 0) === (before.body?.cardsByType?.article?.total ?? 0),
      `before=${before.body?.cardsByType?.article?.total} after=${after.body?.cardsByType?.article?.total}`)
  }

  console.log('\n[M-1b] 零击键记录传显式 rating=4 时应按 Easy 调度（卡片 state>0 且非 Again 结果）')
  {
    const res = await post('/api/session', cookie2, {
      module: 'article', durationMs: 60000, totalKeys: 0, correctKeys: 0, totalChars: 0,
      records: [{ cardType: 'article', cardId: '1', targetText: 'Test', inputText: '', durationMs: 60000, totalKeys: 0, correctKeys: 0, errorKeys: [], rating: 4 }],
    })
    check('HTTP 200', res.status === 200, res.status)
    const report = await get('/api/stats/report?range=all', cookie2)
    const articleCards = report.body?.cardsByType?.article
    check('卡片已进入复习流程(state>0)', (articleCards?.total ?? 0) >= 1 && (articleCards?.learning ?? 0) + (articleCards?.review ?? 0) >= 1, articleCards)
  }

  console.log(`\n结果: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })

export {}
