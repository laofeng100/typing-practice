'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { TTSButton } from './tts-player'
import { Languages, BookOpen, CheckCircle2, ChevronRight, ScrollText, Lightbulb, Brain, Eye, Clock } from 'lucide-react'

const CATEGORY_LABELS: Record<string, string> = {
  '古诗词': '古诗词',
  '文言文': '文言文',
  '现代诗文': '现代诗文',
}

const CATEGORY_COLORS: Record<string, string> = {
  '古诗词': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  '文言文': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  '现代诗文': 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
}

// 四档自评：与 FSRS Rating 一一对应（1=Again 2=Hard 3=Good 4=Easy）
const RATING_OPTIONS = [
  { rating: 1, label: '忘记', desc: '完全背不出来', color: 'border-destructive/40 hover:bg-destructive/10 text-destructive' },
  { rating: 2, label: '模糊', desc: '磕磕绊绊想起来', color: 'border-orange-400/40 hover:bg-orange-500/10 text-orange-600' },
  { rating: 3, label: '记得', desc: '基本流利背出', color: 'border-primary/40 hover:bg-primary/10 text-primary' },
  { rating: 4, label: '轻松', desc: '脱口而出', color: 'border-green-500/40 hover:bg-green-500/10 text-green-600' },
]

// 卡片状态徽章
function stateBadge(t: any) {
  if (!t.practiced) return <Badge variant="outline" className="text-xs">未学</Badge>
  if (t.isDue) return <Badge variant="destructive" className="text-xs">待复习</Badge>
  if (t.cardState === 1 || t.cardState === 3) return <Badge variant="secondary" className="text-xs">学习中</Badge>
  return <Badge variant="outline" className="text-xs text-green-600 border-green-500/40">已掌握 · 复习{t.reps}次</Badge>
}

export default function ChineseModule({ user, settings, onProgress }: any) {
  const [mode, setMode] = useState<'list' | 'recite' | 'result'>('list')
  const [stage, setStage] = useState('小学')
  const [texts, setTexts] = useState<any[]>([])
  const [reviewQueue, setReviewQueue] = useState<any[]>([])
  const [current, setCurrent] = useState<any>(null)
  const [currentCard, setCurrentCard] = useState<any>(null)
  const [revealed, setRevealed] = useState(false)
  const [showAnnotation, setShowAnnotation] = useState(false)
  const [vertical, setVertical] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lastRating, setLastRating] = useState<number | null>(null)
  const [queueMode, setQueueMode] = useState(false) // 是否正在连续复习队列
  const startTimeRef = useRef<number>(0)
  const submittingRef = useRef(false)
  const { toast } = useToast()

  const loadList = async (s?: string) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/chinese?stage=${s || stage}`)
      if (r.status === 403) {
        const d = await r.json().catch(() => ({}))
        toast({ title: '今日已达练习上限', description: d.error || '明天再来吧' })
        return
      }
      const d = await r.json()
      setTexts(d.texts || [])
      setReviewQueue(d.reviewQueue || [])
    } catch (e: any) {
      toast({ title: '加载失败', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadList() }, [stage])

  const loadText = async (id: number, fromQueue = false) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/chinese?id=${id}`)
      if (r.status === 403) {
        const d = await r.json().catch(() => ({}))
        toast({ title: '今日已达练习上限', description: d.error || '明天再来吧' })
        return
      }
      const d = await r.json()
      if (!d.text) {
        toast({ title: '加载失败', description: d.error || '课文不存在', variant: 'destructive' })
        return
      }
      setCurrent(d.text)
      setCurrentCard(d.card)
      setRevealed(false)
      setShowAnnotation(false)
      setVertical(false)
      setQueueMode(fromQueue)
      startTimeRef.current = Date.now()
      setMode('recite')
    } catch (e: any) {
      toast({ title: '加载失败', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  // 自评提交：零击键 + 显式 rating，服务端走 FSRS-6 调度（chinese 独立学科队列）
  const submitRating = async (rating: number) => {
    if (!current || submittingRef.current) return
    submittingRef.current = true
    setLoading(true)
    const duration = Date.now() - startTimeRef.current
    try {
      const resp = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: 'chinese',
          subModule: String(current.id),
          durationMs: duration,
          totalKeys: 0,
          correctKeys: 0,
          totalChars: current.content.length,
          records: [{
            cardType: 'chinese',
            cardId: String(current.id),
            cardState: currentCard?.state ?? 0,
            targetText: current.content,
            durationMs: duration,
            totalKeys: 0,
            correctKeys: 0,
            rating,
          }],
        }),
      })
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}))
        throw new Error(d.error || '提交失败')
      }
      const d = await resp.json().catch(() => null)
      d?.newAchievements?.slice(0, 3).forEach((a: any, i: number) => {
        setTimeout(() => toast({ title: `${a.icon} 成就解锁：${a.name}`, description: a.desc }), 400 + i * 700)
      })
      setLastRating(rating)
      onProgress?.()
      // 连续复习：队列里还有下一篇则直接进入
      const remaining = reviewQueue.filter(q => q.id !== current.id)
      setReviewQueue(remaining)
      if (queueMode && remaining.length > 0) {
        await loadText(remaining[0].id, true)
      } else {
        setMode('result')
        loadList()
      }
    } catch (e: any) {
      toast({ title: '提交失败', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
      submittingRef.current = false
    }
  }

  // ========== 列表 ==========
  if (mode === 'list') {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <Languages className="w-6 h-6 text-primary" />
            古诗词背诵
          </h1>
          <p className="text-sm text-muted-foreground">先回忆背诵，翻开原文对照，再如实自评 —— FSRS 会安排最佳复习时机</p>
        </div>

        {/* 今日待复习队列 */}
        {reviewQueue.length > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" />
                  今日待复习（{reviewQueue.length} 篇）
                </CardTitle>
                <Button size="sm" onClick={() => loadText(reviewQueue[0].id, true)} disabled={loading}>
                  开始复习 <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {reviewQueue.map(q => (
                  <button
                    key={q.id}
                    onClick={() => loadText(q.id, false)}
                    className="px-2.5 py-1 rounded-md border border-primary/30 bg-background text-xs hover:bg-primary/10 transition-colors"
                  >
                    {q.title}
                    {typeof q.retrievability === 'number' && q.retrievability < 0.8 && (
                      <span className="ml-1 text-destructive">⚠</span>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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

        {/* 课文列表 */}
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : texts.length === 0 ? (
          <Card><CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">暂无课文</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {texts.map((t, i) => (
              <Card key={t.id} className="cursor-pointer hover:border-primary/40 hover:shadow-md transition-all" onClick={() => loadText(t.id)}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ScrollText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium truncate">{t.title}</span>
                        {stateBadge(t)}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                        <Badge variant="outline" className={`text-xs ${CATEGORY_COLORS[t.category]}`}>{CATEGORY_LABELS[t.category] || t.category}</Badge>
                        {t.author && <span>{t.dynasty ? t.dynasty + '·' : ''}{t.author}</span>}
                        <span>·</span>
                        <span>{t.grade}</span>
                        <span>·</span>
                        <span>{t.wordCount}字</span>
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

  // ========== 背诵自评 ==========
  if (mode === 'recite' && current) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setMode('list'); loadList() }}>← 返回列表</Button>
          <div className="flex items-center gap-2">
            {queueMode && <Badge variant="secondary">连续复习 · 剩{reviewQueue.length}篇</Badge>}
            <Badge variant="outline" className={CATEGORY_COLORS[current.category]}>{CATEGORY_LABELS[current.category] || current.category}</Badge>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold mb-1 flex items-center gap-2 flex-wrap">
            {current.title}
            <TTSButton
              text={[
                current.title,
                current.author ? `${current.dynasty ? current.dynasty + '，' : ''}${current.author}` : '',
                current.content,
              ].filter(Boolean).join('。')}
              lang="cn" scene="chinese" size="sm" variant="outline" label="朗读"
            />
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {current.author && <span>{current.dynasty ? current.dynasty + '·' : ''}{current.author}</span>}
            <span>·</span>
            <span>{current.grade}</span>
            <span>·</span>
            <span>{current.wordCount}字</span>
            {currentCard && currentCard.reps > 0 && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />已复习{currentCard.reps}次</span>
              </>
            )}
          </div>
        </div>

        {!revealed ? (
          /* 回忆阶段：只给标题和作者，先在心里/口头背诵 */
          <Card>
            <CardContent className="pt-10 pb-10 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 mx-auto flex items-center justify-center">
                <Brain className="w-7 h-7 text-primary" />
              </div>
              <div>
                <p className="font-medium mb-1">先凭记忆背诵这篇课文</p>
                <p className="text-xs text-muted-foreground">出声背诵或默背都可以，背完再翻开原文对照</p>
              </div>
              <Button size="lg" onClick={() => setRevealed(true)}>
                <Eye className="w-4 h-4 mr-1.5" /> 翻开原文对照
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 原文对照 */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                    <BookOpen className="w-4 h-4" /> 原文对照
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Button
                      variant={vertical ? 'default' : 'ghost'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setVertical(v => !v)}
                    >
                      竖排
                    </Button>
                    {(current.annotation || current.translation) && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAnnotation(!showAnnotation)}>
                        <Lightbulb className="w-3.5 h-3.5 mr-1" />{showAnnotation ? '收起注释' : '注释/译文'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    vertical ? 'max-h-[420px] overflow-x-auto overflow-y-hidden px-2 py-3 rounded-md bg-secondary/20' : ''
                  )}
                  style={vertical ? { writingMode: 'vertical-rl' } : undefined}
                >
                  <div className="text-lg leading-loose whitespace-pre-wrap break-words">{current.content}</div>
                </div>

                <AnimatePresence initial={false}>
                  {showAnnotation && (current.annotation || current.translation) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 space-y-3">
                        {current.annotation && (
                          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                            <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">注释</div>
                            <div className="text-sm text-muted-foreground">{current.annotation}</div>
                          </div>
                        )}
                        {current.translation && (
                          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                            <div className="text-xs font-semibold text-primary mb-1">译文</div>
                            <div className="text-sm text-muted-foreground">{current.translation}</div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>

            {/* 四档自评 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">刚才背得怎么样？如实自评，复习安排才准确</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {RATING_OPTIONS.map(o => (
                    <button
                      key={o.rating}
                      disabled={loading}
                      onClick={() => submitRating(o.rating)}
                      className={cn(
                        'p-3 rounded-lg border-2 text-center transition-colors disabled:opacity-50',
                        o.color
                      )}
                    >
                      <div className="font-bold">{o.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{o.desc}</div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    )
  }

  // ========== 结果 ==========
  if (mode === 'result') {
    const opt = RATING_OPTIONS.find(o => o.rating === lastRating)
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/15 mx-auto flex items-center justify-center mb-3">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">背诵复习完成！</CardTitle>
            <p className="text-sm text-muted-foreground">
              {current?.title}{opt ? ` · 自评「${opt.label}」` : ''}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              FSRS 已根据你的自评安排下次复习时间，到期后会出现在「今日待复习」里
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode('list')}>返回列表</Button>
              {reviewQueue.length > 0 && (
                <Button className="flex-1" onClick={() => loadText(reviewQueue[0].id, true)}>
                  继续复习（剩{reviewQueue.length}篇）
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}
