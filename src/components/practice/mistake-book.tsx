'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BookX, AlertTriangle, RotateCcw, Brain, TrendingDown, Loader2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

interface MistakeItem {
  // word 条目 id 为 head_word 字符串（如 "about"），sentence 条目 id 为数字；两者皆可作为 focusId 透传
  id: number | string
  en?: string
  zh?: string
  pos?: string
  grammarPoint?: string
  stage: string
  difficulty: string
  cardState: number
  stability: number
  difficulty_card: number
  reps: number
  lapses: number
  totalTyping: number
  totalErrors: number
  errorRate: number
  due: string
}

export default function MistakeBook({ onPractice }: { onPractice?: (type: string, id: number | string) => void }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/mistakes')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        加载错题本...
      </div>
    )
  }

  if (!data || data.stats.totalMistakes === 0) {
    return (
      <Card>
        <CardContent className="pt-4 pb-4">
          <EmptyState
            icon={BookX}
            title="错题本是空的"
            description="继续练习，薄弱项会自动收集到这里"
          />
        </CardContent>
      </Card>
    )
  }

  const { stats, grouped } = data

  return (
    <div className="space-y-4">
      {/* 统计概览 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <BookX className="w-5 h-5 mx-auto text-primary mb-1" />
            <div className="text-2xl font-bold">{stats.totalMistakes}</div>
            <div className="text-xs text-muted-foreground">总错题数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <AlertTriangle className="w-5 h-5 mx-auto text-warning mb-1" />
            <div className="text-2xl font-bold text-warning">{stats.highDifficulty}</div>
            <div className="text-xs text-muted-foreground">高难度项</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <RotateCcw className="w-5 h-5 mx-auto text-destructive mb-1" />
            <div className="text-2xl font-bold text-destructive">{stats.forgotten}</div>
            <div className="text-xs text-muted-foreground">多次遗忘</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Brain className="w-5 h-5 mx-auto text-purple-500 mb-1" />
            <div className="text-2xl font-bold">{stats.byType.word}</div>
            <div className="text-xs text-muted-foreground">单词错题</div>
          </CardContent>
        </Card>
      </div>

      {/* 分类标签 */}
      <Tabs defaultValue="word">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="word">
            单词 ({grouped.word.length})
          </TabsTrigger>
          <TabsTrigger value="sentence">
            句子 ({grouped.sentence.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="word" className="mt-4">
          <MistakeList items={grouped.word} type="word" onPractice={onPractice} />
        </TabsContent>
        <TabsContent value="sentence" className="mt-4">
          <MistakeList items={grouped.sentence} type="sentence" onPractice={onPractice} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MistakeList({ items, type, onPractice }: { items: MistakeItem[]; type: string; onPractice?: (type: string, id: number | string) => void }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="pt-2 pb-2">
          <EmptyState icon={BookX} title="本类暂无错题" className="py-8" />
        </CardContent>
      </Card>
    )
  }

  const getDifficultyColor = (d: number) => {
    if (d >= 8) return 'bg-red-500'
    if (d >= 6) return 'bg-orange-500'
    if (d >= 4) return 'bg-amber-500'
    return 'bg-lime-500'
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Card key={`${type}-${item.id}`} className="hover:border-primary/30 transition-colors">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              {/* 难度指示条 */}
              <div className={cn('w-1.5 self-stretch rounded-full', getDifficultyColor(item.difficulty_card))} />

              <div className="flex-1 min-w-0">
                {/* 标题/单词 */}
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-medium">
                    {type === 'word' && item.en}
                    {type === 'sentence' && item.en?.slice(0, 50) + (item.en && item.en.length > 50 ? '...' : '')}
                  </span>
                  <Badge variant="outline" className="text-xs">{item.stage}</Badge>
                </div>

                {/* 副信息 */}
                <div className="text-sm text-muted-foreground mb-2">
                  {type === 'word' && `${item.zh} · ${item.pos}`}
                  {type === 'sentence' && item.zh}
                  {type === 'sentence' && item.grammarPoint && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-secondary text-xs">{item.grammarPoint}</span>
                  )}
                </div>

                {/* 错题数据 */}
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <span className="flex items-center gap-1">
                    <TrendingDown className="w-3 h-3 text-destructive" />
                    错误率 <span className="text-destructive font-medium">{item.errorRate}%</span>
                  </span>
                  <span className="text-muted-foreground">练习{item.totalTyping}次</span>
                  <span className="text-muted-foreground">遗忘{item.lapses}次</span>
                  <span className="text-muted-foreground">难度{item.difficulty_card.toFixed(1)}</span>
                  {item.due && new Date(item.due) <= new Date() && (
                    <Badge variant="destructive" className="text-xs">待复习</Badge>
                  )}
                </div>
              </div>

              <Button size="sm" variant="outline" onClick={() => onPractice?.(type, item.id)}>
                立即攻克
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
