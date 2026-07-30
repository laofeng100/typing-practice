'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Trophy, Flame, Loader2, Star, Clock, Keyboard, BookOpen, FileText, GraduationCap, Languages } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const UNLOCKED_SNAPSHOT_KEY = 'ach_unlocked' // 实际存储时拼接用户ID，避免同设备多孩子串快照

const TIER_COLORS: Record<number, { bg: string; border: string; glow: string }> = {
  1: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', glow: 'shadow-amber-500/20' },
  2: { bg: 'bg-sky-500/10', border: 'border-sky-500/30', glow: 'shadow-sky-500/20' },
  3: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', glow: 'shadow-purple-500/20' },
  4: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', glow: 'shadow-rose-500/20' },
}

const CATEGORIES = [
  { id: '打卡', icon: Flame, label: '坚持打卡' },
  { id: '键盘', icon: Keyboard, label: '键盘技巧' },
  { id: '单词', icon: BookOpen, label: '词汇积累' },
  { id: '句子', icon: FileText, label: '语法练习' },
  { id: '阅读', icon: GraduationCap, label: '阅读理解' },
  { id: '中文', icon: Languages, label: '中文背诵' },
  { id: '时长', icon: Clock, label: '练习时长' },
]

export default function Achievements({ user }: { user?: any }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()
  const snapshotKey = `${UNLOCKED_SNAPSHOT_KEY}_${user?.id || 'anon'}`

  useEffect(() => {
    fetch('/api/stats/achievements')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        setData(d)
        // 与本地快照对比，检测新解锁成就并弹出庆祝 toast
        try {
          const unlocked = (d.achievements || []).filter((a: any) => a.unlocked)
          const currentIds = unlocked.map((a: any) => String(a.id))
          const prevRaw = localStorage.getItem(snapshotKey)
          if (prevRaw === null) {
            // 首次访问：静默记录快照
            localStorage.setItem(snapshotKey, JSON.stringify(currentIds))
          } else {
            const prevIds: string[] = JSON.parse(prevRaw)
            const newly = unlocked.filter((a: any) => !prevIds.includes(String(a.id))).slice(0, 2)
            newly.forEach((a: any) => {
              toast({
                title: `成就解锁：${a.name}`,
                description: `${a.icon} ${a.desc}`,
                className: 'border-amber-400/60 bg-amber-500/10',
              })
            })
            localStorage.setItem(snapshotKey, JSON.stringify(currentIds))
          }
        } catch {}
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        加载成就数据...
      </div>
    )
  }

  if (!data) return null

  const { stats, achievements, unlockedCount, totalCount, cumulativeGrowth } = data
  const unlockRate = Math.round((unlockedCount / totalCount) * 100)

  // 词汇成长曲线最大值
  const maxGrowth = cumulativeGrowth.length > 0 ? cumulativeGrowth[cumulativeGrowth.length - 1].total : 0

  return (
    <div className="space-y-4">
      {/* 顶部概览 */}
      <Card className="bg-gradient-to-br from-primary/10 via-card to-amber-500/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold mb-1 flex items-center gap-2">
                <Trophy className="w-6 h-6 text-amber-500" />
                我的成就
              </h2>
              <p className="text-sm text-muted-foreground">
                已解锁 {unlockedCount} / {totalCount} 个成就（{unlockRate}%）
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-center px-4 py-2 rounded-lg bg-amber-500/15">
                <div className="text-2xl font-bold text-amber-600">{stats.streak}</div>
                <div className="text-xs text-muted-foreground">连续打卡</div>
              </div>
              <div className="text-center px-4 py-2 rounded-lg bg-primary/15">
                <div className="text-2xl font-bold text-primary">{stats.bestWpm}</div>
                <div className="text-xs text-muted-foreground">最佳WPM</div>
              </div>
              <div className="text-center px-4 py-2 rounded-lg bg-success/15">
                <div className="text-2xl font-bold text-success">{stats.wordLearned}</div>
                <div className="text-xs text-muted-foreground">已学单词</div>
              </div>
            </div>
          </div>
          <Progress value={unlockRate} className="h-2 mt-4" />
        </CardContent>
      </Card>

      {/* 词汇成长曲线 */}
      {cumulativeGrowth.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="w-4 h-4 text-primary" />
              词汇量成长曲线
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative h-40 flex items-end">
              <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.65 0.18 55)" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="oklch(0.65 0.18 55)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {cumulativeGrowth.length > 1 && (() => {
                  const points = cumulativeGrowth.map((g, i) => {
                    const x = (i / (cumulativeGrowth.length - 1)) * 100
                    const y = 100 - (g.total / maxGrowth) * 90
                    return `${x},${y}`
                  })
                  const areaPath = `M0,100 L${points.join(' L')} L100,100 Z`
                  const linePath = `M${points.join(' L')}`
                  return (
                    <>
                      <path d={areaPath} fill="url(#growthGrad)" />
                      <path d={linePath} fill="none" stroke="oklch(0.65 0.18 55)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                    </>
                  )
                })()}
              </svg>
              <div className="relative w-full flex justify-between text-xs text-muted-foreground pt-2">
                <span>{cumulativeGrowth[0]?.day.slice(5)}</span>
                <span>累计 {maxGrowth} 词</span>
                <span>{cumulativeGrowth[cumulativeGrowth.length - 1]?.day.slice(5)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 成就徽章 - 按类别分组 */}
      <Tabs defaultValue="all">
        <TabsList className="w-full overflow-x-auto justify-start">
          <TabsTrigger value="all">
            全部
            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{unlockedCount}/{totalCount}</Badge>
          </TabsTrigger>
          {CATEGORIES.map(c => {
            const catCount = achievements.filter((a: any) => a.category === c.id).length
            const catUnlocked = achievements.filter((a: any) => a.category === c.id && a.unlocked).length
            return (
              <TabsTrigger key={c.id} value={c.id} className="whitespace-nowrap">
                <c.icon className="w-3.5 h-3.5 mr-1" />
                {c.label}
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{catUnlocked}/{catCount}</Badge>
              </TabsTrigger>
            )
          })}
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <AchievementGrid achievements={achievements} />
        </TabsContent>
        {CATEGORIES.map(c => (
          <TabsContent key={c.id} value={c.id} className="mt-4">
            <AchievementGrid achievements={achievements.filter((a: any) => a.category === c.id)} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function AchievementGrid({ achievements }: { achievements: any[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {achievements.map((a) => {
        const tier = TIER_COLORS[a.tier] || TIER_COLORS[1]
        const pct = a.target > 0 ? Math.min(100, (a.progress / a.target) * 100) : 0
        return (
          <Card
            key={a.id}
            className={cn(
              'group relative overflow-hidden transition-all',
              a.unlocked
                ? cn(tier.bg, tier.border, 'ring-1 ring-primary/40 shadow-md shadow-amber-500/25')
                : 'grayscale opacity-40'
            )}
          >
            <CardContent className="pt-4 pb-3 text-center">
              {/* 图标 */}
              <div className={cn(
                'text-4xl mb-2 transition-transform',
                a.unlocked && 'hover:scale-110'
              )}>
                {a.unlocked ? a.icon : '🔒'}
              </div>

              {/* 名称 */}
              <h3 className="font-semibold text-sm mb-0.5">{a.name}</h3>
              <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{a.desc}</p>

              {/* 进度 */}
              {!a.unlocked && a.progress < a.target && (
                <div className="space-y-1">
                  <Progress value={pct} className="h-1" />
                  <div className="text-xs text-muted-foreground">{a.progress} / {a.target}</div>
                </div>
              )}
              {a.unlocked && (
                <div className="flex items-center justify-center gap-0.5 mt-1">
                  {Array.from({ length: a.tier }).map((_, i) => (
                    <Star key={i} className="w-3 h-3 text-amber-400 fill-amber-400" />
                  ))}
                </div>
              )}
            </CardContent>

            {/* hover 显示 progress/target */}
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-0.5">{a.unlocked ? '已完成' : '当前进度'}</div>
                <div className="text-lg font-bold">{a.progress} / {a.target}</div>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
