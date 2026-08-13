/**
 * 会话工具 - HMAC-SHA256 签名 Cookie
 * Cookie 值格式: {userId}.{hex签名}，服务端验签，杜绝明文伪造
 */
import { cookies } from 'next/headers'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { db } from './db'

export const SESSION_COOKIE = 'typing_user_id'
export const PARENT_PIN_COOKIE = 'typing_parent_pin'
const PARENT_PIN_TTL_MS = 15 * 60 * 1000 // 家长PIN验证有效期15分钟

const SECRET = process.env.SESSION_SECRET || (() => {
  const generated = randomBytes(32).toString('hex')
  console.warn('[auth] SESSION_SECRET 未配置，已生成临时密钥（服务重启后所有会话失效）。请在环境变量中配置 SESSION_SECRET。')
  return generated
})()

function sign(userId: string): string {
  return createHmac('sha256', SECRET).update(userId).digest('hex')
}

export async function getCurrentUser() {
  const cookieStore = await cookies()
  const value = cookieStore.get(SESSION_COOKIE)?.value
  if (!value) return null
  const dot = value.indexOf('.')
  if (dot <= 0) return null
  const userId = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  const expected = sign(userId)
  // hex 解码后比较（而不是直接比较 hex 字符串的 UTF-8 字节），长度相等时逐字节恒定时间比较
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return db.user.findUnique({ where: { id: userId } })
}

export async function getCurrentUserOrNull() {
  try {
    return await getCurrentUser()
  } catch {
    return null
  }
}

export async function setCurrentUser(userId: string) {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, `${userId}.${sign(userId)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, // 30天
    path: '/',
  })
}

export async function clearCurrentUser() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

/**
 * 家长PIN验证令牌：verify-pin 成功后签发 httpOnly cookie，
 * 受保护接口（设置保存/数据重置）服务端验签，杜绝绕过前端直接调接口
 * 格式: {userId}.{过期毫秒时间戳}.{hex签名}
 */
function signParentPin(userId: string, exp: number): string {
  return createHmac('sha256', SECRET).update(`parent-pin:${userId}:${exp}`).digest('hex')
}

export async function issueParentPinToken(userId: string) {
  const exp = Date.now() + PARENT_PIN_TTL_MS
  const cookieStore = await cookies()
  cookieStore.set(PARENT_PIN_COOKIE, `${userId}.${exp}.${signParentPin(userId, exp)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
    maxAge: Math.floor(PARENT_PIN_TTL_MS / 1000),
    path: '/',
  })
}

export async function verifyParentPinToken(userId: string): Promise<boolean> {
  const cookieStore = await cookies()
  const value = cookieStore.get(PARENT_PIN_COOKIE)?.value
  if (!value) return false
  const parts = value.split('.')
  if (parts.length !== 3) return false
  const [tokenUserId, expStr, sig] = parts
  const exp = Number(expStr)
  if (tokenUserId !== userId || !Number.isFinite(exp) || Date.now() > exp) return false
  const expected = signParentPin(userId, exp)
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
