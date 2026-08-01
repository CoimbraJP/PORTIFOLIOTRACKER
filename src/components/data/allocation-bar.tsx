'use client'

import { motion } from 'motion/react'
import { cn } from '@/lib/cn'

export interface AllocationBarProps {
  /** Participação em pontos percentuais (37.4 = 37,4%). */
  value: number
  color: string
  className?: string
}

/** Barra de participação. Cresce por scaleX — nunca animando width. */
export function AllocationBar({ value, color, className }: AllocationBarProps) {
  return (
    <div className={cn('h-1 w-full overflow-hidden rounded-full bg-raised', className)}>
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: Math.min(value, 100) / 100 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{ backgroundColor: color, transformOrigin: 'left' }}
        className="h-full w-full"
      />
    </div>
  )
}
