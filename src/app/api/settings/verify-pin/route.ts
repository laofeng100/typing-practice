import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getCurrentUser, issueParentPinToken } from '@/lib/auth'
import { getRawSettings } from '@/lib/settings'

const buckets = new Map<string, { count: number; resetAt: number }>()

// POST: 校验家长密码（每用户每分钟10次限流）；成功后签发服务端令牌 cookie，
// 受保护接口（设置保存/数据重置）据此验证，形成服务端闭环
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const now = Date.now()
  const b = buckets.get(user.id)
  if (!b || now > b.resetAt) buckets.set(user.id, { count: 1, resetAt: now + 60000 })
  else { b.count++; if (b.count > 10) return NextResponse.json({ error: '尝试过于频繁，请稍后再试' }, { status: 429 }) }

  try {
    const { pin } = await req.json()
    const settings = await getRawSettings(user.id)
    // 常量时间比较，与 auth.ts 令牌校验风格一致
    const a = Buffer.from(String(pin ?? ''))
    const b = Buffer.from(settings.parentPin || '')
    const ok = !!settings.parentPin && a.length === b.length && timingSafeEqual(a, b)
    if (ok) await issueParentPinToken(user.id)
    return NextResponse.json({ ok })
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }
}
