'use client'

import { useState, useEffect } from 'react'
import { animate } from 'framer-motion'

export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 0.3,
      ease: 'easeOut',
      onUpdate: v => setDisplay(v),
    })
    return () => controls.stop()
  }, [value, decimals])
  return <>{decimals > 0 ? display.toFixed(decimals) : Math.round(display)}</>
}
