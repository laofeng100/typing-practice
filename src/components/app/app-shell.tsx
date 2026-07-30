'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useToast } from '@/hooks/use-toast'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Keyboard, BookOpen, GraduationCap, FileText, Languages,
  LayoutDashboard, Settings, LogOut, Menu, Trophy, Zap,
  BarChart3, BookX, ClipboardList, Crosshair, Headphones
} from 'lucide-react'
import { RingProgress } from '@/components/ui/ring-progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import Dashboard from './dashboard'
import KeyboardModule from '@/components/practice/keyboard-module'
import WordModule from '@/components/practice/word-module'
import SentenceModule from '@/components/practice/sentence-module'
import ReadingModule from '@/components/practice/reading-module'
import ChineseModule from '@/components/practice/chinese-module'
import ListeningModule from '@/components/practice/listening-module'
import KeyHeatmap from '@/components/practice/key-heatmap'
import MistakeBook from '@/components/practice/mistake-book'
import Achievements from '@/components/practice/achievements'
import StudyReport from '@/components/practice/study-report'
import FocusedPractice from '@/components/practice/focused-practice'
import SettingsPanel from './settings-panel'

interface NavItem {
  id: string
  label: string
  icon: any
  module?: string
  group: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: '学习概览', icon: LayoutDashboard, group: '主要' },
  { id: 'achievements', label: '我的成就', icon: Trophy, group: '主要' },
  { id: 'report', label: '学习报告', icon: ClipboardList, group: '主要' },
  { id: 'keyboard', label: '键盘熟悉', icon: Keyboard, module: 'keyboard', group: '打字基础' },
  { id: 'focused', label: '专项练习', icon: Crosshair, group: '打字基础' },
  { id: 'word', label: '单词练习', icon: BookOpen, module: 'word', group: '英语练习' },
  { id: 'sentence', label: '句子练习', icon: FileText, module: 'sentence', group: '英语练习' },
  { id: 'reading', label: '阅读理解', icon: GraduationCap, module: 'article', group: '英语练习' },
  { id: 'listening', label: '听力练习', icon: Headphones, module: 'listening', group: '英语练习' },
  { id: 'chinese', label: '古诗词背诵', icon: Languages, group: '中文练习' }, // 背诵自评不依赖打字能力，不受 WPM 门控
  { id: 'heatmap', label: '键位热力图', icon: BarChart3, group: '学习统计' },
  { id: 'mistakes', label: '错题本', icon: BookX, group: '学习统计' },
  { id: 'settings', label: '设置中心', icon: Settings, group: '系统' },
]

const MODULE_GROUPS = ['主要', '打字基础', '英语练习', '中文练习', '学习统计', '系统']

const MOBILE_TABS = [
  { id: 'dashboard', label: '概览', icon: LayoutDashboard },
  { id: 'keyboard', label: '键盘', icon: Keyboard },
  { id: 'word', label: '单词', icon: BookOpen, module: 'word' },
  { id: 'sentence', label: '句子', icon: FileText, module: 'sentence' },
  { id: 'settings', label: '我的', icon: Settings },
]

function NavList({ view, dashData, onNavigate, instanceId = 'nav' }: { view: string; dashData: any; onNavigate: (v: string) => void; instanceId?: string }) {
  const settings = dashData?.settings
  return (
    <nav className="space-y-6">
      {MODULE_GROUPS.map(group => (
        <div key={group}>
          <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group}</h3>
          <div className="space-y-1">
            {NAV_ITEMS.filter(n => n.group === group).map(item => {
              const locked = item.module && item.module !== 'keyboard' && !dashData?.advancedUnlocked
              const active = view === item.id
              const btn = (
                <button
                  key={item.id}
                  onClick={() => !locked && onNavigate(item.id)}
                  disabled={!!locked}
                  className={`relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-primary-subtle text-primary-subtle-foreground'
                      : locked
                      ? 'text-muted-foreground/50 cursor-not-allowed'
                      : 'text-foreground hover:bg-accent'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId={`${instanceId}-nav-indicator`}
                      className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-primary"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {locked && <span className="text-xs">🔒</span>}
                </button>
              )
              if (locked) {
                return (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>
                      <span className="block">{btn}</span>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      WPM 达 {settings?.wpmUnlockThreshold || 40} 且准确率达 {settings?.accuracyUnlockThreshold || 90}% 解锁
                    </TooltipContent>
                  </Tooltip>
                )
              }
              return btn
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

export default function AppShell({ user, onLogout }: { user: any; onLogout: () => void }) {
  const { toast } = useToast()
  const [view, setView] = useState('dashboard')
  const [focusedInit, setFocusedInit] = useState<'keys' | 'words' | 'sentences' | undefined>(undefined)
  const [focusedId, setFocusedId] = useState<number | undefined>(undefined)
  const [dashData, setDashData] = useState<any>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  const loadDashboard = () => {
    fetch('/api/dashboard')
      .then(r => {
        if (r.status === 401) { onLogout(); return null }
        if (!r.ok) {
          toast({ title: '数据加载失败', description: `仪表盘加载出错 (${r.status})`, variant: 'destructive' })
          return null
        }
        return r.json()
      })
      .then(d => {
        if (d) setDashData(d)
      })
      .catch(() => {})
  }

  useEffect(() => { loadDashboard() }, [])

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' })
    toast({ title: '已退出登录' })
    onLogout()
  }

  const switchView = (v: string) => {
    setView(v)
    setMobileOpen(false)
  }

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return <Dashboard data={dashData} onNavigate={switchView} />
      case 'keyboard':
        return <KeyboardModule settings={dashData?.settings} onProgress={loadDashboard}
          todayUsedMin={dashData?.todayStat ? Math.floor(dashData.todayStat.totalMs / 60000) : undefined}
          dailyLimitMin={dashData?.settings?.dailyLimitMin} />
      case 'word':
        return <WordModule user={user} settings={dashData?.settings} onProgress={loadDashboard} advancedUnlocked={dashData?.advancedUnlocked} />
      case 'sentence':
        return <SentenceModule user={user} settings={dashData?.settings} onProgress={loadDashboard} advancedUnlocked={dashData?.advancedUnlocked} />
      case 'reading':
        return <ReadingModule user={user} settings={dashData?.settings} onProgress={loadDashboard} advancedUnlocked={dashData?.advancedUnlocked} />
      case 'listening':
        return <ListeningModule user={user} settings={dashData?.settings} onProgress={loadDashboard} advancedUnlocked={dashData?.advancedUnlocked} />
      case 'chinese':
        return <ChineseModule user={user} settings={dashData?.settings} onProgress={loadDashboard} />
      case 'achievements':
        return (
          <div className="p-4 sm:p-6 max-w-5xl mx-auto">
            <Achievements user={user} />
          </div>
        )
      case 'report':
        return (
          <div className="p-4 sm:p-6 max-w-5xl mx-auto">
            <div className="mb-4">
              <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
                <ClipboardList className="w-6 h-6 text-primary" />
                学习报告
              </h1>
              <p className="text-sm text-muted-foreground">查看学习进度、进步对比和个性化建议</p>
            </div>
            <StudyReport />
          </div>
        )
      case 'focused':
        return <FocusedPractice settings={dashData?.settings} onProgress={loadDashboard} initialType={focusedInit} initialId={focusedId} />
      case 'heatmap':
        return (
          <div className="p-4 sm:p-6 max-w-5xl mx-auto">
            <div className="mb-4">
              <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-primary" />
                键位热力图
              </h1>
              <p className="text-sm text-muted-foreground">查看每个键位的准确率分布，针对性突破薄弱键</p>
            </div>
            <KeyHeatmap />
          </div>
        )
      case 'mistakes':
        return (
          <div className="p-4 sm:p-6 max-w-5xl mx-auto">
            <div className="mb-4">
              <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
                <BookX className="w-6 h-6 text-primary" />
                错题本
              </h1>
              <p className="text-sm text-muted-foreground">自动收集高错误率和多次遗忘的单词/句子/古诗词，重点复习</p>
            </div>
            <MistakeBook onPractice={(t, id) => {
              if (t === 'chinese') { switchView('chinese'); return } // 古诗词回到背诵模块复习
              setFocusedInit(t === 'word' ? 'words' : 'sentences')
              setFocusedId(id)
              switchView('focused')
              setTimeout(() => { setFocusedInit(undefined); setFocusedId(undefined) }, 0) // 一次性消费，避免后续进入专项练习被污染
            }} />
          </div>
        )
      case 'settings':
        return <SettingsPanel user={user} onUpdated={loadDashboard} />
      default:
        return <Dashboard data={dashData} onNavigate={switchView} />
    }
  }

  const navListProps = { view, dashData, onNavigate: switchView }

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      {/* 顶栏 */}
      <header className="border-b bg-card sticky top-0 z-20">
        <div className="flex items-center h-14 px-4 gap-3">
          {/* 移动端菜单 */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <div className="flex items-center gap-2 mb-6 pb-4 border-b">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
                  <Keyboard className="w-4 h-4" />
                </div>
                <span className="font-bold">键英双修</span>
              </div>
              <NavList {...navListProps} instanceId="mobile" />
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2 rounded-lg px-2 py-1 bg-gradient-to-r from-primary/10 to-transparent">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <Keyboard className="w-4 h-4" />
            </div>
            <span className="font-bold hidden sm:inline">键英双修</span>
          </div>

          <div className="flex-1" />

          {/* 今日时长 */}
          {dashData?.todayStat && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1.5 rounded-full bg-secondary">
              <RingProgress
                value={(dashData.todayStat.totalMs / 60000) / (dashData.settings?.dailyLimitMin || 15) * 100}
                size={16}
                strokeWidth={2}
              />
              <span>今日 <span className="tnum">{Math.floor(dashData.todayStat.totalMs / 60000)}/{dashData.settings?.dailyLimitMin || 15}</span> 分钟</span>
            </div>
          )}

          {/* 待复习 */}
          {dashData?.dueCards > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-primary px-3 py-1.5 rounded-full bg-primary/10 animate-pulse-soft">
              <Zap className="w-3.5 h-3.5" />
              <span>{dashData.dueCards} 待复习</span>
            </div>
          )}

          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
            <Avatar className="w-7 h-7">
              <AvatarFallback className={user.avatar === 'boy' ? 'bg-primary/15 text-primary text-sm' : 'bg-accent text-accent-foreground text-sm'}>
                {user.avatar === 'boy' ? '👦' : '👧'}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline">{user.name}</span>
            <LogOut className="w-4 h-4 sm:hidden" />
          </Button>
        </div>
      </header>

      {/* 主体 */}
      <div className="flex-1 flex">
        {/* 侧边栏 - 桌面 */}
        <aside className="hidden lg:block w-60 border-r bg-card p-4 overflow-y-auto scroll-thin">
          <NavList {...navListProps} instanceId="desktop" />
        </aside>

        {/* 内容区 */}
        <main className="flex-1 overflow-y-auto scroll-thin pb-16 lg:pb-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="min-h-full"
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* 移动端底部标签栏 */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-card">
        <div className="flex">
          {MOBILE_TABS.map(tab => {
            const locked = tab.module && !dashData?.advancedUnlocked
            const active = view === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => !locked && switchView(tab.id)}
                disabled={!!locked}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                  locked
                    ? 'text-muted-foreground/50 opacity-50 cursor-not-allowed'
                    : active
                    ? 'text-primary'
                    : 'text-muted-foreground'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
