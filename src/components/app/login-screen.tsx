'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'
import { motion } from 'framer-motion'
import { Keyboard, BookOpen, GraduationCap, Sparkles, ArrowRight } from 'lucide-react'

interface FixedUser {
  id: string
  name: string
  nickname: string | null
  avatar: string | null
  stage: string
  grade: string
}

export default function LoginScreen({ onLoggedIn }: { onLoggedIn: (u: any) => void }) {
  const { toast } = useToast()
  const [users, setUsers] = useState<FixedUser[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [lastLoginId, setLastLoginId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(d => {
        const list: FixedUser[] = d.users || []
        // 上次登录的账号排最前
        try {
          const lastId = localStorage.getItem('last_login_uid')
          if (lastId) {
            setLastLoginId(lastId)
            list.sort((a, b) => (a.id === lastId ? -1 : b.id === lastId ? 1 : 0))
          }
        } catch {}
        setUsers(list)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const handleLogin = async (userId: string, name: string) => {
    setLoading(userId)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: '登录失败', description: data.error, variant: 'destructive' })
        return
      }
      toast({ title: `欢迎回来，${name}！` })
      try { localStorage.setItem('last_login_uid', userId) } catch {}
      onLoggedIn(data.user)
    } catch (e: any) {
      toast({ title: '登录失败', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary/5 via-background to-accent/10">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">键英双修</h1>
              <p className="text-xs text-muted-foreground">打字练习 · 英语背诵 · 一站式学习</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>FSRS V6 智能记忆算法驱动</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">
              选择账号开始练习
            </h2>
            <p className="text-muted-foreground">
              点击你的头像即可免密登录，系统会自动记住你的学习进度
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-6 mb-10">
            {users.map((u, idx) => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + idx * 0.1 }}
              >
                <Card
                  className="cursor-pointer hover:shadow-xl hover:border-primary/50 hover:-translate-y-1 transition-all group overflow-hidden"
                  onClick={() => !loading && handleLogin(u.id, u.name)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-4">
                      <motion.div whileHover={{ scale: 1.1 }} transition={{ type: 'spring', stiffness: 300 }}>
                        <Avatar className="w-16 h-16 border-2 border-primary/20 group-hover:border-primary transition-colors">
                          <AvatarFallback className={
                            u.avatar === 'boy'
                              ? 'bg-primary/15 text-primary text-2xl'
                              : 'bg-accent text-accent-foreground text-2xl'
                          }>
                            {u.avatar === 'boy' ? '👦' : '👧'}
                          </AvatarFallback>
                        </Avatar>
                      </motion.div>
                      <div className="flex-1 text-left">
                        <CardTitle className="text-xl flex items-center gap-2">
                          {u.name}
                          <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                            {u.grade}
                          </span>
                          {u.id === lastLoginId && (
                            <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              上次登录
                            </span>
                          )}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          当前学段：{u.stage}
                        </p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="w-full"
                      disabled={loading === u.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleLogin(u.id, u.name)
                      }}
                    >
                      {loading === u.id ? '登录中...' : `开始练习 - ${u.name}`}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
            {!loaded && (
              <div className="sm:col-span-2 text-center py-8 text-muted-foreground">
                加载账号列表...
              </div>
            )}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="grid sm:grid-cols-3 gap-4"
          >
            {[
              { icon: Keyboard, title: '键盘熟悉', desc: '六关渐进式训练，从基准键到综合打字' },
              { icon: BookOpen, title: '单词背诵', desc: 'FSRS算法智能复习，边打字边背单词' },
              { icon: GraduationCap, title: '阅读理解', desc: '中高考改革题型，打字+答题双提升' },
            ].map((f, i) => (
              <Card key={i} className="bg-card/50">
                <CardContent className="pt-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <f.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{f.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </motion.div>
        </div>
      </main>

      <footer className="border-t bg-card/50 py-4 mt-auto">
        <div className="max-w-6xl mx-auto px-4 text-center text-xs text-muted-foreground">
          键英双修打字练习系统 · 基于FSRS V6记忆算法 · 专为小升初学生设计
        </div>
      </footer>
    </div>
  )
}
