import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyParentPinToken } from '@/lib/auth'
import { getRawSettings, getSettings, setSetting } from '@/lib/settings'

// 家长管控受保护键：已设置 parentPin 时，修改需先通过 verify-pin 获取服务端令牌
const PARENT_PROTECTED_KEYS = new Set([
  'dailyLimitMin', 'singleLimitMin', 'wpmUnlockThreshold', 'accuracyUnlockThreshold',
  'examCramMode', 'examCramIntensity', 'parentPin',
])

const SETTINGS_SCHEMA: Record<string, z.ZodTypeAny> = {
  dailyLimitMin: z.number().int().min(1).max(240),
  singleLimitMin: z.number().int().min(1).max(240),
  wpmUnlockThreshold: z.number().int().min(1).max(200),
  accuracyUnlockThreshold: z.number().min(1).max(100),
  fsrsRetention: z.number().min(0.7).max(0.99),
  fsrsMaxInterval: z.number().int().min(30).max(3650),
  wordBatchSize: z.number().int().min(1).max(50),
  wordReviewBatchSize: z.number().int().min(1).max(100),
  examCramMode: z.boolean(),
  examCramIntensity: z.number().min(0).max(100),
  parentPin: z.string().regex(/^\d{4,6}$/),
  showKeyboard: z.boolean(),
  showFingerGuide: z.boolean(),
  soundFeedback: z.boolean(),
  fontSize: z.enum(['small', 'medium', 'large']),
  enVoiceId: z.string().min(1).max(100),
  enSpeed: z.number().min(0.5).max(2),
  enVol: z.number().min(0).max(10),
  enPitch: z.number().min(-12).max(12),
  enPauseDouHao: z.number().min(0).max(5000),
  enPauseJuHao: z.number().min(0).max(5000),
  enPauseDunHao: z.number().min(0).max(5000),
}

// GET: 返回原始设置（用户在设置中心看到自己设的值）+ 运行时生效设置（显示考前突击调整后值）
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const rawSettings = await getRawSettings(user.id)
  const effectiveSettings = await getSettings(user.id)
  const mask = (s: typeof rawSettings) => ({ ...s, ttsToken: s.ttsToken ? '••••••••' : '', parentPin: s.parentPin ? '••••' : '' })
  return NextResponse.json({ settings: mask(rawSettings), effectiveSettings: mask(effectiveSettings) })
}

// PUT: 保存设置（只保存原始值，考前突击调整在运行时动态计算）
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const body = await req.json()

  // 家长管控服务端闭环：已设 PIN 时，受保护键必须持有有效令牌才能修改
  const currentRaw = await getRawSettings(user.id)
  const touchesProtected = Object.keys(body).some(k => PARENT_PROTECTED_KEYS.has(k))
  if (currentRaw.parentPin && touchesProtected) {
    const verified = await verifyParentPinToken(user.id)
    if (!verified) {
      return NextResponse.json({ error: '需先验证家长密码才能修改管控设置' }, { status: 403 })
    }
  }

  // 校验：已知 key 必须通过 schema；任一失败则整体拒绝（不落库）
  const errors: Record<string, string> = {}
  const validated: Record<string, string> = {}
  for (const [key, value] of Object.entries(body)) {
    const schema = SETTINGS_SCHEMA[key]
    if (!schema) continue // 未知 key 忽略
    const result = schema.safeParse(value)
    if (!result.success) {
      errors[key] = result.error.issues[0]?.message || '非法值'
    } else {
      validated[key] = String(value)
    }
  }
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: '设置值校验失败', details: errors }, { status: 400 })
  }

  for (const [key, value] of Object.entries(validated)) {
    await setSetting(user.id, key as any, value)
  }

  // 返回保存后的原始设置 + 运行时生效设置
  const rawSettings = await getRawSettings(user.id)
  const effectiveSettings = await getSettings(user.id)
  const mask = (s: typeof rawSettings) => ({ ...s, ttsToken: s.ttsToken ? '••••••••' : '', parentPin: s.parentPin ? '••••' : '' })
  return NextResponse.json({ settings: mask(rawSettings), effectiveSettings: mask(effectiveSettings) })
}
