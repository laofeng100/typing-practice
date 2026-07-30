'use client'

function safeParseArray(json: string | null | undefined): any[] {
  if (!json) return []
  try { const p = JSON.parse(json); return Array.isArray(p) ? p : [] } catch { return [] }
}

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { GraduationCap, CheckCircle2, XCircle, RefreshCw, Lock, ChevronRight, ListChecks, FileText, BookOpen } from 'lucide-react'

const CATEGORY_LABELS: Record<string, string> = {
  '传统文化': '传统文化',
  '科技前沿': '科技前沿',
  '生态文明': '生态文明',
  '劳动教育': '劳动教育',
  '思辨表达': '思辨表达',
  '多模态': '多模态',
}

const CATEGORY_COLORS: Record<string, string> = {
  '传统文化': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  '科技前沿': 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  '生态文明': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  '劳动教育': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  '思辨表达': 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  '多模态': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
}

export default function ReadingModule({ user, settings, onProgress, advancedUnlocked }: any) {
  const [mode, setMode] = useState<'list' | 'reading' | 'result'>('list')
  const [stage, setStage] = useState(user.stage)
  const [articles, setArticles] = useState<any[]>([])
  const [current, setCurrent] = useState<any>(null)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [activeVocab, setActiveVocab] = useState<number | null>(null)
  const { toast } = useToast()
  const startTimeRef = useRef(0)

  const loadList = async (s?: string) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/article?stage=${s || stage}`)
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

  const loadArticle = async (id: number) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/article?id=${id}`)
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
      setActiveVocab(null)
      setMode('reading')
      startTimeRef.current = Date.now()
    } catch (e: any) {
      toast({ title: '加载失败', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
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
    // 按测验正确率映射 FSRS 评级（阅读无打字数据，必须显式传 rating）
    const rating = accuracy >= 90 ? 4 : accuracy >= 70 ? 3 : accuracy >= 50 ? 2 : 1

    // 提交阅读完成记录（无打字数据，仅记录阅读练习）
    const durationMs = Math.max(1000, Date.now() - startTimeRef.current)
    try {
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: 'article',
          subModule: String(current.id),
          durationMs,
          totalKeys: 0,
          correctKeys: 0,
          totalChars: 0,
          score: accuracy,
          records: [{
            cardType: 'article',
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
    } catch (e: any) {
      // 静默失败，不影响用户
    }

    setResult({ correct, total: questions.length, accuracy })
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

  // ========== 文章列表 ==========
  if (mode === 'list') {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            阅读理解
          </h1>
          <p className="text-sm text-muted-foreground">纯阅读理解模式 · 紧扣中高考改革方向 · 多样化题型</p>
        </div>

        {/* 学段选择 */}
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

        {/* 文章列表 */}
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : articles.length === 0 ? (
          <Card><CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">暂无文章</CardContent></Card>
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
                        {a.practiced && <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Badge variant="outline" className={`text-xs ${CATEGORY_COLORS[a.category]}`}>{CATEGORY_LABELS[a.category] || a.category}</Badge>
                        <span>{a.wordCount}词</span>
                        <span>·</span>
                        <span>{a.difficulty}</span>
                        {a.reps > 0 && <span>· 已练习{a.reps}次</span>}
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

  // ========== 阅读理解 ==========
  if (mode === 'reading' && current) {
    const questions = safeParseArray(current.questions)
    const allAnswered = questions.every((_: any, i: number) => answers[i] !== undefined)

    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setMode('list')}>← 返回列表</Button>
          <Badge variant="outline" className={CATEGORY_COLORS[current.category]}>{CATEGORY_LABELS[current.category] || current.category}</Badge>
        </div>

        {/* 文章标题 */}
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

        {/* 英文原文 - 纯阅读，无打字 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <BookOpen className="w-4 h-4" /> 英文原文
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-base leading-[1.75] space-y-4 max-w-2xl mx-auto whitespace-pre-wrap break-words">
              {current.content}
            </div>
          </CardContent>
        </Card>

        {/* 核心词汇（点击查看释义） */}
        {current.vocabulary && safeParseArray(current.vocabulary).length > 0 && (
          <Card className="bg-secondary/30">
            <CardContent className="pt-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-primary" />
                核心词汇
                <span className="text-xs font-normal text-muted-foreground">（点击单词查看释义）</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {safeParseArray(current.vocabulary).map((v: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => setActiveVocab(activeVocab === i ? null : i)}
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-primary/5 ${
                      activeVocab === i ? 'border-primary bg-primary/10 text-primary' : 'text-foreground'
                    }`}
                  >
                    {v.en}
                  </button>
                ))}
              </div>
              <AnimatePresence>
                {activeVocab !== null && safeParseArray(current.vocabulary)[activeVocab] && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setActiveVocab(null)} />
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.15 }}
                      className="relative z-50 mt-3 p-3 rounded-lg border bg-card shadow-md flex items-start gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-primary">{safeParseArray(current.vocabulary)[activeVocab].en}</div>
                        <div className="text-sm text-muted-foreground mt-0.5">{safeParseArray(current.vocabulary)[activeVocab].zh}</div>
                      </div>
                      <button onClick={() => setActiveVocab(null)} className="text-muted-foreground hover:text-foreground flex-shrink-0" aria-label="关闭">
                        <XCircle className="w-4 h-4" />
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        )}

        {/* 选择题 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-primary" />
              阅读理解题
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
                        <RadioGroupItem value={String(j)} id={`q${i}o${j}`} className="mt-1" disabled={submitted} />
                        <Label htmlFor={`q${i}o${j}`} className="text-sm font-normal cursor-pointer flex-1">{opt}</Label>
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
              <Button className="w-full" disabled={!allAnswered} onClick={submitQuiz}>
                提交答案
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
            <CardTitle className="text-2xl">阅读完成！</CardTitle>
            <p className="text-sm text-muted-foreground">{current?.title}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 rounded-lg bg-secondary/50">
                <div className="text-xl font-bold text-primary">{result.correct}/{result.total}</div>
                <div className="text-xs text-muted-foreground">答对题数</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary/50">
                <div className="text-xl font-bold text-primary">{result.accuracy}%</div>
                <div className="text-xs text-muted-foreground">正确率</div>
              </div>
            </div>

            {/* 逐题对错 */}
            {current && (
              <div className="space-y-1.5">
                {safeParseArray(current.questions).map((q: any, i: number) => {
                  const ok = answers[i] === q.answer
                  return (
                    <div key={i} className={`flex items-center gap-2 p-2 rounded-lg text-sm ${ok ? 'bg-green-500/10' : 'bg-destructive/10'}`}>
                      {ok
                        ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        : <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />}
                      <span className="flex-1 truncate">第{i + 1}题 · {q.q}</span>
                      <span className={`text-xs flex-shrink-0 ${ok ? 'text-green-600' : 'text-destructive'}`}>{ok ? '正确' : '错误'}</span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode('list')}>返回列表</Button>
              <Button className="flex-1" onClick={() => loadArticle(current.id)}>
                <RefreshCw className="w-4 h-4 mr-1.5" />再读一次
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}
