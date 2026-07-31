'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * TTS 语音播放 Hook
 *
 * 调用后端 /api/tts/synthesize 代理接口获取音频URL并播放。
 * 服务器有缓存，相同文本+音色+参数会命中缓存，不会重复生成。
 */
export function useTTS() {
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const seqRef = useRef(0)
  const cacheRef = useRef<{ key: string; url: string } | null>(null)

  // 清理
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const bindAndPlay = useCallback((url: string) => {
    const audio = new Audio(url)
    audioRef.current = audio

    audio.onplay = () => setPlaying(true)
    audio.onpause = () => setPlaying(false)
    audio.onended = () => setPlaying(false)
    audio.onerror = () => {
      setPlaying(false)
      setError('音频播放失败，可能是网络问题或TTS服务器不可达')
    }

    return audio.play()
  }, [])

  // 走后端 synthesize 链路（原行为；也作为有道直连失败时的回退）
  const playViaTts = useCallback(async (text: string, lang: 'en' | 'cn', options: {
    scene?: string
    voiceId?: string
    speed?: number
  } | undefined, cacheKey: string, mySeq: number) => {
    setLoading(true)
    try {
      // 缓存命中直接播
      if (cacheRef.current?.key === cacheKey) {
        await bindAndPlay(cacheRef.current.url)
        return
      }

      const resp = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          lang,
          scene: options?.scene,
          voiceId: options?.voiceId,
          speed: options?.speed,
        }),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        const errMsg = err.error || `语音合成失败 (${resp.status})`
        setError(errMsg)
        // 不抛出错误，只设置error状态，避免控制台报错
        return
      }

      const data = await resp.json()
      if (!data.audioUrl) {
        setError('语音合成返回数据异常')
        return
      }

      if (mySeq !== seqRef.current) return // 已被新请求取代，丢弃
      cacheRef.current = { key: cacheKey, url: data.audioUrl }

      await bindAndPlay(data.audioUrl)
    } catch (e: any) {
      // 网络错误或播放失败，设置友好的错误信息
      const errMsg = e?.message?.includes('fetch')
        ? '无法连接TTS服务器，请检查网络或设置中的服务器地址'
        : e?.message || '语音播放失败'
      setError(errMsg)
      console.error('[TTS] error:', errMsg)
    } finally {
      setLoading(false)
    }
  }, [bindAndPlay])

  // 有道 dictvoice 直连播放（仅英文单词）：onerror / play() 拒绝 / 8s 未加载 → 自动回退 TTS
  const playViaYoudao = useCallback(async (text: string, lang: 'en' | 'cn', options: {
    scene?: string
    voiceId?: string
    speed?: number
    source?: 'auto' | 'tts'
  } | undefined, cacheKey: string, mySeq: number) => {
    setLoading(true)
    try {
      await new Promise<void>((resolve) => {
        const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=2`
        const audio = new Audio(url)
        audioRef.current = audio

        let settled = false
        let timer: ReturnType<typeof setTimeout> | undefined

        const fallback = () => {
          if (settled) return
          settled = true
          if (timer) clearTimeout(timer)
          try {
            audio.pause()
            audio.src = ''
          } catch { /* 清理失败忽略 */ }
          // 期间被新请求取代则丢弃，不再回退
          if (mySeq !== seqRef.current) return
          playViaTts(text, lang, options, cacheKey, mySeq).finally(() => resolve())
        }

        audio.onplay = () => setPlaying(true)
        audio.onpause = () => {
          setPlaying(false)
          // 用户主动停止/播放中断：结束本次调用（fallback 中的 pause 因 settled 跳过）
          if (!settled) {
            settled = true
            if (timer) clearTimeout(timer)
            resolve()
          }
        }
        audio.onended = () => {
          setPlaying(false)
          // 正常播放结束：结束本次调用
          if (!settled) {
            settled = true
            if (timer) clearTimeout(timer)
            resolve()
          }
        }
        audio.onerror = () => {
          setPlaying(false)
          fallback()
        }
        audio.onloadeddata = () => {
          if (timer) clearTimeout(timer) // 已加载到数据，取消超时兜底
        }

        // 8s 内未加载到数据（请求挂起/被拦截）→ 回退 TTS
        timer = setTimeout(() => {
          if (audio.readyState < 2) fallback() // HAVE_CURRENT_DATA
        }, 8000)

        audio.play().catch(() => fallback()) // play() reject（加载失败等）也回退
      })
    } finally {
      setLoading(false)
    }
  }, [playViaTts])

  const speak = useCallback(async (text: string, lang: 'en' | 'cn' = 'en', options?: {
    scene?: string
    voiceId?: string
    speed?: number
    source?: 'auto' | 'tts'
  }) => {
    if (!text || text.length === 0) return

    // 停止当前播放
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    setLoading(true)
    setError(null)

    const cacheKey = `${text}|${lang}|${options?.voiceId ?? ''}|${options?.speed ?? ''}`
    const mySeq = ++seqRef.current

    // 有道直连（默认老行为 source='tts' 保证句子/阅读/听力零影响）
    if (options?.source === 'auto' && lang === 'en') {
      await playViaYoudao(text, lang, options, cacheKey, mySeq)
      return
    }
    await playViaTts(text, lang, options, cacheKey, mySeq)
  }, [playViaTts, playViaYoudao])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
      setPlaying(false)
    }
  }, [])

  return { speak, stop, loading, playing, error }
}

/**
 * TTS 播放按钮组件
 * 点击播放，再次点击停止
 */
export function TTSButton({
  text,
  lang = 'en',
  scene,
  voiceId,
  speed,
  source,
  size = 'sm',
  variant = 'outline',
  className = '',
  label,
}: {
  text: string
  lang?: 'en' | 'cn'
  scene?: string
  voiceId?: string
  speed?: number
  source?: 'auto' | 'tts'
  size?: 'sm' | 'default' | 'icon'
  variant?: 'outline' | 'ghost' | 'default'
  className?: string
  label?: string
}) {
  const { speak, stop, loading, playing, error } = useTTS()

  const handleClick = () => {
    if (playing) {
      stop()
    } else {
      speak(text, lang, { scene, voiceId, speed, source })
    }
  }

  const sizeClass = size === 'icon' ? 'w-8 h-8 p-0' : size === 'sm' ? 'h-8 px-2 text-xs gap-1' : 'h-9 px-3 text-sm gap-1.5'

  return (
    <button
      onClick={handleClick}
      disabled={loading || !text}
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${sizeClass} ${
        error ? 'border-destructive/50 text-destructive' :
        variant === 'outline' ? 'border border-input bg-background hover:bg-accent' :
        variant === 'ghost' ? 'hover:bg-accent' :
        'bg-primary text-primary-foreground hover:bg-primary/90'
      } ${className}`}
      title={error || label || (playing ? '停止播放' : '播放语音')}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : error ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : playing ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <path d="M15.54 8.46a5 5 0 010 7.07" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M19.07 4.93a10 10 0 010 14.14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      )}
      {label && size !== 'icon' && <span>{label}</span>}
    </button>
  )
}
