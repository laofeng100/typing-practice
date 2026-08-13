'use client'

import { useEffect, useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { VirtualKeyboard, TypingDisplay } from './typing-components'
import { Skeleton } from '@/components/ui/skeleton'
import { PracticeHUD } from './practice-hud'
import { Target, Keyboard, BookOpen, FileText, CheckCircle2, RefreshCw, Zap, AlertTriangle, ChevronRight } from 'lucide-react'

type FocusedType = 'keys' | 'words' | 'sentences'

export default function FocusedPractice({ settings, onProgress, initialType, initialId }: { settings?: any; onProgress?: () => void; initialType?: FocusedType; initialId?: number | string }) {
  const [mode, setMode] = useState<'select' | 'practice' | 'result'>('select')
  const [type, setType] = useState<FocusedType>(initialType || 'keys')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [exerciseIdx, setExerciseIdx] = useState(0)
  const [input, setInput] = useState('')
  const startTimeRef = useRef<number | null>(null)
  const advancingRef = useRef(false) // 完成判定守卫：防止延迟前进窗口期内重复触发
  const submittingRef = useRef(false) // 提交守卫：防止双重 POST
  const [results, setResults] = useState<any[]>([])
  const resultsRef = useRef<any[]>([])
  const [errorKeys, setErrorKeys] = useState<string[]>([])
  const [flash, setFlash] = useState<'success' | 'error' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const loadData = async (t: FocusedType, focusId?: number | string) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/practice/focused?type=${t}${focusId ? `&focusId=${focusId}` : ''}`)
      if (r.status === 403) {
        const d = await r.json().catch(() => ({}))
        toast({ title: '今日已达练习上限', description: d.error || '明天再来吧' })
        return
      }
      const d = await r.json()
      if (t === 'keys' && (!d.exercises || d.exercises.length === 0)) {
        toast({ title: '暂无薄弱键数据', description: '继续练习后系统会自动识别薄弱键' })
        setLoading(false)
        return
      }
      if ((t === 'words' || t === 'sentences') && (!d.words?.length && !d.sentences?.length)) {
        toast({ title: '暂无错题', description: '继续练习后薄弱项会自动收集' })
        setLoading(false)
        return
      }
      setData(d)
      setType(t)
      setExerciseIdx(0)
      setInput('')
      startTimeRef.current = null
      advancingRef.current = false
      submittingRef.current = false
      setResults([])
      resultsRef.current = []
      setErrorKeys([])
      setMode('practice')
      setTimeout(() => inputRef.current?.focus(), 100)
    } catch (e: any) {
      toast({ title: '加载失败', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  // 从错题本跳入：自动加载指定类型（initialId 指定卡置顶，入依赖保证不重挂载时也能响应新错题）
  useEffect(() => {
    if (initialType) loadData(initialType, initialId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialType, initialId])

  const current = mode === 'practice' ? (
    type === 'keys' ? data?.exercises?.[exerciseIdx] :
    type === 'words' ? data?.words?.[exerciseIdx] :
    data?.sentences?.[exerciseIdx]
  ) : null

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!current) return
    const v = e.target.value
    if (!startTimeRef.current && v.length > 0) startTimeRef.current = Date.now()
    setInput(v)

    const targetText = type === 'keys' ? current.text : type === 'words' ? current.en : current.en
    const targetArr = [...targetText]
    const inputArr = [...v]
    const errs: string[] = []
    for (let i = 0; i < inputArr.length; i++) {
      if (inputArr[i] !== targetArr[i] && targetArr[i]) errs.push(targetArr[i].toLowerCase())
    }
    setErrorKeys(errs)

    if (v.length >= targetText.length) {
      const correctCount = inputArr.filter((ch, i) => ch === targetArr[i]).length
      const acc = v.length > 0 ? Math.round((correctCount / v.length) * 1000) / 10 : 0
      setFlash(acc >= 85 ? 'success' : 'error')
      setTimeout(() => setFlash(null), 200)
      finishCurrent(v, targetText, errs)
    }
  }

  const finishCurrent = (v: string, target: string, errs: string[]) => {
    if (!current) return
    if (advancingRef.current) return // 延迟前进窗口期内忽略多余按键
    advancingRef.current = true
    const duration = startTimeRef.current ? Date.now() - startTimeRef.current : 0
    const targetArr = [...target]
    const inputArr = [...v]
    const correct = inputArr.filter((ch, i) => ch === targetArr[i]).length
    const wpm = duration > 0 ? Math.round((correct / 5) / (duration / 60000)) : 0
    const accuracy = v.length > 0 ? Math.round((correct / v.length) * 1000) / 10 : 0
    const isCorrect = accuracy >= 85

    const result = {
      targetText: target,
      inputText: v,
      durationMs: duration,
      correctKeys: correct,
      totalKeys: v.length,
      errorKeys: errs,
      wpm,
      accuracy,
      isCorrect,
      cardType: type === 'words' ? 'word' : type === 'sentences' ? 'sentence' : null,
      cardId: type === 'words' ? current.id : type === 'sentences' ? current.id : null,
      cardState: type === 'keys' ? null : (current.cardState ?? null),
    }
    setResults(prev => [...prev, result])
    resultsRef.current = [...resultsRef.current, result]

    const total = type === 'keys' ? data.exercises.length : type === 'words' ? data.words.length : data.sentences.length
    if (exerciseIdx < total - 1) {
      setTimeout(() => {
        setExerciseIdx(prev => prev + 1)
        setInput('')
        startTimeRef.current = null
        setErrorKeys([])
        advancingRef.current = false
        inputRef.current?.focus()
      }, isCorrect ? 500 : 1200)
    } else {
      const allResults = [...resultsRef.current]
      setTimeout(() => finishPractice(allResults), 600)
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
          module: type === 'keys' ? 'keyboard' : type === 'words' ? 'word' : 'sentence',
          subModule: `focused-${type}`,
          durationMs: totalDuration,
          totalKeys,
          correctKeys: totalCorrect,
          totalChars: totalKeys,
          records: allResults.map(r => ({
            cardType: r.cardType,
            cardId: r.cardId ? String(r.cardId) : undefined,
            cardState: r.cardState ?? undefined,
            targetText: r.targetText,
            inputText: r.inputText,
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
      onProgress?.()
      setMode('result')
    } catch (e: any) {
      toast({ title: '提交失败', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
      submittingRef.current = false
    }
  }

  // ========== 选择页 ==========
  if (mode === 'select') {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <Target className="w-6 h-6 text-primary" />
            专项练习
          </h1>
          <p className="text-sm text-muted-foreground">基于错题本和薄弱键数据，针对性突破薄弱环节</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <Card
            className="cursor-pointer hover:border-primary/40 hover:shadow-md transition-all"
            onClick={() => loadData('keys')}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Keyboard className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">薄弱键突破</CardTitle>
                  <p className="text-xs text-muted-foreground">键位强化训练</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">自动识别错误最多的键位，针对性强化练习</p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:border-primary/40 hover:shadow-md transition-all"
            onClick={() => loadData('words')}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <CardTitle className="text-base">错题单词</CardTitle>
                  <p className="text-xs text-muted-foreground">高难度/遗忘词</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">集中练习错题本中的薄弱单词</p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:border-primary/40 hover:shadow-md transition-all"
            onClick={() => loadData('sentences')}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-base">错题句子</CardTitle>
                  <p className="text-xs text-muted-foreground">语法巩固</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">复习高难度/多次遗忘的句子</p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">专项练习说明</p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                  <li>薄弱键突破：系统自动统计你的错误键位，生成针对性训练</li>
                  <li>错题单词/句子：来自错题本，FSRS难度高或多次遗忘的内容</li>
                  <li>专项练习结果会同步到FSRS记忆系统，影响后续复习调度</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ========== 练习中 ==========
  if (mode === 'practice' && current) {
    const targetText = type === 'keys' ? current.text : type === 'words' ? current.en : current.en
    const targetArr = [...targetText]
    const total = type === 'keys' ? data.exercises.length : type === 'words' ? data.words.length : data.sentences.length
    const progress = (exerciseIdx / total) * 100
    const elapsedMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0
    const currentWpm = elapsedMs > 0 && input.length > 0 ? Math.round((input.split('').filter((ch, i) => ch === targetArr[i]).length / 5) / (elapsedMs / 60000)) : 0
    const liveAcc = input.length > 0 ? Math.round((input.split('').filter((ch, i) => ch === targetArr[i]).length / input.length) * 1000) / 10 : 100
    const inputError = input.length > 0 && input[input.length - 1] !== targetArr[input.length - 1]

    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
        <PracticeHUD wpm={currentWpm} accuracy={liveAcc} current={exerciseIdx + 1} total={total} />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setMode('select')}>← 返回</Button>
          <div className="flex items-center gap-2">
            {type === 'keys' && <Badge variant="outline">薄弱键专项</Badge>}
            {type === 'words' && <Badge variant="outline">错题单词</Badge>}
            {type === 'sentences' && <Badge variant="outline">错题句子</Badge>}
            <Badge variant="outline">{exerciseIdx + 1} / {total}</Badge>
          </div>
        </div>
        <Progress value={progress} className="h-1.5" />

        <AnimatePresence mode="wait">
          <motion.div key={exerciseIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <Card className={`transition-all duration-200 ${
              flash === 'success' ? 'border-success ring-2 ring-success/50' :
              flash === 'error' ? 'border-destructive ring-2 ring-destructive/50' : ''
            }`}>
              <CardContent className="pt-6 pb-6">
                {/* 标题/提示 */}
                <div className="text-center mb-4">
                  {type === 'keys' && (
                    <>
                      <div className="text-lg font-bold mb-1">{current.title}</div>
                      <div className="flex items-center justify-center gap-1">
                        {(current.focusKeys || []).map((k: string) => (
                          <span key={k} className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-mono uppercase">{k}</span>
                        ))}
                      </div>
                    </>
                  )}
                  {type === 'words' && (
                    <>
                      <div className="text-2xl font-bold mb-1">{current.zh}</div>
                      <div className="flex items-center justify-center gap-2">
                        <Badge variant="secondary">{current.pos}</Badge>
                        <Badge variant="outline">难度 {current.difficulty_card?.toFixed(1)}</Badge>
                        <Badge variant="outline">遗忘{current.lapses}次</Badge>
                      </div>
                    </>
                  )}
                  {type === 'sentences' && (
                    <>
                      <div className="text-base font-medium text-muted-foreground mb-1">{current.zh}</div>
                      <div className="flex items-center justify-center gap-2">
                        <Badge variant="secondary">{current.grammarPoint}</Badge>
                        <Badge variant="outline">难度{current.difficulty_card?.toFixed(1)}</Badge>
                      </div>
                    </>
                  )}
                </div>

                {/* 目标文本 */}
                <div
                  className="bg-secondary/30 rounded-lg p-4 mb-4 cursor-text"
                  onClick={() => inputRef.current?.focus()}
                >
                  <TypingDisplay target={targetText} input={input} size="sentence" />
                </div>

                {/* 输入框 */}
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={handleInput}
                  autoFocus
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                  className={`w-full px-4 py-2 rounded-lg border border-transparent bg-transparent font-mono text-base text-center caret-primary focus:outline-none focus:ring-1 focus:ring-primary/15 transition-shadow ${
                    inputError ? 'text-destructive' : ''
                  }`}
                  placeholder="输入上方文本..."
                  disabled={loading}
                />
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>

        {settings?.showKeyboard !== false && input.length < targetText.length && (
          <VirtualKeyboard
            highlightKey={targetText[input.length]?.toLowerCase()}
            errorKeys={errorKeys}
            showFingerGuide={settings?.showFingerGuide !== false}
            nextKey={targetText[input.length]}
            errorKey={inputError ? targetArr[input.length - 1] : undefined}
          />
        )}
      </div>
    )
  }

  // ========== 结果 ==========
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
            <CardTitle className="text-2xl">专项练习完成！</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-3 rounded-lg bg-secondary/50">
                <div className="text-xl font-bold text-primary">{correctCount}</div>
                <div className="text-xs text-muted-foreground">正确</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary/50">
                <div className="text-xl font-bold text-primary">{results.length}</div>
                <div className="text-xs text-muted-foreground">总数</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary/50">
                <div className="text-xl font-bold text-primary">{wpm}</div>
                <div className="text-xs text-muted-foreground">WPM</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary/50">
                <div className="text-xl font-bold text-primary">{accuracy}%</div>
                <div className="text-xs text-muted-foreground">准确率</div>
              </div>
            </div>

            {accuracy >= 85 && (
              <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-sm text-center">
                <Zap className="w-4 h-4 inline mr-1 text-success" />
                薄弱项有进步！FSRS系统已更新记忆状态
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode('select')}>返回选择</Button>
              <Button className="flex-1" onClick={() => loadData(type)}>
                <RefreshCw className="w-4 h-4 mr-1.5" />再练一轮
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  return null
}
