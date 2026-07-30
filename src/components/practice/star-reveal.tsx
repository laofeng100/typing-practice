'use client'

import { motion } from 'framer-motion'
import { Star } from 'lucide-react'

export function StarReveal({ stars, size = 32 }: { stars: 0 | 1 | 2 | 3; size?: number }) {
  return (
    <div className="flex justify-center gap-1">
      {[1, 2, 3].map(s => {
        const earned = s <= stars
        return (
          <motion.span
            key={s}
            initial={{ scale: 0, rotate: -30, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15, delay: (s - 1) * 0.15 }}
            className="inline-flex"
          >
            <Star
              style={{ width: size, height: size }}
              className={earned ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'}
            />
          </motion.span>
        )
      })}
    </div>
  )
}
