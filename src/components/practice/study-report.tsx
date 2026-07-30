'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Loader2, Clock, Target, TrendingUp, TrendingDown, Minus, Lightbulb, Calendar, Zap, Award, BarChart3, Flame } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

const RANGES = [
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'all', label: '全部' },
]

const SUGGESTION_ICONS = [Lightbulb, Target, TrendingUp, Flame, Zap]

const MODULE_NAMES: Record<string, string> = {
  keyboard: '键盘熟悉',
  word: '单词练习',
  sentence: '句子练习',
  article: '阅读理解',
  listening: '听力练习',
  chinese: '中文背诵',
}

export default function StudyReport() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('week')

  useEffect(() => {
    let cancelled = false
    const loadData = async () => {
      await Promise.resolve()
      if (cancelled) return
      setLoading(true)
      try {
        const r = await fetch(`/api/stats/report?range=${range}`)
        const d = r.ok ? await r.json() : null
        if (!cancelled) {
          if (d) setData(d)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    loadData()
    return () => { cancelled = true }
  }, [range])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        生成学习报告中...
      </div>
    )
  }

  if (!data) return null

  const { summary, moduleStats, dailyArray, topErrorKeys, cardsByType, suggestions, progressComparison } = data

  // 计算每日最大值用于柱状图
  const maxDailyMs = Math.max(...dailyArray.map((d: any) => d[1].ms), 60000)

  return (
    <div className="space-y-5">
      {/* 时间范围切换 */}
      <div className="grid grid-cols-3 w-full max-w-xs rounded-lg bg-muted p-1">
        {RANGES.map(r => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={cn(
              'relative rounded-md py-1.5 text-sm font-medium transition-colors',
              range === r.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {range === r.value && (
              <motion.span
                layoutId="report-range-indicator"
                className="absolute inset-0 rounded-md bg-background shadow-sm"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{r.label}</span>
          </button>
        ))}
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={Clock}
          label="练习时长"
          value={`${summary.totalMinutes}`}
          unit="分钟"
          color="primary"
          delta={progressComparison?.minutes}
        />
        <MetricCard
          icon={Zap}
          label="平均速度"
          value={`${summary.avgWpm}`}
          unit="WPM"
          color="amber"
          delta={progressComparison?.wpm}
        />
        <MetricCard
          icon={Target}
          label="准确率"
          value={`${summary.overallAccuracy}`}
          unit="%"
          color="green"
          delta={progressComparison?.accuracy}
        />
        <MetricCard
          icon={Flame}
          label="连续打卡"
          value={`${summary.streak}`}
          unit="天"
          color="rose"
        />
      </div>

      {/* 进步对比 */}
      {progressComparison && (
        <Card className="bg-gradient-to-br from-primary/5 via-card to-accent/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4 text-primary" />
              进步对比（vs 上一周期）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <ComparisonItem label="练习时长" prev={progressComparison.minutes.prev} curr={progressComparison.minutes.curr} unit="分钟" delta={progressComparison.minutes.delta} good={progressComparison.minutes.delta > 0} />
              <ComparisonItem label="平均WPM" prev={progressComparison.wpm.prev} curr={progressComparison.wpm.curr} unit="WPM" delta={progressComparison.wpm.delta} good={progressComparison.wpm.delta > 0} />
              <ComparisonItem label="准确率" prev={progressComparison.accuracy.prev} curr={progressComparison.accuracy.curr} unit="%" delta={progressComparison.accuracy.delta} good={progressComparison.accuracy.delta > 0} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 每日练习趋势 */}
      {dailyArray.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="w-4 h-4 text-primary" />
              每日练习趋势
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-1 h-32">
              {dailyArray.map(([day, v]: any) => {
                const h = maxDailyMs > 0 ? (v.ms / maxDailyMs) * 100 : 0
                const min = Math.floor(v.ms / 60000)
                const acc = v.keys > 0 ? Math.round((v.correct / v.keys) * 1000) / 10 : 100
                const date = new Date(day + 'T00:00:00')
                return (
                  <div key={day} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity absolute -top-6 whitespace-nowrap bg-card border rounded px-1.5 py-0.5 z-10">
                      {min}分钟 · {acc}%
                    </div>
                    <div className="text-[10px] text-muted-foreground h-3">{min > 0 ? `${min}'` : ''}</div>
                    <div className="w-full bg-secondary rounded-t overflow-hidden flex items-end" style={{ height: '100px' }}>
                      <div
                        className={cn('w-full rounded-t transition-all', acc >= 90 ? 'bg-primary' : acc >= 80 ? 'bg-primary/60' : 'bg-primary/30')}
                        style={{ height: `${h}%`, minHeight: v.ms > 0 ? '4px' : '0' }}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {date.getMonth() + 1}/{date.getDate()}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 模块分布 + 薄弱键 */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="w-4 h-4 text-primary" />
              各模块练习分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(moduleStats).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(moduleStats).map(([mod, stat]: any) => {
                  const minutes = Math.floor(stat.ms / 60000)
                  const pct = summary.totalMinutes > 0 ? (minutes / summary.totalMinutes) * 100 : 0
                  const acc = stat.keys > 0 ? Math.round((stat.correct / stat.keys) * 1000) / 10 : 0
                  return (
                    <div key={mod}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium">{MODULE_NAMES[mod] || mod}</span>
                        <span className="text-muted-foreground">{stat.count}次 · {minutes}分钟 · {acc}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState icon={BarChart3} title="暂无练习数据" className="py-6" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="w-4 h-4 text-primary" />
              薄弱键位 Top 10
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topErrorKeys.length > 0 ? (
              <div className="grid grid-cols-5 gap-2">
                {topErrorKeys.map(([key, count]: any, i: number) => (
                  <div key={key} className={cn(
                    'aspect-square rounded-lg flex flex-col items-center justify-center font-mono border-2',
                    i < 3 ? 'border-destructive/40 bg-destructive/10' : 'border-warning/30 bg-warning/5'
                  )}>
                    <div className={cn('text-xl font-bold', i < 3 ? 'text-destructive' : 'text-warning')}>
                      {key.toUpperCase()}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{count}次</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Target} title="暂无错误记录" className="py-6" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* 记忆卡片状态 */}
      {Object.keys(cardsByType).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="w-4 h-4 text-primary" />
              FSRS 记忆卡片状态
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(cardsByType).map(([type, stat]: any) => (
                <div key={type} className="p-3 rounded-lg bg-secondary/50">
                  <div className="text-sm font-medium mb-2">{MODULE_NAMES[type] || type}</div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">已学</span>
                      <span className="font-medium">{stat.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">学习中</span>
                      <span className="text-warning">{stat.learning}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">已巩固</span>
                      <span className="text-success">{stat.review}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">待复习</span>
                      <span className="text-destructive font-medium">{stat.due}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI学习建议 */}
      {suggestions.length > 0 && (
        <Card className="bg-gradient-to-br from-amber-500/5 via-card to-primary/5 border-amber-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              个性化学习建议
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {suggestions.map((s: string, i: number) => {
                const SIcon = SUGGESTION_ICONS[i % SUGGESTION_ICONS.length]
                return (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-card/80">
                    <div className="w-6 h-6 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                      <SIcon className="w-3.5 h-3.5 text-amber-600" />
                    </div>
                    <p className="text-sm">{s}</p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 活跃天数 + 总会话 */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-5 text-center">
            <Calendar className="w-5 h-5 mx-auto text-primary mb-1" />
            <div className="text-2xl font-bold">{summary.activeDays}</div>
            <div className="text-xs text-muted-foreground">活跃天数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 text-center">
            <BarChart3 className="w-5 h-5 mx-auto text-primary mb-1" />
            <div className="text-2xl font-bold">{summary.totalSessions}</div>
            <div className="text-xs text-muted-foreground">练习次数</div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, unit, color, delta }: any) {
  const colors: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    amber: 'bg-amber-500/10 text-amber-600',
    green: 'bg-green-500/10 text-green-600',
    rose: 'bg-rose-500/10 text-rose-600',
  }
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', colors[color])}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold">{value}</span>
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
        {delta && delta.delta !== 0 && (
          <div className={cn('text-xs mt-1 flex items-center gap-0.5', delta.delta > 0 ? 'text-success' : delta.delta < 0 ? 'text-destructive' : 'text-muted-foreground')}>
            {delta.delta > 0 ? <TrendingUp className="w-3 h-3" /> : delta.delta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {delta.delta > 0 ? '+' : ''}{delta.delta} vs 上期
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ComparisonItem({ label, prev, curr, unit, delta, good }: any) {
  const pct = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : (curr > 0 ? 100 : 0)
  return (
    <div className="text-center">
      <div className="text-xs text-muted-foreground mb-2">{label}</div>
      <div className="flex items-center justify-center gap-2 mb-1">
        <span className="text-xs text-muted-foreground line-through">{prev}{unit}</span>
        <span className="text-lg font-bold">{curr}{unit}</span>
      </div>
      <Badge variant="outline" className={cn('text-xs', good ? 'text-success border-success/30' : delta < 0 ? 'text-destructive border-destructive/30' : '')}>
        {delta > 0 ? '↑' : delta < 0 ? '↓' : '−'} {Math.abs(delta)}{unit} ({pct > 0 ? '+' : ''}{pct}%)
      </Badge>
    </div>
  )
}
