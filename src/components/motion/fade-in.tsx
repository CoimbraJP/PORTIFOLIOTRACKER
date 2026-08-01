'use client'

import { motion } from 'motion/react'
import type { ReactNode } from 'react'

export interface FadeInProps {
  children: ReactNode
  delay?: number
  className?: string
}

/** Entrada padrão: opacidade + 8px de subida. Só transform e opacity. */
export function FadeIn({ children, delay = 0, className }: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
