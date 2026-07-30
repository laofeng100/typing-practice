import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { setCurrentUser, getCurrentUser } from '@/lib/auth'

// 登录限流：每 IP 每分钟最多 20 次尝试（成功失败均计数，防止暴力枚举/爆破）
const buckets = new Map<string, { count: number; resetAt: number }>()
const ATTEMPT_LIMIT = 20
const WINDOW_MS = 60000

function recordAttemptAndCheckLimited(ip: string): boolean {
  const now = Date.now()
  const b = buckets.get(ip)
  if (!b || now > b.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  b.count++
  return b.count > ATTEMPT_LIMIT
}

// 登录：POST { userId }（推荐）或 { phone }（兼容）
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
    if (recordAttemptAndCheckLimited(ip)) {
      return NextResponse.json({ error: '尝试过于频繁，请稍后再试' }, { status: 429 })
    }
    const body = await req.json()
    const { userId, phone } = body

    const user = userId
      ? await db.user.findUnique({ where: { id: String(userId) } })
      : phone
        ? await db.user.findUnique({ where: { phone: String(phone).trim() } })
        : null

    if (!user) {
      // 统一文案，不泄露账号是否存在
      return NextResponse.json({ error: '登录失败，请重试' }, { status: 401 })
    }

    const { phone: _phone, ...safeUser } = user
    await setCurrentUser(user.id)
    return NextResponse.json({ user: safeUser })
  } catch {
    return NextResponse.json({ error: '登录失败，请重试' }, { status: 500 })
  }
}

// 获取当前登录用户（会话恢复用）
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { phone: _phone, ...safeUser } = user
  return NextResponse.json({ user: safeUser })
}

// 退出登录
export async function DELETE() {
  const { clearCurrentUser } = await import('@/lib/auth')
  await clearCurrentUser()
  return NextResponse.json({ ok: true })
}
