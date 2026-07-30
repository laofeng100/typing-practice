'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface PracticeHUDProps {
  wpm?: number
  accuracy: number
  current: number
  total: number
}

function RollingNumber({ value, suffix, className }: { value: number; suffix?: string; className?: string }) {
  return (
    <span className={cn('relative inline-flex overflow-hidden', className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="tnum"
        >
          {value}
          {suffix}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export function PracticeHUD({ wpm, accuracy, current, total }: PracticeHUDProps) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-center gap-6 px-4 py-2 rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm text-sm">
      {typeof wpm === 'number' && (
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs text-muted-foreground">WPM</span>
          <span className="font-semibold">
            <RollingNumber value={wpm} />
          </span>
        </div>
      )}
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs text-muted-foreground">准确率</span>
        <span className="font-semibold">
          <RollingNumber value={accuracy} suffix="%" />
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs text-muted-foreground">进度</span>
        <span className="font-semibold">
          <RollingNumber value={current} />
          <span className="text-muted-foreground tnum">/{total}</span>
        </span>
      </div>
    </div>
  )
}
