'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'

const COLORS = ['var(--primary)', 'var(--playful-yellow)', 'var(--playful-pink)', 'var(--playful-blue)']

export function Confetti({ count = 20 }: { count?: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = Math.random() * Math.PI * 2
        const distance = 60 + Math.random() * 100
        return {
          id: i,
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance + 40,
          rotate: Math.random() * 360,
          size: 6 + Math.random() * 6,
          color: COLORS[i % COLORS.length],
          shape: i % 2 === 0 ? '50%' : '2px',
        }
      }),
    [count]
  )

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {particles.map(p => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.5, rotate: p.rotate }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            left: '50%',
            top: '30%',
            width: p.size,
            height: p.size,
            borderRadius: p.shape,
            backgroundColor: p.color,
          }}
        />
      ))}
    </div>
  )
}
