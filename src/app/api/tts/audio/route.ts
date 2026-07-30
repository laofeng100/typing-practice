import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getRawSettings } from '@/lib/settings'

/**
 * TTS 音频代理：前端通过此接口获取音频，token 仅存在于服务端
 * u 参数为 TTS 服务器返回的相对路径（如 /audio/xxx.mp3）
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const u = new URL(req.url).searchParams.get('u') || ''
  // 仅允许相对路径，防路径穿越与开放代理
  if (!u.startsWith('/') || u.includes('..') || u.includes('://')) {
    return NextResponse.json({ error: '非法路径' }, { status: 400 })
  }

  const settings = await getRawSettings(user.id)
  if (!settings.ttsServerUrl) {
    return NextResponse.json({ error: 'TTS 服务未配置' }, { status: 503 })
  }

  const sep = u.includes('?') ? '&' : '?'
  const target = `${settings.ttsServerUrl}${u}${sep}token=${encodeURIComponent(settings.ttsToken)}`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)
  try {
    const resp = await fetch(target, {
      headers: { 'Authorization': `Bearer ${settings.ttsToken}` },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!resp.ok) {
      return NextResponse.json({ error: `音频获取失败: ${resp.status}` }, { status: 502 })
    }
    const buf = await resp.arrayBuffer()
    const upstreamType = resp.headers.get('content-type') || ''
    return new NextResponse(buf, {
      headers: {
        'Content-Type': upstreamType.startsWith('audio/') ? upstreamType : 'audio/mpeg',
        'Cache-Control': 'private, max-age=86400',
      },
    })
  } catch {
    clearTimeout(timeoutId)
    return NextResponse.json({ error: 'TTS 服务不可达' }, { status: 502 })
  }
}
