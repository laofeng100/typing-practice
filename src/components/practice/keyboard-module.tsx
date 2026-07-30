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
import { StarReveal } from './star-reveal'
import { Confetti } from './confetti'
import { KEYBOARD_LEVELS } from '@/lib/typing'
import { CheckCircle2, Star, Trophy, Clock, Target, ChevronRight, RefreshCw, Keyboard, Lock } from 'lucide-react'

interface SessionResult {
  wpm: number
  accuracy: number
  durationMs: number
  correctKeys: number
  totalKeys: number
  errorKeys: string[]
  targetText: string
  inputText: string
}

export default function KeyboardModule({ settings, onProgress, todayUsedMin, dailyLimitMin }: {
  settings?: any; onProgress?: () => void; todayUsedMin?: number; dailyLimitMin?: number
}) {
  const [currentLevel, setCurrentLevel] = useState(1)
  const [phase, setPhase] = useState<'select' | 'practice' | 'result'>('select')
  const [exerciseIndex, setExerciseIndex] = useState(0)
  const [input, setInput] = useState('')
  const [startTime, setStartTime] = useState<number | null>(null) // 整个关卡开始时间
  const [errorKeys, setErrorKeys] = useState<string[]>([])
  const [sessionResults, setSessionResults] = useState<SessionResult[]>([])
  const sessionResultsRef = useRef<SessionResult[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [progressMap, setProgressMap] = useState<Record<number, any>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const exerciseStartRef = useRef<number | null>(null)
  const advancingRef = useRef(false) // 完成判定守卫：防止延迟前进窗口期内重复触发
  const submittingRef = useRef(false) // 提交守卫：防止双重 POST
  const { toast } = useToast()
  const dailyExceeded = todayUsedMin !== undefined && dailyLimitMin !== undefined && todayUsedMin >= dailyLimitMin

  const level = KEYBOARD_LEVELS[currentLevel - 1]
  const exercise = level?.exercises[exerciseIndex]

  // 加载已解锁关卡和进度（403 = 今日时长已达上限）
  useEffect(() => {
    fetch('/api/progress?module=keyboard')
      .then(async r => {
        if (r.status === 403) {
          const d = await r.json().catch(() => ({}))
          toast({ title: '今日练习已达上限', description: d.error || '明天再来吧', variant: 'destructive' })
          return null
        }
        return r.json()
      })
      .then(d => {
        if (!d) return
        if (d?.maxUnlocked) setCurrentLevel(Math.min(d.maxUnlocked, KEYBOARD_LEVELS.length))
        // 构建进度映射
        const map: Record<number, any> = {}
        for (const p of d?.progress || []) {
          map[p.level] = p
        }
        setProgressMap(map)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resetExercise = useCallback(() => {
    setInput('')
    setStartTime(null)
    exerciseStartRef.current = null
    advancingRef.current = false
    submittingRef.current = false
    setErrorKeys([])
    setSessionResults([])
    sessionResultsRef.current = []
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    const now = Date.now()
    if (!startTime && v.length > 0) setStartTime(now)
    if (!exerciseStartRef.current && v.length > 0) exerciseStartRef.current = now
    setInput(v)

    // 记录错误键
    const targetArr = [...exercise]
    const inputArr = [...v]
    const errs: string[] = []
    for (let i = 0; i < inputArr.length; i++) {
      if (inputArr[i] !== targetArr[i] && targetArr[i]) {
        errs.push(targetArr[i].toLowerCase())
      }
    }
    setErrorKeys(errs)

    // 完成本条
    if (v.length >= exercise.length) {
      if (advancingRef.current) return // 延迟前进窗口期内忽略多余按键
      advancingRef.current = true
      const duration = exerciseStartRef.current ? now - exerciseStartRef.current : 0
      const correct = [...v].filter((ch, i) => ch === targetArr[i]).length
      const result: SessionResult = {
        wpm: duration > 0 ? Math.round((correct / 5) / (duration / 60000)) : 0,
        accuracy: v.length > 0 ? Math.round((correct / v.length) * 1000) / 10 : 0,
        durationMs: duration,
        correctKeys: correct,
        totalKeys: v.length,
        errorKeys: errs,
        targetText: exercise,
        inputText: v,
      }
      setSessionResults(prev => [...prev, result])
      sessionResultsRef.current = [...sessionResultsRef.current, result]

      // 进入下一条
      if (exerciseIndex < level.exercises.length - 1) {
        setTimeout(() => {
          setExerciseIndex(prev => prev + 1)
          setInput('')
          exerciseStartRef.current = null
          setErrorKeys([])
          advancingRef.current = false
          inputRef.current?.focus()
        }, 600)
      } else {
        // 全部完成，提交 - 使用 ref 避免闭包陷阱
        const allResults = [...sessionResultsRef.current]
        setTimeout(() => finishLevel(allResults), 600)
      }
    }
  }

  const finishLevel = async (results: SessionResult[]) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    const totalCorrect = results.reduce((s, r) => s + r.correctKeys, 0)
    const totalKeys = results.reduce((s, r) => s + r.totalKeys, 0)
    const totalDuration = results.reduce((s, r) => s + r.durationMs, 0)
    const wpm = totalDuration > 0 ? Math.round((totalCorrect / 5) / (totalDuration / 60000)) : 0
    const accuracy = totalKeys > 0 ? Math.round((totalCorrect / totalKeys) * 1000) / 10 : 0

    const passed = wpm >= level.passWpm && accuracy >= level.passAccuracy
    const stars = passed ? (wpm >= level.passWpm * 1.5 ? 3 : wpm >= level.passWpm * 1.2 ? 2 : 1) : 0

    try {
      const sessionResp = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: 'keyboard',
          subModule: `level${currentLevel}`,
          level: currentLevel,
          durationMs: totalDuration,
          totalKeys,
          correctKeys: totalCorrect,
          totalChars: totalKeys,
          passWpm: level.passWpm,
          passAccuracy: level.passAccuracy,
          stars,
          records: results.map(r => ({
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
      setPhase('result')
      onProgress?.()
      toast(passed ? { title: `恭喜通过第${currentLevel}关！`, description: `${stars}星 · ${wpm} WPM` } : { title: '继续努力', description: `需达到 ${level.passWpm} WPM` })
    } catch (e: any) {
      toast({ title: '提交失败', description: e.message, variant: 'destructive' })
    } finally {
      setSubmitting(false)
      submittingRef.current = false
    }
  }

  // ========== 关卡选择 ==========
  if (phase === 'select') {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <Keyboard className="w-6 h-6 text-primary" />
            键盘熟悉训练
          </h1>
          <p className="text-sm text-muted-foreground">六关渐进式训练，从基准键位到综合打字。达到 {settings?.wpmUnlockThreshold || 40} WPM 即可解锁单词等高级练习</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {KEYBOARD_LEVELS.map((lv, idx) => {
            const isLocked = idx > 0 && currentLevel <= idx
            const isCurrent = currentLevel === lv.level
            const prog = progressMap[lv.level]
            const isCompleted = prog?.status === 'completed'
            const stars = prog?.stars || 0
            const bestWpm = prog?.bestWpm || 0
            const bestAcc = prog?.bestAccuracy || 0
            return (
              <Card
                key={lv.level}
                variant={isLocked ? 'default' : 'interactive'}
                className={`relative overflow-hidden ${
                  isLocked ? 'opacity-50 cursor-not-allowed' :
                  isCompleted ? 'border-green-500/40 bg-green-500/5' :
                  isCurrent ? 'border-primary shadow-md' : ''
                }`}
                onClick={() => {
                  if (isLocked) return
                  if (dailyExceeded) { toast({ title: '今日已达练习上限', description: `每天最多 ${dailyLimitMin} 分钟，明天再来吧` }); return }
                  setCurrentLevel(lv.level); setPhase('practice'); setExerciseIndex(0); resetExercise()
                }}
              >
                {isCompleted && (
                  <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-bl-lg font-medium">
                    已通关
                  </div>
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold ${
                        isLocked ? 'bg-muted text-muted-foreground' :
                        isCompleted ? 'bg-green-500/15 text-green-600' :
                        isCurrent ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
                      }`}>
                        {isLocked ? <Lock className="w-4 h-4" /> : isCompleted ? <CheckCircle2 className="w-4 h-4" /> : lv.level}
                      </div>
                      <div>
                        <CardTitle className="text-base">{lv.title}</CardTitle>
                        <p className="text-xs text-muted-foreground">{lv.keys.length} 键位 · {lv.exercises.length} 练习</p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3">{lv.description}</p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {lv.keys.slice(0, 8).map(k => (
                      <span key={k} className="px-1.5 py-0.5 rounded bg-secondary text-xs font-mono">{k}</span>
                    ))}
                    {lv.keys.length > 8 && <span className="px-1.5 py-0.5 text-xs text-muted-foreground">...</span>}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">达标：{lv.passWpm} WPM / {lv.passAccuracy}%</span>
                    {isCurrent && !isCompleted && <Badge variant="default">当前</Badge>}
                    {!isLocked && (
                      <div className="flex gap-0.5">
                        {[1,2,3].map(s => (
                          <Star key={s} className={`w-3 h-3 ${s <= stars ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'}`} />
                        ))}
                      </div>
                    )}
                  </div>
                  {bestWpm > 0 && (
                    <div className="mt-2 pt-2 border-t flex items-center justify-between">
                      <Badge variant="playful" className="tnum">最佳 {bestWpm} WPM</Badge>
                      <span className="text-xs text-muted-foreground tnum">{bestAcc}% 准确率</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  // ========== 练习中 ==========
  if (phase === 'practice' && exercise) {
    const targetArr = [...exercise]
    const inputArr = [...input]
    const progress = (exerciseIndex / level.exercises.length) * 100
    // 累计时间 = 已完成条目的时间 + 当前条目的时间
    const completedDuration = sessionResults.reduce((s, r) => s + r.durationMs, 0)
    const currentExerciseDuration = exerciseStartRef.current ? Date.now() - exerciseStartRef.current : 0
    const totalElapsedMs = completedDuration + currentExerciseDuration
    const elapsedMs = totalElapsedMs
    // 累计正确数 = 已完成 + 当前
    const completedCorrect = sessionResults.reduce((s, r) => s + r.correctKeys, 0)
    const currentCorrect = inputArr.filter((ch, i) => ch === targetArr[i]).length
    const totalCorrect = completedCorrect + currentCorrect
    const completedKeys = sessionResults.reduce((s, r) => s + r.totalKeys, 0)
    const totalKeys = completedKeys + input.length
    const currentWpm = elapsedMs > 0 ? Math.round((totalCorrect / 5) / (elapsedMs / 60000)) : 0
    const currentAcc = totalKeys > 0 ? Math.round((totalCorrect / totalKeys) * 1000) / 10 : 100

    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
        {/* 顶部信息 */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setPhase('select')}>← 返回</Button>
            <h2 className="text-lg font-bold">第{currentLevel}关 · {level.title}</h2>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="gap-1.5"><Clock className="w-3 h-3" />{Math.floor(elapsedMs / 1000)}s</Badge>
            <Badge variant="outline" className="gap-1.5"><Target className="w-3 h-3" />{currentWpm} WPM</Badge>
            <Badge variant={currentAcc >= level.passAccuracy ? 'default' : 'destructive'} className="gap-1.5">{currentAcc}%</Badge>
          </div>
        </div>

        <Progress value={progress} className="h-1.5" />
        <div className="text-xs text-muted-foreground text-center">
          练习 {exerciseIndex + 1} / {level.exercises.length}
        </div>

        {/* 打字区 */}
        <Card>
          <CardContent className="pt-6 pb-6">
            <div
              className="bg-secondary/30 rounded-lg p-6 mb-2 cursor-text"
              onClick={() => inputRef.current?.focus()}
            >
              <TypingDisplay target={exercise} input={input} fontSize="large" />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={handleInputChange}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full px-4 py-2 rounded-lg border border-transparent bg-transparent text-lg font-mono text-center caret-primary focus:outline-none focus:ring-1 focus:ring-primary/15 transition-shadow"
              placeholder="在此输入..."
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              提示：手指放在基准键位（ASDF JKL;），输入完成后自动进入下一条
            </p>
          </CardContent>
        </Card>

        {/* 虚拟键盘 */}
        {settings?.showKeyboard !== false && (
          <VirtualKeyboard
            highlightKey={input.length < exercise.length ? exercise[input.length].toLowerCase() : null}
            errorKeys={errorKeys}
            showFingerGuide={settings?.showFingerGuide !== false}
            nextKey={input.length < exercise.length ? exercise[input.length] : undefined}
            errorKey={input.length > 0 && exercise[input.length - 1] && input[input.length - 1] !== exercise[input.length - 1] ? exercise[input.length - 1] : undefined}
          />
        )}

        <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={resetExercise}>
          <RefreshCw className="w-4 h-4" /> 重新开始本关
        </Button>
      </div>
    )
  }

  // ========== 结果 ==========
  if (phase === 'result') {
    const totalCorrect = sessionResults.reduce((s, r) => s + r.correctKeys, 0)
    const totalKeys = sessionResults.reduce((s, r) => s + r.totalKeys, 0)
    const totalDuration = sessionResults.reduce((s, r) => s + r.durationMs, 0)
    const wpm = totalDuration > 0 ? Math.round((totalCorrect / 5) / (totalDuration / 60000)) : 0
    const accuracy = totalKeys > 0 ? Math.round((totalCorrect / totalKeys) * 1000) / 10 : 0
    const passed = wpm >= level.passWpm && accuracy >= level.passAccuracy
    const stars = passed ? (wpm >= level.passWpm * 1.5 ? 3 : wpm >= level.passWpm * 1.2 ? 2 : 1) : 0

    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative">
          {stars === 3 && <Confetti />}
          <Card className={passed ? 'border-green-500/40' : ''}>
            <CardHeader className="text-center pb-2">
              <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-3 ${
                passed ? 'bg-green-500/15' : 'bg-amber-500/15'
              }`}>
                {passed ? <Trophy className="w-10 h-10 text-amber-500" /> : <Target className="w-10 h-10 text-amber-500" />}
              </div>
              <CardTitle className="text-2xl">
                {passed ? '恭喜过关！' : '差一点点'}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                第{currentLevel}关 · {level.title}
              </p>
              {passed && (
                <div className="mt-3">
                  <StarReveal stars={stars as 0 | 1 | 2 | 3} />
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-lg bg-secondary/50">
                  <div className="text-2xl font-bold text-primary tnum"><CountUp value={wpm} /></div>
                  <div className="text-xs text-muted-foreground">WPM</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-secondary/50">
                  <div className="text-2xl font-bold text-primary tnum"><CountUp value={accuracy} decimals={1} />%</div>
                  <div className="text-xs text-muted-foreground">准确率</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-secondary/50">
                  <div className="text-2xl font-bold text-primary">{Math.floor(totalDuration / 1000)}s</div>
                  <div className="text-xs text-muted-foreground">用时</div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-secondary/30 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">达标要求</span>
                  <span>{level.passWpm} WPM · {level.passAccuracy}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">你的成绩</span>
                  <span className={passed ? 'text-green-600 font-medium' : 'text-destructive font-medium'}>
                    {wpm} WPM · {accuracy}% {passed ? '✓' : '✗'}
                  </span>
                </div>
              </div>

              {!passed && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
                  <p className="font-medium text-amber-700 dark:text-amber-400">继续加油！</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {wpm < level.passWpm ? `速度还差 ${level.passWpm - wpm} WPM，` : ''}
                    {accuracy < level.passAccuracy ? `准确率还差 ${(level.passAccuracy - accuracy).toFixed(1)}%` : ''}
                    多练习几次就能通过啦
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setPhase('practice'); setExerciseIndex(0); resetExercise() }}>
                  <RefreshCw className="w-4 h-4 mr-1.5" /> 再练一次
                </Button>
                {passed && currentLevel < 6 ? (
                  <Button className="flex-1" onClick={() => { setCurrentLevel(currentLevel + 1); setPhase('practice'); setExerciseIndex(0); resetExercise() }}>
                    下一关 <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                ) : (
                  <Button className="flex-1" onClick={() => { setPhase('select'); onProgress?.() }}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> 完成
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    )
  }

  return null
}
