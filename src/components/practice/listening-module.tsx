'use client'

function safeParseArray(json: string | null | undefined): any[] {
  if (!json) return []
  try { const p = JSON.parse(json); return Array.isArray(p) ? p : [] } catch { return [] }
}

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Headphones, CheckCircle2, XCircle, ChevronRight, RefreshCw, Lock, Play, Pause, Loader2 } from 'lucide-react'
import { parseDialogue, voiceForSpeaker, dialogueSpeakers } from '@/lib/dialogue'

const CATEGORY_LABELS: Record<string, string> = {
  '日常对话': '日常对话',
  '故事讲述': '故事讲述',
  '新闻播报': '新闻播报',
  '科普知识': '科普知识',
  '文化介绍': '文化介绍',
  '诗歌朗诵': '诗歌朗诵',
}

const CATEGORY_COLORS: Record<string, string> = {
  '日常对话': 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  '故事讲述': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  '新闻播报': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  '科普知识': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  '文化介绍': 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  '诗歌朗诵': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
}

export default function ListeningModule({ user, settings, onProgress, advancedUnlocked }: any) {
  const [mode, setMode] = useState<'list' | 'listening' | 'result'>('list')
  const [stage, setStage] = useState(user.stage)
  const [articles, setArticles] = useState<any[]>([])
  const [current, setCurrent] = useState<any>(null)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  // TTS播放状态
  const [audioLoading, setAudioLoading] = useState(false)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [playedOnce, setPlayedOnce] = useState(false)
  const [playCount, setPlayCount] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startTimeRef = useRef(0)
  const playSeqRef = useRef(0)
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null)

  const { toast } = useToast()

  const loadList = async (s?: string) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/listening?stage=${s || stage}`)
      if (r.status === 403) {
        const d = await r.json().catch(() => ({}))
        toast({ title: '今日已达练习上限', description: d.error || '明天再来吧' })
        return
      }
      const d = await r.json()
      setArticles(d.articles || [])
    } catch (e: any) {
      toast({ title: '加载失败', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadList() }, [stage])

  useEffect(() => {
    return () => { audioRef.current?.pause() }
  }, [])

  const loadArticle = async (id: number) => {
    playSeqRef.current++
    setCurrentSpeaker(null)
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; setAudioPlaying(false) }
    setLoading(true)
    setPlayedOnce(false)
    setPlayCount(0)
    setAudioError(null)
    try {
      const r = await fetch(`/api/listening?id=${id}`)
      if (r.status === 403) {
        const d = await r.json().catch(() => ({}))
        toast({ title: '今日已达练习上限', description: d.error || '明天再来吧' })
        return
      }
      const d = await r.json()
      setCurrent(d.article)
      setAnswers({})
      setSubmitted(false)
      setResult(null)
      setMode('listening')
      startTimeRef.current = Date.now()
    } catch (e: any) {
      toast({ title: '加载失败', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  // 播放听力音频（带角色标记的对话自动切分多音色分段播放）
  const playAudio = async () => {
    if (!current) return
    setAudioLoading(true)
    setAudioError(null)

    const synth = async (text: string, voiceId?: string) => {
      const resp = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang: 'en', scene: 'article', voiceId }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error || `语音合成失败 (${resp.status})`)
      }
      return resp.json()
    }

    const playUrl = (url: string, onEnded?: () => void) => {
      const audio = new Audio(url)
      audioRef.current = audio
      return new Promise<void>((resolve) => {
        audio.onplay = () => { setAudioPlaying(true); setPlayedOnce(true) }
        audio.onpause = () => setAudioPlaying(false)
        audio.onended = () => { setAudioPlaying(false); onEnded?.(); resolve() }
        audio.onerror = () => {
          setAudioPlaying(false)
          setAudioError('音频播放失败')
          resolve()
        }
        audio.play().catch(() => resolve())
      })
    }

    try {
      const mySeq = ++playSeqRef.current
      const segments = parseDialogue(current.content)

      if (!segments) {
        const data = await synth(current.content)
        if (mySeq !== playSeqRef.current) return
        await playUrl(data.audioUrl, () => setPlayCount(prev => prev + 1))
        return
      }

      const speakers = dialogueSpeakers(segments)
      // 全部分段并行合成（英文 cache-miss 单段可达20-35s，串行累计必然超时），按序播放
      // 每段包成结果对象，避免未播到的段落 rejection 变成 unhandledrejection
      const pending = segments.map(seg =>
        synth(seg.text, voiceForSpeaker(speakers, seg.speaker)).then(
          data => ({ data }), err => ({ err })
        )
      )
      for (let i = 0; i < segments.length; i++) {
        if (mySeq !== playSeqRef.current) return
        setCurrentSpeaker(segments[i].speaker)
        const r = await pending[i]
        if (mySeq !== playSeqRef.current) return
        if ('err' in r) throw r.err
        await playUrl(r.data.audioUrl)
      }
      if (mySeq === playSeqRef.current) {
        setPlayCount(prev => prev + 1)
        setCurrentSpeaker(null)
      }
    } catch (e: any) {
      setAudioError(e.message)
      toast({ title: '语音合成失败', description: e.message, variant: 'destructive' })
    } finally {
      setAudioLoading(false)
    }
  }

  const stopAudio = () => {
    playSeqRef.current++
    setCurrentSpeaker(null)
    if (audioRef.current) {
      audioRef.current.pause()
      setAudioPlaying(false)
    }
  }

  const submitQuiz = async () => {
    setSubmitted(true)
    const questions = safeParseArray(current.questions)
    let correct = 0
    questions.forEach((q: any, i: number) => {
      if (answers[i] === q.answer) correct++
    })
    const accuracy = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0
    // 按测验正确率映射 FSRS 评级（听力无打字数据，必须显式传 rating）
    const rating = accuracy >= 90 ? 4 : accuracy >= 70 ? 3 : accuracy >= 50 ? 2 : 1

    const durationMs = Math.max(1000, Date.now() - startTimeRef.current)
    try {
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: 'listening',
          subModule: String(current.id),
          durationMs,
          totalKeys: 0,
          correctKeys: 0,
          totalChars: 0,
          score: accuracy,
          records: [{
            cardType: 'listening',
            cardId: String(current.id),
            targetText: current.title,
            inputText: '',
            durationMs,
            totalKeys: 0,
            correctKeys: 0,
            errorKeys: [],
            rating,
          }],
        }),
      })
      onProgress?.()
    } catch (e) {}

    setResult({ correct, total: questions.length, accuracy, playCount })
    setTimeout(() => setMode('result'), 100)
  }

  if (advancedUnlocked === false) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <Card>
          <CardContent className="pt-10 pb-10 text-center">
            <div className="w-16 h-16 rounded-full bg-muted mx-auto flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold mb-2">尚未解锁</h2>
            <p className="text-sm text-muted-foreground">请先达到 {settings?.wpmUnlockThreshold || 40} WPM</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ========== 列表 ==========
  if (mode === 'list') {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <Headphones className="w-6 h-6 text-primary" />
            听力练习
          </h1>
          <p className="text-sm text-muted-foreground">点击播放按钮开始听力 · 配套选择题 · 多种题材</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {['小学', '初中', '高中'].map(s => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`p-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                stage === s ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/30'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : articles.length === 0 ? (
          <Card><CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
            暂无听力文章，请等待管理员生成
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {articles.map((a, i) => (
              <Card key={a.id} className="cursor-pointer hover:border-primary/40 hover:shadow-md transition-all" onClick={() => loadArticle(a.id)}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{a.title}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Badge variant="outline" className={`text-xs ${CATEGORY_COLORS[a.category]}`}>{CATEGORY_LABELS[a.category] || a.category}</Badge>
                        <span>{a.wordCount}词</span>
                        <span>·</span>
                        <span>{a.difficulty}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ========== 听力练习 ==========
  if (mode === 'listening' && current) {
    const questions = safeParseArray(current.questions)
    const allAnswered = questions.every((_: any, i: number) => answers[i] !== undefined)

    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => { stopAudio(); setMode('list') }}>← 返回列表</Button>
          <Badge variant="outline" className={CATEGORY_COLORS[current.category]}>{CATEGORY_LABELS[current.category] || current.category}</Badge>
        </div>

        <div>
          <h2 className="text-xl font-bold mb-1">{current.title}</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{current.wordCount}词</span>
            <span>·</span>
            <span>{current.difficulty}</span>
            <span>·</span>
            <span>共{questions.length}题</span>
          </div>
        </div>

        {/* 播放控制 */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-5 pb-5">
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                {playedOnce ? '可重复播放，仔细听后再答题' : '点击下方按钮播放听力音频'}
              </p>
              <div className="flex items-center justify-center gap-4">
                {audioLoading ? (
                  <div className="w-14 h-14 rounded-full bg-primary/70 flex items-center justify-center shadow-lg">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                ) : audioPlaying ? (
                  <button
                    onClick={stopAudio}
                    aria-label="暂停播放"
                    className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
                  >
                    <Pause className="w-6 h-6" />
                  </button>
                ) : (
                  <button
                    onClick={playAudio}
                    aria-label={playedOnce ? '重新播放' : '开始播放'}
                    className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
                  >
                    <Play className="w-6 h-6 ml-0.5" />
                  </button>
                )}
                {audioPlaying && (
                  <div className="flex items-end gap-1 h-6" aria-hidden>
                    {[14, 22, 10, 24, 16].map((h, i) => (
                      <span
                        key={i}
                        className="w-1 rounded-full bg-primary animate-pulse"
                        style={{ height: `${h}px`, animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                )}
                {playCount > 0 && (
                  <Badge variant="subtle" className="text-xs">已听 {playCount} 次</Badge>
                )}
              </div>
              {audioPlaying && currentSpeaker && (
                <Badge variant="outline" className="text-xs animate-pulse-soft">🎙 {currentSpeaker} 说话中</Badge>
              )}
              {audioLoading && (
                <p className="text-xs text-muted-foreground">正在生成语音...</p>
              )}
              {audioError && (
                <p className="text-xs text-destructive">{audioError}</p>
              )}
              {!playedOnce && (
                <p className="text-xs text-muted-foreground">🔊 语音由AI合成，首次播放可能需要几秒加载</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 听力原文（答题后显示） */}
        {submitted && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                听力原文
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-base leading-relaxed whitespace-pre-wrap break-words">
                {current.content}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 选择题 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              听力理解题
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {questions.map((q: any, i: number) => (
              <div key={i} className="p-3 rounded-lg border">
                <div className="font-medium mb-3">
                  <span className="text-primary mr-2">{i + 1}.</span>
                  {q.q}
                </div>
                <RadioGroup
                  value={answers[i] !== undefined ? String(answers[i]) : ''}
                  onValueChange={(v) => setAnswers(prev => ({ ...prev, [i]: Number(v) }))}
                  className="space-y-2"
                >
                  {q.options.map((opt: string, j: number) => {
                    const isCorrect = submitted && j === q.answer
                    const isWrong = submitted && answers[i] === j && j !== q.answer
                    return (
                      <div key={j} className={`flex items-start gap-2 p-2 rounded-lg transition-colors ${
                        isCorrect ? 'bg-green-500/10' : isWrong ? 'bg-destructive/10' : 'hover:bg-secondary'
                      }`}>
                        <RadioGroupItem value={String(j)} id={`lq${i}o${j}`} className="mt-1" disabled={submitted} />
                        <Label htmlFor={`lq${i}o${j}`} className="text-sm font-normal cursor-pointer flex-1">{opt}</Label>
                        {isCorrect && <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />}
                        {isWrong && <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />}
                      </div>
                    )
                  })}
                </RadioGroup>
                {submitted && q.explain && (
                  <div className="mt-2 p-2 rounded bg-secondary/50 text-xs text-muted-foreground">
                    <span className="font-medium">解析：</span>{q.explain}
                  </div>
                )}
              </div>
            ))}

            {!submitted ? (
              <Button className="w-full" disabled={!allAnswered || !playedOnce} onClick={submitQuiz}>
                {!playedOnce ? '请先播放听力' : '提交答案'}
              </Button>
            ) : (
              <Button className="w-full" onClick={() => setMode('result')}>
                查看结果 <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ========== 结果 ==========
  if (mode === 'result' && result) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/15 mx-auto flex items-center justify-center mb-3">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">听力完成！</CardTitle>
            <p className="text-sm text-muted-foreground">{current?.title}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-secondary/50">
                <div className="text-xl font-bold text-primary">{result.correct}/{result.total}</div>
                <div className="text-xs text-muted-foreground">答对题数</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary/50">
                <div className="text-xl font-bold text-primary">{result.accuracy}%</div>
                <div className="text-xs text-muted-foreground">正确率</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary/50">
                <div className="text-xl font-bold text-primary">{result.playCount}</div>
                <div className="text-xs text-muted-foreground">播放次数</div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode('list')}>返回列表</Button>
              <Button className="flex-1" onClick={() => loadArticle(current.id)}>
                <RefreshCw className="w-4 h-4 mr-1.5" />再听一次
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}
