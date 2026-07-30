'use client'

import { cn } from '@/lib/utils'
import { KEY_TO_FINGER, FINGER_NAMES, KEYBOARD_ROWS, HOME_ROW } from '@/lib/typing'

interface VirtualKeyboardProps {
  highlightKey?: string | null
  errorKeys?: string[]
  showFingerGuide?: boolean
  nextKey?: string
  errorKey?: string
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

const FINGER_COLORS: Record<string, string> = {
  'L-pinky': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  'L-ring': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'L-middle': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'L-index': 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  'R-index': 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'R-middle': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  'R-ring': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'R-pinky': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  'thumb': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

export function VirtualKeyboard({ highlightKey, errorKeys = [], showFingerGuide = true, nextKey, errorKey }: VirtualKeyboardProps) {
  const lowerHighlight = highlightKey?.toLowerCase() || null
  const lowerNext = nextKey?.toLowerCase() || null
  const lowerErrorKey = errorKey?.toLowerCase() || null
  const isError = (k: string) => errorKeys.includes(k.toLowerCase())

  const getKeyClass = (k: string) => {
    const finger = KEY_TO_FINGER[k] || ''
    const isHome = HOME_ROW.includes(k)
    const isActive = lowerHighlight === k
    const isErr = isError(k)
    const isNext = lowerNext === k && !isActive
    const isErrorFlash = lowerErrorKey === k
    return cn(
      'vk-key relative select-none rounded-md border flex items-center justify-center font-mono text-sm font-semibold transition-all',
      'w-9 h-9 sm:w-10 sm:h-10',
      isHome && !isActive && 'vk-key home',
      isActive && 'vk-key active',
      isNext && 'ring-2 ring-primary/50 animate-pulse-soft',
      isErrorFlash && 'ring-2 ring-destructive',
      isErr && !isActive && 'border-destructive/50 bg-destructive/10 text-destructive',
      !isActive && !isErr && showFingerGuide && finger ? FINGER_COLORS[finger] : '',
      !isActive && !isErr && (!showFingerGuide || !finger) && 'bg-card text-card-foreground border-border'
    )
  }

  const renderFingerDot = (k: string) => {
    if (lowerNext !== k) return null
    const finger = KEY_TO_FINGER[k] || (k === ' ' ? 'thumb' : '')
    if (!finger) return null
    return (
      <span className={cn('absolute -top-1 -left-1 w-1.5 h-1.5 rounded-full', FINGER_DOT_COLORS[finger])} />
    )
  }

  return (
    <div className="p-3 bg-secondary/30 rounded-xl">
      <div className="space-y-1.5 max-w-xl mx-auto">
        {KEYBOARD_ROWS.map((row, i) => (
          <div key={i} className="flex justify-center gap-1.5" style={{ marginLeft: i * 12, marginRight: i * 12 }}>
            {row.map(k => (
              <div key={k} className={getKeyClass(k)}>
                {renderFingerDot(k)}
                {k}
              </div>
            ))}
          </div>
        ))}
        <div className="flex justify-center pt-1">
          <div className={cn(
            'vk-key relative rounded-md border flex items-center justify-center text-xs font-medium',
            'w-40 h-9 sm:w-48 sm:h-10',
            lowerHighlight === ' ' ? 'vk-key active' : 'bg-card border-border text-muted-foreground',
            lowerNext === ' ' && lowerHighlight !== ' ' && 'ring-2 ring-primary/50 animate-pulse-soft',
            lowerErrorKey === ' ' && 'ring-2 ring-destructive'
          )}>
            {renderFingerDot(' ')}
            空格 Space
          </div>
        </div>
      </div>
      {showFingerGuide && (
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-[10px]">
          {Object.entries(FINGER_NAMES).map(([key, name]) => (
            <span key={key} className={cn('px-1.5 py-0.5 rounded', FINGER_COLORS[key])}>
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// 打字目标文本显示组件
interface TypingDisplayProps {
  target: string
  input: string
  fontSize?: 'small' | 'medium' | 'large'
  showErrors?: boolean
  size?: 'word' | 'sentence'
  className?: string
  shakeLatestError?: boolean
}

export function TypingDisplay({ target, input, fontSize = 'medium', showErrors = true, size, className, shakeLatestError = false }: TypingDisplayProps) {
  const sizeClass = size === 'word'
    ? 'text-3xl'
    : size === 'sentence'
      ? 'text-2xl'
      : fontSize === 'large' ? 'text-2xl' : fontSize === 'small' ? 'text-base' : 'text-xl'
  const targetChars = [...target]
  const inputChars = [...input]
  let lastErrorIdx = -1
  for (let i = 0; i < inputChars.length && i < targetChars.length; i++) {
    if (inputChars[i] !== targetChars[i]) lastErrorIdx = i
  }

  return (
    <div className={cn('typing-target font-mono leading-relaxed break-all', sizeClass, className)}>
      {targetChars.map((ch, i) => {
        const inputCh = i < inputChars.length ? inputChars[i] : null
        const isCurrent = i === inputChars.length
        const isCorrect = inputCh === ch
        const isIncorrect = inputCh !== null && inputCh !== ch
        const isLatestError = isIncorrect && i === lastErrorIdx

        return (
          <span
            key={i}
            className={cn(
              'typing-char',
              isCurrent && 'current',
              inputCh === null && 'pending',
              isCorrect && 'correct',
              showErrors && isIncorrect && 'incorrect',
              showErrors && shakeLatestError && isLatestError && 'animate-shake-once'
            )}
          >
            {ch === ' ' ? (isIncorrect ? '␣' : '\u00A0') : ch}
          </span>
        )
      })}
    </div>
  )
}

