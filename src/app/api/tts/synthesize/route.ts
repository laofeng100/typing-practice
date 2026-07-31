import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getRawSettings } from '@/lib/settings'

const ttsBuckets = new Map<string, { count: number; resetAt: number }>()

/**
 * TTS 语音合成代理 API
 *
 * 前端调用此接口，后端代理转发到TTS服务器。
 * 好处：
 * 1. 避免前端跨域问题
 * 2. token不暴露给前端
 * 3. 可根据用户设置自动选择音色/语速等参数
 *
 * 请求体：
 * {
 *   text: string,           // 必填，要合成的文本
 *   lang: 'en' | 'cn',     // 语言，决定使用英语还是中文音色配置
 *   scene?: string,         // word/sentence/chinese/article/general
 *   voiceId?: string,       // 覆盖默认音色
 *   speed?: number,         // 覆盖默认语速
 * }
 *
 * 返回：
 * {
 *   audioUrl: string,  // 本站音频代理路径（token 不下发前端）
 *   cache: 'hit'|'miss',
 *   durationMs: number,
 * }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const now = Date.now()
  const b = ttsBuckets.get(user.id)
  if (!b || now > b.resetAt) ttsBuckets.set(user.id, { count: 1, resetAt: now + 60000 })
  else { b.count++; if (b.count > 30) return NextResponse.json({ error: '语音请求过于频繁，请稍后再试' }, { status: 429 }) }

  try {
    const body = await req.json()
    const { text, lang = 'en', scene, voiceId, speed } = body

    if (!text || typeof text !== 'string' || text.length === 0) {
      return NextResponse.json({ error: 'text不能为空' }, { status: 400 })
    }
    if (text.length > 10000) {
      return NextResponse.json({ error: 'text不能超过10000字符' }, { status: 400 })
    }

    const settings = await getRawSettings(user.id)

    // 根据语言选择配置
    const isChinese = lang === 'cn'
    const finalVoiceId = voiceId || (isChinese ? settings.cnVoiceId : settings.enVoiceId)
    const finalSpeed = speed ?? (isChinese ? settings.cnSpeed : settings.enSpeed)
    const finalVol = isChinese ? settings.cnVol : settings.enVol
    const finalPitch = isChinese ? settings.cnPitch : settings.enPitch
    const pauseDouHao = isChinese ? settings.cnPauseDouHao : settings.enPauseDouHao
    const pauseJuHao = isChinese ? settings.cnPauseJuHao : settings.enPauseJuHao
    const pauseDunHao = isChinese ? settings.cnPauseDunHao : settings.enPauseDunHao

    // 默认scene
    const finalScene = scene || 'word'

    // 调用TTS服务器（文章/对话分段给90秒：英文长文 cache-miss 实测可达35s+；单词等短文本仍30秒）
    const timeoutMs = finalScene === 'article' ? 90000 : 30000
    const ttsUrl = `${settings.ttsServerUrl}/api/v1/tts/synthesize`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    let ttsResp: Response
    try {
      ttsResp = await fetch(ttsUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.ttsToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          scene: finalScene,
          voice_id: finalVoiceId,
          language: isChinese ? 'chinese' : 'english',
          model: isChinese ? (process.env.TTS_MODEL || undefined) : undefined, // HD 模型仅中文用：英文长文合成慢10倍+会超时
          speed: finalSpeed,
          vol: finalVol,
          pitch: finalPitch,
          subtitle_type: 'none',
          fmt: 'mp3',
          is_permanent: true,
          pause_dou_hao_ms: pauseDouHao,
          pause_ju_hao_ms: pauseJuHao,
          pause_dun_hao_ms: pauseDunHao,
        }),
        signal: controller.signal,
      })
    } catch (fetchErr: any) {
      clearTimeout(timeoutId)
      console.error('[TTS] fetch error:', fetchErr.message)
      if (fetchErr.name === 'AbortError') {
        return NextResponse.json({ error: `TTS服务响应超时（${timeoutMs / 1000}秒），请检查服务器状态或稍后重试` }, { status: 504 })
      }
      return NextResponse.json({
        error: '无法连接TTS服务器，请检查服务器状态',
      }, { status: 502 })
    }
    clearTimeout(timeoutId)

    if (!ttsResp.ok) {
      const errText = await ttsResp.text().catch(() => 'TTS服务错误')
      console.error('[TTS] synthesize failed:', ttsResp.status, errText)
      return NextResponse.json({
        error: `TTS合成失败: ${ttsResp.status}`,
        detail: errText,
      }, { status: 502 })
    }

    const ttsData = await ttsResp.json()

    // 音频走本站代理，token 不下发前端
    const audioUrl = `/api/tts/audio?u=${encodeURIComponent(ttsData.audio_url)}`

    return NextResponse.json({
      audioUrl,
      cache: ttsData.cache,
      durationMs: ttsData.duration_ms,
      fileSize: ttsData.file_size,
    })
  } catch (e: any) {
    console.error('[TTS] proxy error:', e)
    return NextResponse.json({ error: 'TTS代理错误' }, { status: 500 })
  }
}
