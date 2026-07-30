'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Keyboard, TrendingUp, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { KEYBOARD_ROWS, KEY_TO_FINGER, FINGER_NAMES } from '@/lib/typing'
import { cn } from '@/lib/utils'

interface KeyStats {
  total: number
  errors: number
  accuracy: number
}

interface StatsData {
  keyStats: Record<string, KeyStats>
  totalAllKeys: number
  totalAllErrors: number
  overallAccuracy: number
  moduleStats: any[]
  dailyStats: Record<string, { keys: number; errors: number }>
}

// 根据准确率返回颜色（绿→黄→红渐变）
function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 95) return 'bg-green-500 text-white'
  if (accuracy >= 88) return 'bg-lime-500 text-white'
  if (accuracy >= 80) return 'bg-amber-500 text-white'
  if (accuracy >= 70) return 'bg-orange-500 text-white'
  return 'bg-red-500 text-white'
}

const FINGER_DOT_COLORS: Record<string, string> = {
  'L-pinky': 'bg-sky-300',
  'L-ring': 'bg-sky-400',
  'L-middle': 'bg-sky-500',
  'L-index': 'bg-sky-600',
  'R-index': 'bg-amber-600',
  'R-middle': 'bg-amber-500',
  'R-ring': 'bg-amber-400',
  'R-pinky': 'bg-amber-300',
  'thumb': 'bg-gray-400',
}

function getAccuracyBg(accuracy: number): string {
  if (accuracy >= 95) return 'bg-green-500/20 border-green-500/40 text-green-700 dark:text-green-300'
  if (accuracy >= 88) return 'bg-lime-500/20 border-lime-500/40 text-lime-700 dark:text-lime-300'
  if (accuracy >= 80) return 'bg-amber-500/20 border-amber-500/40 text-amber-700 dark:text-amber-300'
  if (accuracy >= 70) return 'bg-orange-500/20 border-orange-500/40 text-orange-700 dark:text-orange-300'
  return 'bg-red-500/20 border-red-500/40 text-red-700 dark:text-red-300'
}

export default function KeyHeatmap({ onClose }: { onClose?: () => void }) {
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/stats/keys')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        加载键位统计数据...
      </div>
    )
  }

  if (!data || data.totalAllKeys === 0) {
    return (
      <Card>
        <CardContent className="pt-4 pb-4">
          <EmptyState
            icon={Keyboard}
            title="暂无键位统计数据"
            description="完成一些练习后即可查看键位热力图"
          />
        </CardContent>
      </Card>
    )
  }

  // 找出最薄弱的5个键
  const weakKeys = Object.entries(data.keyStats)
    .filter(([k]) => k.length === 1 && k !== ' ')
    .sort((a, b) => a[1].accuracy - b[1].accuracy)
    .slice(0, 5)

  // 指法使用统计
  const fingerStats: Record<string, { errors: number }> = {}
  for (const [key, stats] of Object.entries(data.keyStats)) {
    const finger = KEY_TO_FINGER[key]
    if (finger) {
      if (!fingerStats[finger]) fingerStats[finger] = { errors: 0 }
      fingerStats[finger].errors += stats.errors
    }
  }

  // 30天趋势
  const dailyArray = Object.entries(data.dailyStats)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
  const maxKeys = Math.max(...dailyArray.map(([, v]) => v.keys), 1)

  return (
    <div className="space-y-4">
      {/* 总览 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <Keyboard className="w-5 h-5 mx-auto text-primary mb-1" />
            <div className="text-2xl font-bold">{data.totalAllKeys.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">总击键数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <CheckCircle2 className="w-5 h-5 mx-auto text-success mb-1" />
            <div className="text-2xl font-bold text-success">{data.overallAccuracy}%</div>
            <div className="text-xs text-muted-foreground">总准确率</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <AlertTriangle className="w-5 h-5 mx-auto text-destructive mb-1" />
            <div className="text-2xl font-bold text-destructive">{data.totalAllErrors}</div>
            <div className="text-xs text-muted-foreground">总错误数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <TrendingUp className="w-5 h-5 mx-auto text-amber-500 mb-1" />
            <div className="text-2xl font-bold">{Object.keys(data.keyStats).length}</div>
            <div className="text-xs text-muted-foreground">出错键种</div>
          </CardContent>
        </Card>
      </div>

      {/* 键位热力图 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Keyboard className="w-4 h-4 text-primary" />
            键位准确率热力图
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 max-w-2xl mx-auto">
            {KEYBOARD_ROWS.map((row, i) => (
              <div key={i} className="flex justify-center gap-1.5" style={{ marginLeft: i * 14, marginRight: i * 14 }}>
                {row.map(k => {
                  const stats = data.keyStats[k]
                  const hasData = stats && stats.errors > 0
                  const acc = hasData ? stats.accuracy : -1
                  const finger = KEY_TO_FINGER[k]
                  return (
                    <div
                      key={k}
                      className={cn(
                        'relative select-none rounded-lg border flex items-center justify-center font-mono text-sm font-semibold transition-all',
                        'w-11 h-11',
                        hasData ? getAccuracyBg(acc) : 'bg-card border-border text-muted-foreground'
                      )}
                      title={hasData ? `${k.toUpperCase()} - 准确率 ${acc}% (${stats.errors}次错误)` : `${k.toUpperCase()} - 未出错`}
                    >
                      {k.toUpperCase()}
                      {finger && (
                        <span className={cn('absolute bottom-1 left-1 w-1.5 h-1.5 rounded-full', FINGER_DOT_COLORS[finger])} />
                      )}
                      {hasData && (
                        <span className="absolute -top-1 -right-1 text-[9px] bg-destructive text-white rounded-full px-1 min-w-[14px] text-center">
                          {stats.errors}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
            <div className="flex justify-center pt-1">
              <div className={cn(
                'relative rounded-lg border flex items-center justify-center text-xs font-medium',
                'w-44 h-11',
                data.keyStats[' '] ? getAccuracyBg(data.keyStats[' '].accuracy) : 'bg-card border-border text-muted-foreground'
              )}>
                空格 {data.keyStats[' '] ? `${data.keyStats[' '].accuracy}%` : '未出错'}
                <span className={cn('absolute bottom-1 left-1.5 w-1.5 h-1.5 rounded-full', FINGER_DOT_COLORS['thumb'])} />
              </div>
            </div>
          </div>

          {/* 指法图例 */}
          <div className="flex items-center justify-center gap-4 mt-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-500" />左手</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />右手</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-400" />大拇指</span>
          </div>

          {/* 图例 */}
          <div className="flex items-center justify-center gap-3 mt-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500/30 border border-green-500/40" />≥95%</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-lime-500/30 border border-lime-500/40" />88-94%</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500/40" />80-87%</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-500/30 border border-orange-500/40" />70-79%</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500/30 border border-red-500/40" />&lt;70%</span>
          </div>
        </CardContent>
      </Card>

      {/* 薄弱键 + 指法分布 */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              薄弱键位 Top 5
            </CardTitle>
          </CardHeader>
          <CardContent>
            {weakKeys.length > 0 ? (
              <div className="space-y-2">
                {weakKeys.map(([key, stats], i) => (
                  <div key={key} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
                    <div className={cn('w-9 h-9 rounded-md flex items-center justify-center font-mono font-bold text-white', getAccuracyColor(stats.accuracy))}>
                      {key.toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">第{i + 1}名</span>
                        <span className="text-muted-foreground">{stats.errors}次错误</span>
                      </div>
                      <Progress value={stats.accuracy} className="h-1.5 mt-1" />
                    </div>
                    <div className="text-right">
                      <div className={cn('text-lg font-bold', stats.accuracy < 80 ? 'text-destructive' : 'text-warning')}>
                        {stats.accuracy}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={CheckCircle2} title="暂无薄弱键位，继续保持！" className="py-6" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Keyboard className="w-4 h-4 text-primary" />
              指法错误分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(fingerStats).length > 0 ? (
              <div className="space-y-1.5">
                {Object.entries(fingerStats).sort((a, b) => b[1].errors - a[1].errors).map(([finger, stats]) => {
                  const maxErrors = Math.max(...Object.values(fingerStats).map(f => f.errors))
                  const pct = maxErrors > 0 ? (stats.errors / maxErrors) * 100 : 0
                  return (
                    <div key={finger} className="flex items-center gap-2">
                      <div className="w-20 text-xs text-muted-foreground">{FINGER_NAMES[finger]}</div>
                      <div className="flex-1 h-6 rounded bg-secondary overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary/60 to-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="w-12 text-right text-sm font-medium">{stats.errors}</div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState icon={Keyboard} title="暂无指法数据" className="py-6" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* 14天练习趋势 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4 text-primary" />
            近14天击键量趋势
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailyArray.length > 0 ? (
            <div className="flex items-end justify-between gap-1.5 h-32">
              {dailyArray.map(([day, v]) => {
                const date = new Date(day + 'T00:00:00')
                const h = maxKeys > 0 ? (v.keys / maxKeys) * 100 : 0
                const acc = v.keys > 0 ? Math.round((1 - v.errors / v.keys) * 100) : 100
                return (
                  <div key={day} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute -top-5 whitespace-nowrap bg-card border rounded px-1.5 py-0.5 z-10">
                      {v.keys}键 · {acc}%
                    </div>
                    <div className="w-full bg-secondary rounded-t overflow-hidden flex items-end" style={{ height: '100px' }}>
                      <div
                        className={cn('w-full rounded-t transition-all', acc >= 90 ? 'bg-success/60' : acc >= 80 ? 'bg-warning/60' : 'bg-destructive/60')}
                        style={{ height: `${h}%`, minHeight: v.keys > 0 ? '4px' : '0' }}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground">{date.getDate()}</div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState icon={TrendingUp} title="暂无练习记录" className="py-6" />
          )}
        </CardContent>
      </Card>

      {/* 模块统计 */}
      {data.moduleStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">各模块练习统计</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {data.moduleStats.map((m: any) => (
                <div key={m.module} className="p-3 rounded-lg bg-secondary/50">
                  <div className="text-sm font-medium mb-1">
                    {m.module === 'keyboard' ? '键盘熟悉' :
                     m.module === 'word' ? '单词练习' :
                     m.module === 'sentence' ? '句子练习' :
                     m.module === 'article' ? '阅读理解' :
                     m.module === 'chinese' ? '中文背诵' : m.module}
                  </div>
                  <div className="text-xs text-muted-foreground">{m._count}次练习</div>
                  {m._avg.wpm && <div className="text-xs text-primary mt-0.5">均速 {Math.round(m._avg.wpm)} WPM</div>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
