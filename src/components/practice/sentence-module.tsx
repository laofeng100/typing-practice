'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { CountUp } from '@/components/ui/count-up'
import { VirtualKeyboard, TypingDisplay } from './typing-components'
import { PracticeHUD } from './practice-hud'
import { TTSButton } from './tts-player'
import { FileText, BookOpen, Zap, CheckCircle2, RefreshCw, Lock, GraduationCap, ChevronDown, ChevronUp, Lightbulb, Volume2 } from 'lucide-react'

interface SentenceItem {
  id: number
  stage: string
  order: number
  en: string
  zh: string
  grammarPoint: string
  grammarExplain: string
  difficulty: string
  cardState?: number
  stability?: number
  reps?: number
}

export default function SentenceModule({ user, settings, onProgress, advancedUnlocked }: any) {
  const [mode, setMode] = useState<'select' | 'practice' | 'result'>('select')
  const [practiceMode, setPracticeMode] = useState<'practice' | 'review'>('practice')
  const [stage, setStage] = useState(user.stage)
  const [queue, setQueue] = useState<SentenceItem[]>([])
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const startTimeRef = useRef<number | null>(null)
  const advancingRef = useRef(false) // 完成判定守卫：防止延迟前进窗口期内重复触发
  const submittingRef = useRef(false) // 提交守卫：防止双重 POST
  const [results, setResults] = useState<any[]>([])
  const resultsRef = useRef<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [showExplain, setShowExplain] = useState(false)
  const [loading, setLoading] = useState(false)
  const [flash, setFlash] = useState<'correct' | 'wrong' | null>(null) // 完成描边闪（纯视觉，不影响推进时序）
  const [wrongReview, setWrongReview] = useState(false) // 打错后的复习状态：等待回车/继续或改对
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const current = queue[idx]

  const loadQueue = async (m: 'practice' | 'review', s?: string) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/sentence?mode=${m}${s ? `&stage=${s}` : ''}&limit=10`)
      if (r.status === 403) {
        const d = await r.json().catch(() => ({}))
        toast({ title: '今日已达练习上限', description: d.error || '明天再来吧' })
        return
      }
      const d = await r.json()
      if (!d.sentences || d.sentences.length === 0) {
        toast({ title: '暂无可练习句子', description: m === 'review' ? '没有需要复习的句子' : '已学完该学段句子' })
        return
      }
      setQueue(d.sentences)
      setStats(d.stats)
      setIdx(0)
      setInput('')
      startTimeRef.current = null
      advancingRef.current = false
      submittingRef.current = false
      setResults([])
      resultsRef.current = []
      setShowExplain(false)
      setWrongReview(false)
      setMode('practice')
      setTimeout(() => inputRef.current?.focus(), 100)
    } catch (e: any) {
      toast({ title: '加载失败', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    if (wrongReview && current && v.length > current.en.length) return // 复习状态禁止超长输入
    if (!startTimeRef.current && v.length > 0) startTimeRef.current = Date.now()
    setInput(v)

    // 错误复习状态：改对后自动前进，不再重复记录
    if (wrongReview) {
      if (current && v === current.en) {
        setWrongReview(false)
        advancingRef.current = true
        setFlash('correct')
        setTimeout(() => setFlash(null), 200)
        goNext(400)
      }
      return
    }

    if (current && v.length >= current.en.length) {
      finishCurrent(v)
    }
  }

  // 前进到下一句（或结束练习）
  const goNext = (delayMs: number) => {
    setTimeout(() => {
      if (idx < queue.length - 1) {
        setIdx(prev => prev + 1)
        setInput('')
        startTimeRef.current = null
        setShowExplain(false)
        setWrongReview(false)
        advancingRef.current = false
        inputRef.current?.focus()
      } else {
        finishPractice([...resultsRef.current])
      }
    }, delayMs)
  }

  const finishCurrent = (v: string) => {
    if (!current) return
    if (advancingRef.current) return // 延迟前进窗口期内忽略多余按键
    advancingRef.current = true
    const duration = startTimeRef.current ? Date.now() - startTimeRef.current : 0
    const targetArr = [...current.en]
    const inputArr = [...v]
    const correct = inputArr.filter((ch, i) => ch === targetArr[i]).length
    const errorKeys: string[] = []
    for (let i = 0; i < inputArr.length; i++) {
      if (inputArr[i] !== targetArr[i] && targetArr[i]) errorKeys.push(targetArr[i].toLowerCase())
    }
    const wpm = duration > 0 ? Math.round((correct / 5) / (duration / 60000)) : 0
    const accuracy = v.length > 0 ? Math.round((correct / v.length) * 1000) / 10 : 0
    const isCorrect = accuracy >= 85
    setFlash(isCorrect ? 'correct' : 'wrong')
    setTimeout(() => setFlash(null), 200)

    const newResult = {
      sentenceId: current.id,
      en: current.en,
      zh: current.zh,
      grammarPoint: current.grammarPoint,
      cardState: current.cardState ?? 0, // 透传卡状态，供后端新卡首记封顶Hard规则与新/复习统计
      input: v,
      durationMs: duration,
      correctKeys: correct,
      totalKeys: v.length,
      errorKeys,
      wpm,
      accuracy,
      isCorrect,
    }
    setResults(prev => [...prev, newResult])
    resultsRef.current = [...resultsRef.current, newResult]

    if (isCorrect) {
      goNext(800)
    } else {
      // 打错：进入复习状态，按回车/点继续或改对后才前进
      setWrongReview(true)
    }
  }

  const finishPractice = async (allResults: any[]) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true)
    const totalCorrect = allResults.reduce((s, r) => s + r.correctKeys, 0)
    const totalKeys = allResults.reduce((s, r) => s + r.totalKeys, 0)
    const totalDuration = allResults.reduce((s, r) => s + r.durationMs, 0)
    try {
      const sessionResp = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: 'sentence',
          subModule: practiceMode,
          durationMs: totalDuration,
          totalKeys,
          correctKeys: totalCorrect,
          totalChars: totalKeys,
          records: allResults.map(r => ({
            cardType: 'sentence',
            cardId: r.sentenceId,
            cardState: r.cardState ?? 0,
            targetText: r.en,
            inputText: r.input,
            durationMs: r.durationMs,
            totalKeys: r.totalKeys,
            correctKeys: r.correctKeys,
            errorKeys: r.errorKeys,
          })),
        }),
      })
      const sessionData = await sessionResp.json().catch(() => null)
      sessionData?.newAchievements?.slice(0, 3).forEach((a: any, i: number) => {
        setTimeout(() => toast({ title: `${a.icon} 成就解锁：${a.name}`, description: a.desc }), 600 + i * 700)
      })
      setMode('result')
      onProgress?.()
    } catch (e: any) {
      toast({ title: '提交失败', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
      submittingRef.current = false
    }
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

  if (mode === 'select') {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            句子练习
          </h1>
          <p className="text-sm text-muted-foreground">打字+语法双修，每句配语法讲解</p>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-primary">{stats.totalLearned}</div><div className="text-xs text-muted-foreground">已学句子</div></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-success">{stats.totalSentences}</div><div className="text-xs text-muted-foreground">{stage}句库</div></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-amber-500">{stats.totalSentences > 0 ? Math.round((stats.totalLearned / stats.totalSentences) * 100) : 0}%</div><div className="text-xs text-muted-foreground">学段进度</div></CardContent></Card>
          </div>
        )}

        {/* 学段选择 */}
        <Card>
          <CardHeader><CardTitle className="text-base">选择学段</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {['小学', '初中', '高中'].map(s => (
                <button
                  key={s}
                  onClick={() => setStage(s)}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    stage === s ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/30'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="cursor-pointer hover:border-primary/40 hover:shadow-md transition-all" onClick={() => loadQueue('practice', stage)}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><BookOpen className="w-5 h-5 text-primary" /></div>
                <div><CardTitle className="text-base">顺序学习</CardTitle><p className="text-xs text-muted-foreground">{stage}新句子</p></div>
              </div>
            </CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">按学段顺序学习，每句配语法讲解</p></CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary/40 hover:shadow-md transition-all" onClick={() => loadQueue('review')}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center"><Zap className="w-5 h-5 text-amber-500" /></div>
                <div><CardTitle className="text-base">智能复习</CardTitle><p className="text-xs text-muted-foreground">FSRS调度</p></div>
              </div>
            </CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">复习到期句子，巩固语法记忆</p></CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (mode === 'practice' && current) {
    const targetArr = [...current.en]
    const inputArr = [...input]
    const elapsedMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0
    const liveCorrect = inputArr.filter((ch, i) => ch === targetArr[i]).length
    const currentWpm = elapsedMs > 0 && input.length > 0 ? Math.round((liveCorrect / 5) / (elapsedMs / 60000)) : 0
    const liveAccuracy = input.length > 0 ? Math.round((liveCorrect / input.length) * 1000) / 10 : 100
    const progress = (idx / queue.length) * 100
    const inputError = input.length > 0 && inputArr[inputArr.length - 1] !== targetArr[inputArr.length - 1]

    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
        <PracticeHUD wpm={currentWpm} accuracy={liveAccuracy} current={idx + 1} total={queue.length} />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setMode('select')}>← 返回</Button>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{current.stage}</Badge>
            <Badge variant="outline">{idx + 1} / {queue.length}</Badge>
          </div>
        </div>
        <Progress value={progress} className="h-1.5" />

        <AnimatePresence mode="wait">
          <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <Card className={`transition-colors ${flash === 'correct' ? 'border-success' : flash === 'wrong' ? 'border-destructive' : ''}`}>
              <CardContent className="pt-6 pb-6">
                {/* 中文翻译 + 语法信息 */}
                <div className="text-center mb-4">
                  <div className="text-xl font-medium text-muted-foreground mb-2">{current.zh}</div>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <Badge variant="subtle" className="text-xs">
                      <FileText className="w-3 h-3 mr-1" />
                      {current.grammarPoint}
                    </Badge>
                    <Badge variant="outline" className="text-xs">{current.difficulty}</Badge>
                    <Badge variant="outline" className="text-xs">{current.stage}</Badge>
                    {/* 语音播放按钮 */}
                    <TTSButton text={current.en} lang="en" scene="sentence" size="default" variant="outline" label="朗读" />
                  </div>
                  {/* 语法点简要说明 */}
                  <p className="text-xs text-muted-foreground mt-2">
                    📖 语法重点：<span className="font-medium text-primary">{current.grammarPoint}</span>
                  </p>
                </div>

                {/* 目标句子 */}
                <div
                  className="bg-secondary/30 rounded-lg p-4 mb-4 cursor-text"
                  onClick={() => inputRef.current?.focus()}
                >
                  <TypingDisplay target={current.en} input={input} size="sentence" />
                </div>

                {/* 输入框 */}
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={handleInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && wrongReview) {
                      e.preventDefault()
                      advancingRef.current = true
                      goNext(0)
                    }
                  }}
                  autoFocus
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                  className={`w-full px-4 py-2 rounded-lg border border-transparent bg-transparent font-mono text-base text-center caret-primary focus:outline-none focus:ring-1 focus:ring-primary/15 transition-shadow ${
                    inputError ? 'text-destructive' : ''
                  }`}
                  placeholder="按原文输入..."
                  disabled={loading}
                />

                {/* 错误复习提示 */}
                {wrongReview && input !== current.en && (
                  <div className="mt-3 flex items-center justify-center gap-2 text-xs">
                    <span className="text-destructive font-medium">✗ 有错误</span>
                    <span className="text-muted-foreground">按回车继续，或退格改对后自动前进</span>
                    <button
                      onClick={() => { advancingRef.current = true; goNext(0) }}
                      className="px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      继续 →
                    </button>
                  </div>
                )}

                {/* 语法讲解（完成后展开） */}
                {input.length >= current.en.length && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3">
                    <button
                      onClick={() => setShowExplain(!showExplain)}
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <Lightbulb className="w-4 h-4" />
                      语法讲解：{current.grammarPoint}
                      {showExplain ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {showExplain && (
                      <div className="mt-2 p-3 rounded-lg bg-primary/5 text-sm">
                        {current.grammarExplain}
                      </div>
                    )}
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>

        {settings?.showKeyboard !== false && input.length < current.en.length && (
          <VirtualKeyboard
            highlightKey={current.en[input.length]?.toLowerCase()}
            showFingerGuide={settings?.showFingerGuide !== false}
            nextKey={current.en[input.length]}
            errorKey={inputError ? targetArr[inputArr.length - 1] : undefined}
          />
        )}
      </div>
    )
  }

  // 再战错句：把本轮打错的句子重排一轮，趁热打铁当日复现
  const startRematch = () => {
    const wrongIds = new Set(results.filter(r => !r.isCorrect).map(r => r.sentenceId))
    const rematchQueue = queue.filter(q => wrongIds.has(q.id))
    if (rematchQueue.length === 0) return
    setQueue(rematchQueue)
    setResults([])
    resultsRef.current = []
    setIdx(0)
    setInput('')
    startTimeRef.current = null
    advancingRef.current = false
    submittingRef.current = false
    setShowExplain(false)
    setWrongReview(false)
    setMode('practice')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  if (mode === 'result') {
    const totalCorrect = results.reduce((s, r) => s + r.correctKeys, 0)
    const totalKeys = results.reduce((s, r) => s + r.totalKeys, 0)
    const totalDuration = results.reduce((s, r) => s + r.durationMs, 0)
    const wpm = totalDuration > 0 ? Math.round((totalCorrect / 5) / (totalDuration / 60000)) : 0
    const accuracy = totalKeys > 0 ? Math.round((totalCorrect / totalKeys) * 1000) / 10 : 0
    const correctCount = results.filter(r => r.isCorrect).length

    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-full bg-success/15 mx-auto flex items-center justify-center mb-3">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <CardTitle className="text-2xl">练习完成！</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-3 rounded-lg bg-secondary/50"><div className="text-xl font-bold text-primary">{correctCount}</div><div className="text-xs text-muted-foreground">正确句数</div></div>
              <div className="text-center p-3 rounded-lg bg-secondary/50"><div className="text-xl font-bold text-primary">{results.length}</div><div className="text-xs text-muted-foreground">总句数</div></div>
              <div className="text-center p-3 rounded-lg bg-secondary/50"><div className="text-xl font-bold text-primary"><CountUp value={wpm} /></div><div className="text-xs text-muted-foreground">WPM</div></div>
              <div className="text-center p-3 rounded-lg bg-secondary/50"><div className="text-xl font-bold text-primary"><CountUp value={accuracy} decimals={1} />%</div><div className="text-xs text-muted-foreground">准确率</div></div>
            </div>

            {results.filter(r => !r.isCorrect).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">需加强的句子</h3>
                <div className="space-y-1 max-h-60 overflow-y-auto scroll-thin">
                  {results.filter(r => !r.isCorrect).map((r, i) => (
                    <div key={i} className="p-2 rounded bg-destructive/5">
                      <div className="font-mono text-sm">{r.en}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{r.zh} · 准确率{r.accuracy}%</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode('select')}>返回选择</Button>
              <Button className="flex-1" onClick={() => loadQueue(practiceMode, stage)}><RefreshCw className="w-4 h-4 mr-1.5" />再练一组</Button>
            </div>
            {results.some(r => !r.isCorrect) && (
              <Button className="w-full gap-1.5" size="lg" onClick={startRematch}>
                <Zap className="w-4 h-4" /> 再战 {results.filter(r => !r.isCorrect).length} 个错句（趁热打铁）
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}
