'use client'

import { animate, useMotionValue, useReducedMotion, useTransform, motion } from 'motion/react'
import { useEffect } from 'react'
import { cn } from '@/lib/cn'

export interface AnimatedNumberProps {
  value: number
  /** Formatação aplicada a cada frame. Recebe o valor interpolado. */
  format: (value: number) => string
  duration?: number
  className?: string
}

/**
 * Contador que anima até o valor.
 *
 * A interpolação roda numa MotionValue — o React não re-renderiza a cada frame.
 * `tabular-nums` é obrigatório aqui: sem largura fixa de dígito, o número
 * "dança" enquanto sobe.
 */
export function AnimatedNumber({
  value,
  format,
  duration = 0.9,
  className,
}: AnimatedNumberProps) {
  const reduced = useReducedMotion()
  const motionValue = useMotionValue(reduced ? value : 0)
  const text = useTransform(motionValue, (latest) => format(latest))

  useEffect(() => {
    if (reduced) {
      motionValue.set(value)
      return
    }
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    })
    return () => controls.stop()
  }, [value, duration, motionValue, reduced])

  return <motion.span className={cn('numeric', className)}>{text}</motion.span>
}
