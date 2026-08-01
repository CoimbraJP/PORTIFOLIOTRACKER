'use client'

import { motion } from 'motion/react'
import type { ReactNode } from 'react'

const container = {
  hidden: {},
  show: {
    // Nunca passar de ~6 elementos no stagger: além disso o último parece atrasado.
    transition: { staggerChildren: 0.04, delayChildren: 0.06 },
  },
}

const item = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] as const },
  },
}

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={container} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div variants={item} className={className}>
      {children}
    </motion.div>
  )
}
