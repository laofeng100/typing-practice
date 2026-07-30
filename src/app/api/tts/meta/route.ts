import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getRawSettings } from '@/lib/settings'

/**
 * 获取TTS服务器的音色/模型/语言目录
 * 代理转发到 TTS服务器的 /api/v1/tts/meta
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  try {
    const settings = await getRawSettings(user.id)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)
    let resp: Response
    try {
      resp = await fetch(`${settings.ttsServerUrl}/api/v1/tts/meta`, {
        headers: { 'Authorization': `Bearer ${settings.ttsToken}` },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!resp.ok) {
      return NextResponse.json({ error: `TTS meta获取失败: ${resp.status}` }, { status: 502 })
    }

    const data = await resp.json()
    return NextResponse.json(data)
  } catch (e: any) {
    console.error('[TTS] meta error:', e)
    return NextResponse.json({ error: 'TTS 服务不可达' }, { status: 502 })
  }
}
