'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { Settings, Save, RotateCcw, Clock, Keyboard, Brain, Type, Zap, Trash2, AlertTriangle, Loader2, CheckCircle2, Sun, Moon, Monitor, Lock } from 'lucide-react'

const THEME_OPTIONS = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
] as const

const DEFAULTS = {
  dailyLimitMin: 15,
  singleLimitMin: 30,
  wpmUnlockThreshold: 40,
  accuracyUnlockThreshold: 90,
  fsrsRetention: 0.9,
  fsrsMaxInterval: 365,
  wordBatchSize: 10,
  wordReviewBatchSize: 20,
  examCramMode: false,
  examCramIntensity: 50,
  showKeyboard: true,
  showFingerGuide: true,
  soundFeedback: false,
  fontSize: 'medium',
  enVoiceId: 'English_PassionateWarrior',
  enSpeed: 1.0,
  enVol: 1.0,
  enPitch: 0,
  enPauseDouHao: 200,
  enPauseJuHao: 350,
  enPauseDunHao: 250,
}

// 家长管控门：设置 parentPin 后，时长/解锁/突击区域需输入密码才能编辑
function ParentGate({ hasPin, unlocked, onUnlock }: { hasPin: boolean; unlocked: boolean; onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [checking, setChecking] = useState(false)

  if (!hasPin || unlocked) return null

  const verify = async () => {
    setChecking(true)
    setErr('')
    try {
      const res = await fetch('/api/settings/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const d = await res.json()
      if (d.ok) onUnlock()
      else setErr('密码不正确')
    } catch {
      setErr('验证失败，请重试')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 text-center space-y-3">
      <Lock className="w-8 h-8 mx-auto text-primary" />
      <p className="text-sm font-medium">家长管控区</p>
      <p className="text-xs text-muted-foreground">此区域涉及练习时长与解锁控制，输入家长密码后可修改</p>
      <div className="flex gap-2 max-w-xs mx-auto">
        <Input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && verify()}
          placeholder="家长密码"
          className="text-center"
        />
        <Button onClick={verify} disabled={checking || pin.length < 4}>
          {checking ? '验证中...' : '解锁'}
        </Button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  )
}

export default function SettingsPanel({ user, onUpdated }: { user: any; onUpdated: () => void }) {  const { toast } = useToast()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [s, setS] = useState<any>(DEFAULTS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [effective, setEffective] = useState<any>(null)
  const [resetting, setResetting] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const [parentUnlocked, setParentUnlocked] = useState(false)
  const [newPin, setNewPin] = useState('')
  const hasParentPin = !!s.parentPin

  useEffect(() => {
    setLoading(true)
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        setS(d.settings || DEFAULTS)
        setEffective(d.effectiveSettings || null)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleThemeChange = (value: string) => {
    document.documentElement.classList.add('color-transition')
    setTheme(value)
    setTimeout(() => document.documentElement.classList.remove('color-transition'), 300)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { ...s }
      if (payload.parentPin === '••••') delete payload.parentPin // 掩码值不回传，避免校验失败
      // 家长管控锁定时剔离受保护键（服务端也会拦截，这里避免整体保存被 403 阻断）
      if (hasParentPin && !parentUnlocked) {
        for (const k of ['dailyLimitMin', 'singleLimitMin', 'wpmUnlockThreshold', 'accuracyUnlockThreshold', 'examCramMode', 'examCramIntensity', 'parentPin']) {
          delete payload[k]
        }
      }
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const fieldErrors = err.details ? Object.entries(err.details).map(([k, v]) => `${k}: ${v}`).join('；') : ''
        throw new Error(fieldErrors ? `${err.error || '保存失败'}（${fieldErrors}）` : (err.error || `保存失败 (${res.status})`))
      }
      const data = await res.json()
      // 用API返回的原始设置更新本地state（用户设的值）
      if (data.settings) setS(data.settings)
      // 用生效设置更新显示（考前突击调整后的值）
      if (data.effectiveSettings) setEffective(data.effectiveSettings)
      toast({ title: '✅ 设置已保存', description: '个性化设置已生效' })
      onUpdated()
    } catch (e: any) {
      toast({ title: '保存失败', description: e.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setS(DEFAULTS)
    toast({ title: '已恢复默认设置，记得保存' })
  }

  const handleSetPin = async () => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentPin: newPin }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `设置失败 (${res.status})`)
      }
      const d = await res.json()
      if (d.settings) setS(d.settings)
      setNewPin('')
      setParentUnlocked(true)
      toast({ title: '✅ 家长密码已设置', description: '时长与解锁区域已锁定，孩子无法修改' })
    } catch (e: any) {
      toast({ title: '设置失败', description: e.message, variant: 'destructive' })
    }
  }

  const handleClearData = async () => {
    setResetting(true)
    try {
      const res = await fetch('/api/data/reset', { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `清除失败 (${res.status})`)
      }
      const data = await res.json()
      setResetDone(true)
      setS(DEFAULTS)
      setEffective(null)
      toast({
        title: '✅ 个人数据已清除',
        description: `已删除全部练习记录，学段重置为小学。基础教学数据完好保留。`,
      })
      onUpdated()
      setTimeout(() => setResetDone(false), 5000)
    } catch (e: any) {
      toast({ title: '清除失败', description: e.message, variant: 'destructive' })
    } finally {
      setResetting(false)
    }
  }

  const update = (key: string, value: any) => setS((prev: any) => ({ ...prev, [key]: value }))

  if (loading) return <div className="p-6 text-muted-foreground">加载设置...</div>

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">设置中心</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="w-4 h-4" />
            恢复默认
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {/* 家长管控门：时长控制 + 解锁门槛 */}
      {hasParentPin && !parentUnlocked ? (
        <ParentGate hasPin={hasParentPin} unlocked={parentUnlocked} onUnlock={() => setParentUnlocked(true)} />
      ) : (
      <>
      {!hasParentPin && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-amber-600" />
            家长管控未启用
          </p>
          <p className="text-xs text-muted-foreground">设置 4-6 位数字密码，防止孩子自己修改练习时长与解锁门槛</p>
          <div className="flex gap-2 max-w-xs">
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              placeholder="4-6位数字"
              className="text-center"
            />
            <Button size="sm" onClick={handleSetPin} disabled={newPin.length < 4}>设置密码</Button>
          </div>
        </div>
      )}

      {/* 时长控制 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="w-4 h-4 text-primary" />
            练习时长控制
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>每日总时长上限</Label>
              <span className="text-sm font-medium text-primary">{s.dailyLimitMin} 分钟</span>
            </div>
            <Slider
              value={[s.dailyLimitMin]}
              onValueChange={(v) => update('dailyLimitMin', v[0])}
              min={5}
              max={60}
              step={5}
            />
            <p className="text-xs text-muted-foreground mt-1">建议每日不超过15-20分钟，保护视力避免疲劳</p>
          </div>
          <Separator />
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>单次练习时长上限</Label>
              <span className="text-sm font-medium text-primary">{s.singleLimitMin} 分钟</span>
            </div>
            <Slider
              value={[s.singleLimitMin]}
              onValueChange={(v) => update('singleLimitMin', v[0])}
              min={5}
              max={60}
              step={5}
            />
          </div>
        </CardContent>
      </Card>

      {/* 解锁门槛 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Keyboard className="w-4 h-4 text-primary" />
            解锁门槛
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-2 block">WPM 达标线</Label>
              <Input
                type="number"
                value={s.wpmUnlockThreshold}
                onChange={(e) => update('wpmUnlockThreshold', Number(e.target.value))}
                min={20}
                max={80}
              />
              <p className="text-xs text-muted-foreground mt-1">达到此速度才解锁单词等练习</p>
            </div>
            <div>
              <Label className="mb-2 block">准确率达标线 (%)</Label>
              <Input
                type="number"
                value={s.accuracyUnlockThreshold}
                onChange={(e) => update('accuracyUnlockThreshold', Number(e.target.value))}
                min={70}
                max={100}
              />
              <p className="text-xs text-muted-foreground mt-1">准确率也需同时达标</p>
            </div>
          </div>
        </CardContent>
      </Card>
      </>
      )}

      {/* FSRS 记忆算法 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="w-4 h-4 text-primary" />
            FSRS V6 记忆算法
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>目标保留率</Label>
              <span className="text-sm font-medium text-primary">{Math.round(s.fsrsRetention * 100)}%</span>
            </div>
            <Slider
              value={[s.fsrsRetention * 100]}
              onValueChange={(v) => update('fsrsRetention', v[0] / 100)}
              min={80}
              max={99}
              step={1}
            />
            <p className="text-xs text-muted-foreground mt-1">
              保留率越高复习越频繁但记得越牢，建议 90%
            </p>
          </div>
          <Separator />
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>最大复习间隔</Label>
              <span className="text-sm font-medium text-primary">{s.fsrsMaxInterval} 天</span>
            </div>
            <Slider
              value={[s.fsrsMaxInterval]}
              onValueChange={(v) => update('fsrsMaxInterval', v[0])}
              min={30}
              max={3650}
              step={30}
            />
          </div>
        </CardContent>
      </Card>

      {/* 单词练习 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="w-4 h-4 text-primary" />
            单词练习
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* 每次新词数量 - 滑动条 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>每次新词数量</Label>
              <span className="text-sm font-medium text-primary">{s.wordBatchSize} 个</span>
            </div>
            <Slider
              value={[s.wordBatchSize]}
              onValueChange={(v) => update('wordBatchSize', v[0])}
              min={3}
              max={30}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>3个（轻松）</span>
              <span>30个（高强度）</span>
            </div>
          </div>

          {/* 每次复习数量 - 滑动条 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>每次复习数量</Label>
              <span className="text-sm font-medium text-primary">{s.wordReviewBatchSize} 个</span>
            </div>
            <Slider
              value={[s.wordReviewBatchSize]}
              onValueChange={(v) => update('wordReviewBatchSize', v[0])}
              min={5}
              max={80}
              step={5}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>5个</span>
              <span>80个</span>
            </div>
          </div>

          {/* 考前突击模式（家长管控） */}
          {(!hasParentPin || parentUnlocked) && (
          <>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                考前突击模式
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">开启后自动增加新词量和复习频率，适合考前冲刺</p>
            </div>
            <Switch checked={s.examCramMode} onCheckedChange={(v) => update('examCramMode', v)} />
          </div>

          {s.examCramMode && (
            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-amber-700 dark:text-amber-400">突击强度</Label>
                  <span className="text-sm font-medium text-amber-600">{s.examCramIntensity}%</span>
                </div>
                <Slider
                  value={[s.examCramIntensity]}
                  onValueChange={(v) => update('examCramIntensity', v[0])}
                  min={10}
                  max={100}
                  step={10}
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>轻度</span>
                  <span>极限</span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>当前生效参数（考前突击调整后）：</p>
                <p>• 新词量：{s.wordBatchSize} → <span className="text-amber-600 font-medium">{effective?.wordBatchSize ?? s.wordBatchSize} 个</span></p>
                <p>• 复习量：{s.wordReviewBatchSize} → <span className="text-amber-600 font-medium">{effective?.wordReviewBatchSize ?? s.wordReviewBatchSize} 个</span></p>
                <p>• 每日上限：{s.dailyLimitMin} → <span className="text-amber-600 font-medium">{effective?.dailyLimitMin ?? s.dailyLimitMin} 分钟</span></p>
              </div>
            </div>
          )}
          </>
          )}
          {hasParentPin && !parentUnlocked && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Lock className="w-3 h-3" /> 考前突击模式已锁定（家长管控区）
            </p>
          )}
        </CardContent>
      </Card>

      {/* 界面设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Type className="w-4 h-4 text-primary" />
            界面与辅助
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2 block">外观</Label>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
                const active = mounted && theme === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleThemeChange(value)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>显示虚拟键盘</Label>
              <p className="text-xs text-muted-foreground">练习时在下方显示键位高亮</p>
            </div>
            <Switch checked={s.showKeyboard} onCheckedChange={(v) => update('showKeyboard', v)} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>显示指法提示</Label>
              <p className="text-xs text-muted-foreground">提示当前键位对应的手指</p>
            </div>
            <Switch checked={s.showFingerGuide} onCheckedChange={(v) => update('showFingerGuide', v)} />
          </div>
          <Separator />
          <div>
            <Label className="mb-2 block">字号大小</Label>
            <Select value={s.fontSize} onValueChange={(v) => update('fontSize', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="small">小号</SelectItem>
                <SelectItem value="medium">中号（推荐）</SelectItem>
                <SelectItem value="large">大号</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* TTS 语音配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="w-4 h-4 text-primary" />
            语音配置 (TTS)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 服务器配置 */}
          <div className="space-y-2 p-3 rounded-lg bg-secondary/30">
            <Label className="text-xs font-semibold text-muted-foreground">服务器配置</Label>
            <p className="text-xs text-muted-foreground">
              TTS 服务器地址与鉴权 Token 由服务器环境变量（TTS_SERVER_URL / TTS_TOKEN）统一配置，不可在此修改。
            </p>
          </div>

          {/* 英语语音配置 */}
          <div className="space-y-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
            <Label className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <span className="text-base">🇬🇧</span> 英语语音配置
            </Label>
            <div>
              <Label className="mb-1 block text-xs">音色 (voice_id)</Label>
              <Input value={s.enVoiceId} onChange={(e) => update('enVoiceId', e.target.value)} className="text-sm" />
              <p className="text-xs text-muted-foreground mt-0.5">如 English_PassionateWarrior / English_FriendlyAngel 等</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">语速</Label>
                <span className="text-xs font-medium text-primary">{s.enSpeed.toFixed(1)}x</span>
              </div>
              <Slider value={[s.enSpeed]} onValueChange={(v) => update('enSpeed', v[0])} min={0.5} max={2.0} step={0.1} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">音量</Label>
                <span className="text-xs font-medium text-primary">{s.enVol.toFixed(1)}</span>
              </div>
              <Slider value={[s.enVol]} onValueChange={(v) => update('enVol', v[0])} min={0.5} max={3.0} step={0.1} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">音调 (半音)</Label>
                <span className="text-xs font-medium text-primary">{s.enPitch > 0 ? '+' : ''}{s.enPitch}</span>
              </div>
              <Slider value={[s.enPitch]} onValueChange={(v) => update('enPitch', v[0])} min={-12} max={12} step={1} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="mb-1 block text-xs">逗号停顿</Label>
                <Input type="number" value={s.enPauseDouHao} onChange={(e) => update('enPauseDouHao', Number(e.target.value))} min={0} max={5000} className="text-xs" />
              </div>
              <div>
                <Label className="mb-1 block text-xs">句号停顿</Label>
                <Input type="number" value={s.enPauseJuHao} onChange={(e) => update('enPauseJuHao', Number(e.target.value))} min={0} max={5000} className="text-xs" />
              </div>
              <div>
                <Label className="mb-1 block text-xs">顿号停顿</Label>
                <Input type="number" value={s.enPauseDunHao} onChange={(e) => update('enPauseDunHao', Number(e.target.value))} min={0} max={5000} className="text-xs" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 账号信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">账号信息</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">姓名</Label>
              <p className="font-medium">{user.name}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">手机号</Label>
              <p className="font-medium">{user.phone}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">学段</Label>
              <p className="font-medium">{user.stage}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">年级</Label>
              <p className="font-medium">{user.grade}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 数据管理 - 清除个人数据 */}
      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <Trash2 className="w-4 h-4" />
            数据管理
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/15">
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive mb-1">清除个人数据</p>
                <p className="text-xs text-muted-foreground">
                  将删除该账号的所有练习记录、FSRS记忆卡片、关卡进度、每日统计和个性化设置，学段重置为小学。
                  <strong className="text-foreground">基础教学数据（单词/句子/阅读/课文）不受影响</strong>，可重新开始学习。
                </p>
              </div>
            </div>

            <div className="text-xs text-muted-foreground space-y-1 mb-3 pl-6">
              <p>将清除的数据：</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                <span>• 练习会话记录</span>
                <span>• 逐条打字记录</span>
                <span>• FSRS记忆卡片</span>
                <span>• FSRS复习日志</span>
                <span>• 关卡进度</span>
                <span>• 每日统计</span>
                <span>• 个性化设置</span>
                <span>• 学段（重置为小学）</span>
              </div>
            </div>

            <div className="text-xs text-success flex items-center gap-1 mb-3 pl-6">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>保留：7,572英语单词 + 450训练句子 + 75阅读短文 + 语法数据</span>
            </div>

            {hasParentPin && !parentUnlocked ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/50 border text-sm text-muted-foreground">
                <Lock className="w-4 h-4" />
                <span>数据清除已锁定（家长管控区），需先在顶部验证家长密码</span>
              </div>
            ) : resetDone ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-success/10 border border-success/20 text-sm text-success">
                <CheckCircle2 className="w-4 h-4" />
                <span>个人数据已清除，基础教学数据完好保留</span>
              </div>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full gap-2" disabled={resetting}>
                    {resetting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        清除中...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        清除个人数据
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                      确认清除全部个人数据？
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <span className="block">此操作将永久删除 <strong>{user.name}</strong> 的所有练习记录和FSRS记忆数据，且<strong className="text-destructive">不可恢复</strong>。</span>
                      <span className="block">清除后账号将回到全新状态，可重新开始学习。</span>
                      <span className="block text-success">基础教学数据（单词/句子/阅读/课文）不受影响。</span>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleClearData}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      确认清除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
