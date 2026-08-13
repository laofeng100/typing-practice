'use client'

import { Fragment } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { RingProgress } from '@/components/ui/ring-progress'
import { motion } from 'framer-motion'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { KEYBOARD_LEVELS } from '@/lib/typing'
import {
  Keyboard, BookOpen, FileText, GraduationCap, Headphones,
  Clock, Zap, Target, TrendingUp, Trophy, Flame, Lock, Check, Star
} from 'lucide-react'

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ENCOURAGEMENTS = [
  '每天进步一点点，坚持就是胜利',
  '指下生风，单词不过如此',
  '打字如弹琴，节奏最重要',
  '今天的练习，是明天的自信',
  '积少成多，你比昨天更快了',
]

function timeGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return '早上好'
  if (h >= 12 && h < 18) return '下午好'
  return '晚上好'
}

type NodeStatus = 'completed' | 'current' | 'unlocked' | 'locked'

export default function Dashboard({ data, onNavigate }: { data: any; onNavigate: (v: string) => void }) {
  if (!data || !data.user) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
        <div className="h-24 rounded-xl bg-secondary/50 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-xl bg-secondary/50 animate-pulse" />)}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1,2,3,4,5].map(i => <div key={i} className="h-32 rounded-xl bg-secondary/50 animate-pulse" />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="h-64 rounded-xl bg-secondary/50 animate-pulse" />
          <div className="h-64 rounded-xl bg-secondary/50 animate-pulse" />
        </div>
      </div>
    )
  }

  const { user, todayStat, settings, keyboardProgress, keyboardUnlocked, advancedUnlocked, bestWpm, bestAccuracy, dueCards, newCards, wordProgress, recentSessions, streak = 0 } = data

  const usedMin = Math.floor((todayStat?.totalMs || 0) / 60000)
  const limitMin = settings?.dailyLimitMin || 15
  const timePercent = Math.min(100, (usedMin / limitMin) * 100)

  // 7天趋势数据
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000)
    const dateStr = toLocalDateStr(d)
    const sessions = recentSessions?.filter((s: any) => toLocalDateStr(new Date(s.startedAt)) === dateStr) || []
    const totalMs = sessions.reduce((sum: number, s: any) => sum + s.durationMs, 0)
    return {
      date: d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
      minutes: Math.floor(totalMs / 60000),
      wpm: sessions.length > 0 ? Math.round(sessions.reduce((sum: number, s: any) => sum + s.wpm, 0) / sessions.length) : 0,
    }
  })

  // 今日主行动：键盘未通关→键盘；有待复习→单词；否则→单词新学
  const primaryAction = !keyboardUnlocked && !advancedUnlocked
    ? { label: '继续键盘闯关', view: 'keyboard' }
    : dueCards > 0
      ? { label: `消灭 ${dueCards} 个待复习`, view: 'word' }
      : { label: '开始今日学习', view: 'word' }

  // 时段问候 + 按年内日序轮换鼓励语
  const now = new Date()
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
  const encouragement = ENCOURAGEMENTS[dayOfYear % ENCOURAGEMENTS.length]

  // 学习路径 6 节点
  const pathNodes = [
    { id: 'keyboard', label: '键盘熟悉', icon: Keyboard },
    { id: 'word', label: '单词', icon: BookOpen },
    { id: 'sentence', label: '句子', icon: FileText },
    { id: 'reading', label: '阅读', icon: GraduationCap },
    { id: 'listening', label: '听力', icon: Headphones },
  ]
  const nodeCompleted = pathNodes.map((_, i) => i === 0 && !!keyboardUnlocked)
  const firstIncomplete = nodeCompleted.findIndex(c => !c)
  const nodeStatuses: NodeStatus[] = pathNodes.map((_, i) => {
    if (nodeCompleted[i]) return 'completed'
    if (i === 0) return 'current'
    if (!advancedUnlocked) return 'locked'
    return i === firstIncomplete ? 'current' : 'unlocked'
  })

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* 今日任务卡 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="bg-gradient-to-br from-primary/10 via-card to-accent/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-4">
                <RingProgress value={timePercent} size={56} strokeWidth={6}>
                  <span className="text-[11px] font-bold tnum text-primary">{Math.round(timePercent)}%</span>
                </RingProgress>
                <div className="min-w-0">
                  <h1 className="text-xl font-bold">
                    {timeGreeting()}，{user.name}
                  </h1>
                  <p className="text-sm text-muted-foreground mt-0.5">{encouragement}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                {dueCards > 0 && (
                  <Badge variant="subtle" className="gap-1 py-1.5 animate-pulse-soft cursor-pointer" onClick={() => onNavigate('word')}>
                    <Zap className="w-3 h-3" />
                    {dueCards} 个待复习
                  </Badge>
                )}
                <Badge variant="outline" className="gap-1.5 py-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  {user.stage} · {user.grade}
                </Badge>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Flame className="w-7 h-7 text-primary" />
                  <div>
                    <div className="text-[28px] leading-8 font-bold tnum">{streak}</div>
                    <div className="text-xs text-muted-foreground -mt-0.5">连续打卡天数</div>
                  </div>
                </div>
                <Button size="lg" className="gap-1.5 text-base px-6" onClick={() => onNavigate(primaryAction.view)}>
                  <Zap className="w-4 h-4" />
                  {primaryAction.label}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 今日数据 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Clock}
          label="今日时长"
          value={`${usedMin}`}
          unit="分钟"
          sub={`上限 ${limitMin} 分钟`}
          color="primary"
          progress={timePercent}
        />
        <StatCard
          icon={Zap}
          label="待复习"
          value={`${dueCards}`}
          unit="个"
          sub={newCards > 0 ? `今日新学 ${newCards} 词` : '今日暂无新词'}
          color="amber"
        />
        <StatCard
          icon={TrendingUp}
          label="最佳速度"
          value={`${bestWpm}`}
          unit="WPM"
          sub={`准确率 ${bestAccuracy}%`}
          color="green"
        />
        <StatCard
          icon={Target}
          label="已学单词"
          value={`${wordProgress?.[0]?._count || 0}`}
          unit="个"
          sub={`共 ${data.wordProgress?.[0]?._count ? '持续学习中' : '尚未开始'}`}
          color="purple"
        />
      </div>

      {/* 学习路径步骤条 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Flame className="w-4 h-4 text-primary" />
            学习路径
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start overflow-x-auto pb-1">
            {pathNodes.map((node, i) => {
              const status = nodeStatuses[i]
              const locked = status === 'locked'
              const Icon = node.icon
              const segDone = i > 0 && nodeStatuses[i - 1] === 'completed' && status !== 'locked'
              return (
                <Fragment key={node.id}>
                  {i > 0 && (
                    <div className={`flex-1 min-w-3 h-1 rounded-full mt-[18px] mx-1 ${segDone ? 'bg-success' : 'bg-border'}`} />
                  )}
                  <button
                    onClick={() => !locked && onNavigate(node.id)}
                    disabled={locked}
                    title={locked ? `需WPM≥${settings?.wpmUnlockThreshold || 40} 解锁` : node.label}
                    className={`flex flex-col items-center gap-1.5 w-14 sm:w-16 shrink-0 group ${locked ? 'cursor-not-allowed' : ''}`}
                  >
                    <motion.span
                      whileHover={locked ? {} : { scale: 1.08 }}
                      whileTap={locked ? {} : { scale: 0.96 }}
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        status === 'completed'
                          ? 'bg-success text-white'
                          : status === 'current'
                          ? 'bg-primary text-primary-foreground animate-pulse-soft'
                          : status === 'unlocked'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {status === 'completed' ? (
                        <Check className="w-5 h-5" />
                      ) : locked ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                    </motion.span>
                    <span className={`text-xs text-center leading-tight ${locked ? 'text-muted-foreground/60' : status === 'current' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                      {node.label}
                    </span>
                  </button>
                </Fragment>
              )
            })}
          </div>
          {!advancedUnlocked && (
            <p className="text-xs text-muted-foreground mt-4">
              当前最佳WPM <span className="tnum">{bestWpm}</span>，达到 <span className="tnum">{settings?.wpmUnlockThreshold || 40}</span> 即可解锁单词等高级练习
            </p>
          )}
        </CardContent>
      </Card>

      {/* 键盘关卡进度 + 7天趋势 */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Keyboard className="w-4 h-4 text-primary" />
              键盘关卡进度
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {KEYBOARD_LEVELS.map((lv) => {
                const p = keyboardProgress?.find((k: any) => k.level === lv.level)
                const done = p?.status === 'completed'
                const pct = p ? (done ? 100 : Math.round(((p.stars || 0) / 3) * 100)) : 0
                return (
                  <div key={lv.level} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${done ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary'}`}>
                      {done ? <Check className="w-3.5 h-3.5" /> : lv.level}
                    </div>
                    <span className="text-sm font-medium w-16 sm:w-20 shrink-0 truncate">{lv.title}</span>
                    <Progress value={pct} className="h-1.5 flex-1" />
                    <div className="flex gap-0.5 shrink-0">
                      {[1,2,3].map(s => (
                        <Star key={s} className={`w-3.5 h-3.5 ${p && s <= p.stars ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'}`} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            {(keyboardProgress?.length || 0) < 6 && (
              <Button className="w-full mt-4" onClick={() => onNavigate('keyboard')}>
                {keyboardProgress?.length > 0 ? '继续练习' : '开始第一关'}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4 text-primary" />
              近7天练习趋势
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={last7Days} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="30%">
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} interval={0} />
                <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.6 }} content={<TrendTooltip />} />
                <Bar dataKey="minutes" radius={[6, 6, 0, 0]}>
                  {last7Days.map((d, i) => (
                    <Cell
                      key={i}
                      fill="var(--primary)"
                      fillOpacity={i === last7Days.length - 1 ? 1 : 0.3}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground pt-3 border-t">
              <span>本周总时长：<span className="tnum">{last7Days.reduce((s, d) => s + d.minutes, 0)}</span> 分钟</span>
              <span>平均速度：<span className="tnum">{last7Days.filter(d => d.wpm > 0).length > 0 ? Math.round(last7Days.reduce((s, d) => s + d.wpm, 0) / last7Days.filter(d => d.wpm > 0).length) : 0}</span> WPM</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, unit, sub, color, progress }: any) {
  const colors: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    amber: 'bg-amber-500/10 text-amber-600',
    green: 'bg-green-500/10 text-green-600',
    purple: 'bg-purple-500/10 text-purple-600',
  }
  return (
    <motion.div whileHover={{ y: -3 }} transition={{ type: 'spring', stiffness: 300 }}>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="pt-5">
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs text-muted-foreground">{label}</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color]}`}>
              <Icon className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-2xl font-bold tnum">{value}</span>
            <span className="text-xs text-muted-foreground">{unit}</span>
          </div>
          <div className="text-xs text-muted-foreground">{sub}</div>
          {progress !== undefined && (
            <Progress value={progress} className="h-1 mt-2" />
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

function TrendTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium mb-1">{d.date}</div>
      <div className="text-muted-foreground">时长 <span className="tnum text-foreground">{d.minutes}</span> 分钟</div>
      <div className="text-muted-foreground">均速 <span className="tnum text-foreground">{d.wpm}</span> WPM</div>
    </div>
  )
}
