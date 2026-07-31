'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { CountUp } from '@/components/ui/count-up'
import { VirtualKeyboard, TypingDisplay } from './typing-components'
import { PracticeHUD } from './practice-hud'
import { TTSButton, useTTS } from './tts-player'
import { BookOpen, Brain, Zap, CheckCircle2, XCircle, ChevronRight, RefreshCw, Lock, TrendingUp, Lightbulb, Volume2 } from 'lucide-react'

interface WordItem {
  id: string // head_word
  en: string
  zh: string
  pos: string
  usPhone?: string
  ukPhone?: string
  memoryMethod?: string
  wordRank?: number | null
  examples?: { en: string; cn: string }[]
  phrases?: { phrase: string; cn: string }[]
  synonyms?: { pos?: string; word: string; tranCn?: string | null }[]
  related?: { pos?: string; word: string; tranCn?: string | null }[]
  cardState?: number
  stability?: number
  difficulty_card?: number
  reps?: number
  lapses?: number
}

interface WordModuleProps {
  user: any
  settings?: any
  onProgress?: () => void
  advancedUnlocked?: boolean
}

export default function WordModule({ user, settings, onProgress, advancedUnlocked }: WordModuleProps) {
  const [mode, setMode] = useState<'select' | 'practice' | 'result'>('select')
  const [practiceMode, setPracticeMode] = useState<'new' | 'review' | 'mixed'>('mixed')
  const [queue, setQueue] = useState<WordItem[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [input, setInput] = useState('')
  const startTimeRef = useRef<number | null>(null)
  const advancingRef = useRef(false) // 完成判定守卫：防止延迟前进窗口期内重复触发
  const submittingRef = useRef(false) // 提交守卫：防止双重 POST
  const [results, setResults] = useState<any[]>([])
  const resultsRef = useRef<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [hintCount, setHintCount] = useState(0) // 提示字母数
  const [autoPlayDone, setAutoPlayDone] = useState(false) // 新词自动播放是否完成
  const tts = useTTS()
  const [loading, setLoading] = useState(false)
  const [showZh, setShowZh] = useState(true)
  const [flash, setFlash] = useState<'correct' | 'wrong' | null>(null) // 完成描边闪（纯视觉，不影响推进时序）
  const [wrongReview, setWrongReview] = useState(false) // 打错后的复习状态：等待回车/继续或改对
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const currentWord = queue[currentIdx]

  const loadQueue = async (m: 'new' | 'review' | 'mixed') => {
    setLoading(true)
    try {
      const r = await fetch(`/api/word?mode=${m}`)
      if (r.status === 403) {
        const d = await r.json().catch(() => ({}))
        toast({ title: '今日已达练习上限', description: d.error || '明天再来吧' })
        return
      }
      const d = await r.json()
      const q = [...(d.newWords || []), ...(d.reviewWords || [])]
      if (q.length === 0) {
        toast({ title: '暂无可练习的单词', description: m === 'review' ? '没有需要复习的单词' : '已学完当前学段所有单词' })
        return
      }
      setQueue(q)
      setStats(d.stats)
      setCurrentBookInfo(d.currentBook || null)
      setCurrentIdx(0)
      setInput('')
      startTimeRef.current = null
      advancingRef.current = false
      submittingRef.current = false
      setResults([])
      resultsRef.current = []
      setHintCount(0)
      setAutoPlayDone(false)
      setWrongReview(false)
      setMode('practice')
      setTimeout(() => inputRef.current?.focus(), 100)
    } catch (e: any) {
      toast({ title: '加载失败', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  // 词书选择器状态
  const [books, setBooks] = useState<any[]>([])
  const [currentBookId, setCurrentBookId] = useState('')
  const [booksLoading, setBooksLoading] = useState(false)
  const [currentBookInfo, setCurrentBookInfo] = useState<any>(null) // 当前教材信息（进度卡/晋级提示展示）

  const STAGE_LABELS: Record<string, string> = { primary: '小学', middle: '初中', high: '高中' }

  // 教材短名：人教版小学英语-三年级上册 → 三年级上册
  const bookShortTitle = (b: any) => b.title?.split('-')[1] || b.title || b.id

  // 加载词书列表 + 选择页统计（首次进入/切换教材后刷新）
  const refreshSelectData = useCallback(async () => {
    const [r1, r2] = await Promise.all([
      fetch('/api/books').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/word?mode=mixed').then(r => r.ok ? r.json() : null).catch(() => null),
    ])
    if (r1) {
      setBooks(r1.books || [])
      setCurrentBookId(r1.currentBookId)
    }
    if (r2) {
      setStats(r2.stats)
      setCurrentBookInfo(r2.currentBook || null)
    }
  }, [])

  useEffect(() => {
    if (mode === 'select') refreshSelectData()
  }, [mode, refreshSelectData])

  // 切换教材
  const switchBook = async (b: any) => {
    if (b.id === currentBookId || booksLoading) return
    setBooksLoading(true)
    try {
      const r = await fetch('/api/books', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: b.id }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        toast({ title: '切换失败', description: d.error, variant: 'destructive' })
        return
      }
      setCurrentBookId(b.id)
      toast({ title: `已切换到「${bookShortTitle(b)}」` })
      onProgress?.()
      refreshSelectData()
    } finally {
      setBooksLoading(false)
    }
  }

  // 自动播放新词语音
  useEffect(() => {
    if (mode === 'practice' && currentWord && !autoPlayDone) {
      // 新词模式或混合模式中的新词：自动播放
      const isNew = !currentWord.cardState || currentWord.cardState === 0
      if (isNew && (practiceMode === 'new' || practiceMode === 'mixed')) {
        setAutoPlayDone(true)
        tts.speak(currentWord.en, 'en', { scene: 'word', source: 'auto' })
      }
    }
  }, [currentWord, mode, autoPlayDone, practiceMode, tts.speak])

  // 提示快捷键（H键提示，空格播放语音）
  useEffect(() => {
    if (mode !== 'practice' || !currentWord) return
    const handleKeyDown = (e: KeyboardEvent) => {
      // 只在输入框未聚焦时处理快捷键
      if (document.activeElement === inputRef.current) return
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault()
        setHintCount(prev => Math.min(prev + 1, currentWord.en.length))
      } else if (e.key === ' ') {
        e.preventDefault()
        tts.speak(currentWord.en, 'en', { scene: 'word', source: 'auto' })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode, currentWord, tts.speak])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    const now = Date.now()
    // 该词是否有扩展内容（例句/短语/近义词），决定完成后停留时长
    const hasExtras = !!(currentWord.examples?.length || currentWord.phrases?.length || currentWord.synonyms?.length || currentWord.related?.length)
    if (wrongReview && v.length > currentWord.en.length) return // 复习状态禁止超长输入
    if (!startTimeRef.current && v.length > 0) startTimeRef.current = now
    setInput(v)

    if (v.length < currentWord.en.length) return

    // 错误复习状态：改对后自动前进，不再重复记录
    if (wrongReview) {
      if (v === currentWord.en) {
        setWrongReview(false)
        advancingRef.current = true
        setFlash('correct')
        setTimeout(() => setFlash(null), 200)
        // 有扩展内容（例句/短语等）时稍作停留，便于浏览完成面板
        goNext(hasExtras ? 1600 : 400)
      }
      return
    }

    if (advancingRef.current) return // 延迟前进窗口期内忽略多余按键

    // 完成本词
    const duration = startTimeRef.current ? now - startTimeRef.current : 0
    const targetArr = [...currentWord.en]
    const inputArr = [...v]
    const correct = inputArr.filter((ch, i) => ch === targetArr[i]).length
    const errorKeys: string[] = []
    for (let i = 0; i < inputArr.length; i++) {
      if (inputArr[i] !== targetArr[i] && targetArr[i]) errorKeys.push(targetArr[i].toLowerCase())
    }
    const wpm = duration > 0 ? Math.round((correct / 5) / (duration / 60000)) : 0
    const accuracy = v.length > 0 ? Math.round((correct / v.length) * 1000) / 10 : 0
    const isCorrect = accuracy >= 80
    setFlash(isCorrect ? 'correct' : 'wrong')
    setTimeout(() => setFlash(null), 200)

    const newResult = {
      wordId: currentWord.id,
      word: currentWord.en,
      zh: currentWord.zh,
      usPhone: currentWord.usPhone || '',
      cardState: currentWord.cardState || 0,
      input: v,
      durationMs: duration,
      correctKeys: correct,
      totalKeys: v.length,
      errorKeys,
      wpm,
      accuracy,
      isCorrect,
      hintCount,
    }
    setResults(prev => [...prev, newResult])
    resultsRef.current = [...resultsRef.current, newResult]

    if (isCorrect) {
      advancingRef.current = true
      goNext(hasExtras ? 1600 : 500)
    } else {
      // 打错：进入复习状态，按回车/点继续或改对后才前进
      setWrongReview(true)
    }
  }

  // 前进到下一词（或结束练习）
  const goNext = (delayMs: number) => {
    setTimeout(() => {
      if (currentIdx < queue.length - 1) {
        setCurrentIdx(prev => prev + 1)
        setInput('')
        startTimeRef.current = null
        setHintCount(0)
        setAutoPlayDone(false)
        setWrongReview(false)
        advancingRef.current = false
        inputRef.current?.focus()
      } else {
        finishPractice([...resultsRef.current])
      }
    }, delayMs)
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
          module: 'word',
          subModule: practiceMode,
          durationMs: totalDuration,
          totalKeys,
          correctKeys: totalCorrect,
          totalChars: totalKeys,
          records: allResults.map(r => ({
            cardType: 'word',
            cardId: r.wordId,
            cardState: r.cardState || 0,
            targetText: r.word,
            inputText: r.input,
            durationMs: r.durationMs,
            totalKeys: r.totalKeys,
            correctKeys: r.correctKeys,
            errorKeys: r.errorKeys,
            hintCount: r.hintCount || 0,
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

  // ========== 未解锁 ==========
  if (advancedUnlocked === false) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <Card>
          <CardContent className="pt-10 pb-10 text-center">
            <div className="w-16 h-16 rounded-full bg-muted mx-auto flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold mb-2">尚未解锁</h2>
            <p className="text-sm text-muted-foreground mb-4">
              请先完成键盘熟悉训练，达到 {settings?.wpmUnlockThreshold || 40} WPM 和 {settings?.accuracyUnlockThreshold || 90}% 准确率
            </p>
            <Button onClick={() => onProgress?.()}>返回概览</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ========== 选择模式 ==========
  if (mode === 'select') {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            单词练习
          </h1>
          <p className="text-sm text-muted-foreground">边打字边背单词，按教材词序学习，FSRS算法智能调度复习，学完当前教材自动推进</p>
        </div>

        {/* 词书选择器 */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                选择教材
              </h3>
              {booksLoading && <span className="text-xs text-muted-foreground animate-pulse">加载中...</span>}
            </div>
            {(['primary', 'middle', 'high'] as const).map(stage => {
              const stageBooks = books.filter(b => b.stage === stage)
              if (stageBooks.length === 0) return null
              return (
                <div key={stage} className="mb-3 last:mb-0">
                  <div className="text-xs text-muted-foreground mb-1.5">{STAGE_LABELS[stage]}</div>
                  <div className="flex gap-2 overflow-x-auto pb-1 scroll-thin">
                    {stageBooks.map(b => {
                      const active = b.id === currentBookId
                      const done = b.wordCount > 0 && b.learned >= b.wordCount
                      return (
                        <button
                          key={b.id}
                          onClick={() => switchBook(b)}
                          disabled={booksLoading}
                          title={b.title}
                          className={`shrink-0 text-left px-3 py-2 rounded-lg border transition-all ${
                            active
                              ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                              : 'border-border bg-card hover:border-primary/40'
                          }`}
                        >
                          <div className="text-xs font-medium max-w-[110px] truncate">{bookShortTitle(b)}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {b.wordCount}词 · 已学{b.learned}{done ? ' ✓' : ''}
                          </div>
                          {active && <Badge className="mt-1 text-[10px] bg-primary/10 text-primary">学习中</Badge>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* 教材晋级提示 */}
        {stats?.stageUpgraded && (
          <div className="p-4 rounded-lg bg-success/10 border border-success/30 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center text-xl">🎉</div>
            <div>
              <div className="font-semibold text-success">恭喜！已学完当前教材，自动进入「{bookShortTitle(currentBookInfo)}」！</div>
              <div className="text-xs text-muted-foreground">新词将按新教材的词序继续学习，复习队列不受影响</div>
            </div>
          </div>
        )}

        {/* 进度统计 */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold text-primary">{stats.totalLearned}</div>
                <div className="text-xs text-muted-foreground">累计已学</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold text-warning">{stats.dueCount}</div>
                <div className="text-xs text-muted-foreground">待复习</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold text-success">{stats.currentStageLearned || 0}<span className="text-sm text-muted-foreground">/{stats.currentStageTotal || 0}</span></div>
                <div className="text-xs text-muted-foreground truncate px-1" title={currentBookInfo?.title}>
                  {bookShortTitle(currentBookInfo) || (stats.currentStage || user.stage) + '学段'}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold text-purple-600">{stats.currentStageProgress || 0}%</div>
                <div className="text-xs text-muted-foreground">教材进度</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 教材进度条 */}
        {stats && stats.currentStageTotal > 0 && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium truncate">{currentBookInfo?.title || `${stats.currentStage || user.stage}学段`}进度</span>
                <span className="text-muted-foreground shrink-0">{stats.currentStageLearned}/{stats.currentStageTotal}词</span>
              </div>
              <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all"
                  style={{ width: `${stats.currentStageProgress || 0}%` }}
                />
              </div>
              {stats.currentStageProgress >= 100 && (
                <p className="text-xs text-success mt-2">✨ 本教材已全部学完，继续练习将自动进入下一本教材！</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* 模式选择 */}
        <div className="grid sm:grid-cols-3 gap-4">
          <Card
            className="cursor-pointer hover:border-primary/40 hover:shadow-md transition-all"
            onClick={() => loadQueue('new')}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">学习新词</CardTitle>
                  <p className="text-xs text-muted-foreground">每次 {settings?.wordBatchSize || 10} 个</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">看中文打英文，第一次学习新单词</p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:border-primary/40 hover:shadow-md transition-all"
            onClick={() => loadQueue('review')}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <CardTitle className="text-base">复习旧词</CardTitle>
                  <p className="text-xs text-muted-foreground">每次 {settings?.wordReviewBatchSize || 20} 个</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">FSRS算法推送到期单词</p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:border-primary/40 hover:shadow-md transition-all"
            onClick={() => loadQueue('mixed')}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-base">混合练习</CardTitle>
                  <p className="text-xs text-muted-foreground">新词+复习</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">新词学习与旧词复习结合</p>
            </CardContent>
          </Card>
        </div>

        {/* 词库说明 */}
        <Card className="bg-secondary/30">
          <CardContent className="pt-5">
            <h3 className="font-semibold text-sm mb-2">词库说明</h3>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {(['primary', 'middle', 'high'] as const).map(stage => {
                const count = books.filter(b => b.stage === stage).length
                if (count === 0) return null
                return (
                  <div key={stage} className="flex justify-between p-2 rounded bg-card">
                    <span>{STAGE_LABELS[stage]}</span>
                    <span className="text-muted-foreground">{count}本</span>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              当前学习：{currentBookInfo?.title || `${user.stage}（${user.grade}）`} · 共 {books.length || 47} 本词书可选，学完自动推进
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ========== 练习中 ==========
  if (mode === 'practice' && currentWord) {
    const targetArr = [...currentWord.en]
    const inputArr = [...input]
    const elapsedMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0
    const currentWpm = elapsedMs > 0 && input.length > 0 ? Math.round((inputArr.filter((ch, i) => ch === targetArr[i]).length / 5) / (elapsedMs / 60000)) : 0
    const progress = ((currentIdx) / queue.length) * 100
    const inputError = input.length > 0 && inputArr[inputArr.length - 1] !== targetArr[inputArr.length - 1]
    // 判断是否为新词：新词模式中全部是新词；混合模式中cardState=0的是新词；复习模式全部是旧词
    const isNewWord = practiceMode === 'new' || (!currentWord.cardState || currentWord.cardState === 0)
    const liveCorrect = inputArr.filter((ch, i) => ch === targetArr[i]).length
    const liveAccuracy = input.length > 0 ? Math.round((liveCorrect / input.length) * 1000) / 10 : 100

    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
        <PracticeHUD accuracy={liveAccuracy} current={currentIdx + 1} total={queue.length} />
        {/* 顶部 */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setMode('select')}>← 返回</Button>
          <Badge variant="outline">{currentIdx + 1} / {queue.length}</Badge>
        </div>
        <Progress value={progress} className="h-1.5" />

        {/* 单词卡 */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Card className={`relative transition-colors ${flash === 'correct' ? 'border-success' : flash === 'wrong' ? 'border-destructive' : ''}`}>
              {currentWord.cardState && currentWord.cardState > 0 && typeof currentWord.stability === 'number' && (
                <span
                  className={`absolute top-3 right-3 w-2 h-2 rounded-full ${
                    currentWord.stability >= 10 ? 'bg-success' : currentWord.stability >= 5 ? 'bg-warning' : 'bg-destructive'
                  }`}
                  title="记忆强度"
                />
              )}
              <CardContent className="pt-6 pb-6">
                {/* 中文释义 + 语音按钮 */}
                <div className="text-center mb-6">
                  <div
                    className="cursor-pointer select-none mb-2"
                    onClick={() => setShowZh(prev => !prev)}
                    title="点击显示/隐藏释义"
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={showZh ? 'zh' : 'hidden'}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="text-3xl font-bold flex items-center justify-center gap-2"
                      >
                        {showZh ? currentWord.zh : <span className="text-muted-foreground text-xl">点击显示释义</span>}
                        <span onClick={e => e.stopPropagation()}>
                          <TTSButton text={currentWord.en} lang="en" scene="word" source="auto" size="default" variant="ghost" />
                        </span>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  {/* 音标行（美/英，有则显示） */}
                  {(currentWord.usPhone || currentWord.ukPhone) && (
                    <div className="text-sm font-mono text-muted-foreground mb-1.5">
                      {currentWord.usPhone && <span>美 {currentWord.usPhone}</span>}
                      {currentWord.usPhone && currentWord.ukPhone && <span className="mx-1.5">·</span>}
                      {currentWord.ukPhone && <span>英 {currentWord.ukPhone}</span>}
                    </div>
                  )}
                  {/* 新词记忆法 */}
                  {isNewWord && currentWord.memoryMethod && (
                    <div className="text-xs text-amber-600 mb-2">📝 {currentWord.memoryMethod}</div>
                  )}
                  <div className="flex items-center justify-center gap-2">
                    <Badge variant="secondary">{currentWord.pos}</Badge>
                    {currentWord.cardState ? (
                      <Badge variant="outline" className="text-xs">
                        第{currentWord.reps || 0}次复习 · 稳定度{currentWord.stability?.toFixed(1) || 0}
                      </Badge>
                    ) : (
                      <Badge className="bg-primary/10 text-primary">新词</Badge>
                    )}
                  </div>
                </div>

                {/* 目标单词显示 */}
                <div
                  className="bg-secondary/30 rounded-lg p-6 mb-2 min-h-[80px] flex items-center justify-center cursor-text"
                  onClick={() => inputRef.current?.focus()}
                >
                  {input.length >= currentWord.en.length ? (
                    // 输入完成：显示对比
                    <div className="text-center">
                      <TypingDisplay target={currentWord.en} input={input} size="word" shakeLatestError />
                      <div className={`mt-3 text-sm font-medium ${input === currentWord.en ? 'text-success' : 'text-destructive'}`}>
                        {input === currentWord.en ? '✓ 正确！' : `✗ 正确答案：${currentWord.en}`}
                      </div>
                      {wrongReview && input !== currentWord.en && (
                        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                          <span>按回车继续，或退格改对后自动前进</span>
                          <button
                            onClick={() => { advancingRef.current = true; goNext(0) }}
                            className="px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            继续 →
                          </button>
                        </div>
                      )}
                    </div>
                  ) : isNewWord ? (
                    // 新词：直接显示全文
                    <div className="text-center">
                      <div className="text-4xl font-mono font-bold tracking-wider text-primary">
                        {currentWord.en}
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">新词学习 · {currentWord.en.length} 个字符 · 照打</div>
                    </div>
                  ) : (
                    // 复习词：显示点号 + 提示字母
                    <div className="text-center">
                      <div className="text-3xl font-mono tracking-widest">
                        {currentWord.en.split('').map((ch, i) => (
                          <span key={i} className={i < hintCount ? 'text-primary font-bold' : 'text-muted-foreground'}>
                            {i < hintCount ? ch : (ch === ' ' ? '  ' : '•')}
                            {i < currentWord.en.length - 1 ? ' ' : ''}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center justify-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{currentWord.en.length} 个字符</span>
                        {hintCount > 0 && <span className="text-warning">已提示 {hintCount} 个字母</span>}
                        <button
                          onClick={() => setHintCount(prev => Math.min(prev + 1, currentWord.en.length))}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-warning/10 text-warning hover:bg-warning/20 transition-colors"
                          title="按H键提示一个字母"
                        >
                          <Lightbulb className="w-3 h-3" />
                          提示 (H)
                        </button>
                        <button
                          onClick={() => setHintCount(currentWord.en.length)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                          title="显示整个单词（本次评级最高记为「困难」）"
                        >
                          显示全词
                        </button>
                        <button
                          onClick={() => tts.speak(currentWord.en, 'en', { scene: 'word', source: 'auto' })}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          title="按空格键播放语音"
                        >
                          <Volume2 className="w-3 h-3" />
                          播放 (空格)
                        </button>
                      </div>
                    </div>
                  )}
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
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className={`w-full px-4 py-2 rounded-lg border border-transparent bg-transparent text-lg font-mono text-center caret-primary focus:outline-none focus:ring-1 focus:ring-primary/15 transition-shadow ${
                    inputError ? 'text-destructive' : ''
                  }`}
                  placeholder={isNewWord ? '照打上方单词...' : '输入英文单词...'}
                  disabled={loading}
                />

                {/* 完成后面板：例句/短语/近义词/相关词（输对时展示） */}
                {input === currentWord.en && (currentWord.examples?.length || currentWord.phrases?.length || currentWord.synonyms?.length || currentWord.related?.length) ? (
                  <div className="mt-4 space-y-3">
                    {currentWord.examples && currentWord.examples.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground mb-1.5">例句</div>
                        <div className="space-y-1.5">
                          {currentWord.examples.slice(0, 2).map((ex, i) => (
                            <div key={i} className="text-sm">
                              <span className="text-muted-foreground font-mono">{ex.en}</span>
                              {ex.cn && <span className="text-xs text-muted-foreground/70 ml-2">{ex.cn}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {currentWord.phrases && currentWord.phrases.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground mb-1.5">短语</div>
                        <div className="flex flex-wrap gap-1.5">
                          {currentWord.phrases.slice(0, 3).map((p, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {p.phrase}{p.cn ? `：${p.cn}` : ''}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {(currentWord.synonyms?.length || currentWord.related?.length) && (
                      <div className="text-xs">
                        <span className="font-semibold text-muted-foreground">同</span>
                        <span className="text-muted-foreground ml-2">
                          {[...(currentWord.synonyms || []), ...(currentWord.related || [])].slice(0, 6).map(s => s.word).join(' / ')}
                        </span>
                      </div>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>

        {/* 虚拟键盘 */}
        {settings?.showKeyboard !== false && input.length < currentWord.en.length && (
          <VirtualKeyboard
            highlightKey={currentWord.en[input.length]?.toLowerCase()}
            showFingerGuide={settings?.showFingerGuide !== false}
            nextKey={currentWord.en[input.length]}
            errorKey={inputError ? targetArr[inputArr.length - 1] : undefined}
          />
        )}
      </div>
    )
  }

  // ========== 结果 ==========
  // 再战错词：把本轮打错的词重排一轮，趁热打铁当日复现（FSRS 学习步长生效的关键）
  const startRematch = () => {
    const wrongIds = new Set(results.filter(r => !r.isCorrect).map(r => r.wordId))
    const rematchQueue = queue.filter(q => wrongIds.has(q.id))
    if (rematchQueue.length === 0) return
    setQueue(rematchQueue)
    setResults([])
    resultsRef.current = []
    setCurrentIdx(0)
    setInput('')
    startTimeRef.current = null
    advancingRef.current = false
    submittingRef.current = false
    setHintCount(0)
    setAutoPlayDone(false)
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
    const correctWords = results.filter(r => r.isCorrect).length

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
              <div className="text-center p-3 rounded-lg bg-secondary/50">
                <div className="text-xl font-bold text-primary">{correctWords}</div>
                <div className="text-xs text-muted-foreground">正确词数</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary/50">
                <div className="text-xl font-bold text-primary">{results.length}</div>
                <div className="text-xs text-muted-foreground">总词数</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary/50">
                <div className="text-xl font-bold text-primary"><CountUp value={wpm} /></div>
                <div className="text-xs text-muted-foreground">WPM</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary/50">
                <div className="text-xl font-bold text-primary"><CountUp value={accuracy} decimals={1} />%</div>
                <div className="text-xs text-muted-foreground">准确率</div>
              </div>
            </div>

            {/* 错词列表 */}
            {results.filter(r => !r.isCorrect).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">需要加强的单词</h3>
                <div className="space-y-1 max-h-60 overflow-y-auto scroll-thin">
                  {results.filter(r => !r.isCorrect).map((r, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-destructive/5">
                      <div>
                        <span className="font-mono font-medium">{r.word}</span>
                        {r.usPhone && <span className="text-xs text-muted-foreground font-mono ml-2">{r.usPhone}</span>}
                        <span className="text-xs text-muted-foreground ml-2">{r.zh}</span>
                      </div>
                      <span className="text-xs text-destructive">准确率 {r.accuracy}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode('select')}>
                返回选择
              </Button>
              <Button className="flex-1" onClick={() => loadQueue(practiceMode)}>
                <RefreshCw className="w-4 h-4 mr-1.5" /> 再练一组
              </Button>
            </div>
            {results.some(r => !r.isCorrect) && (
              <Button className="w-full gap-1.5" size="lg" onClick={startRematch}>
                <Zap className="w-4 h-4" /> 再战 {results.filter(r => !r.isCorrect).length} 个错词（趁热打铁）
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}
