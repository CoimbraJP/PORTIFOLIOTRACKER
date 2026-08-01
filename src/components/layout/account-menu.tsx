'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { LogOut, User } from 'lucide-react'
import { signOut } from '@/server/actions/auth'
import type { SessionUser } from '@/server/auth/types'
import { cn } from '@/lib/cn'

export function AccountMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false)
  const label = user.name ?? user.email ?? 'Minha conta'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left',
          'transition-colors duration-[180ms] hover:bg-raised',
        )}
      >
        {user.avatarUrl ? (
          // Avatar do Google. `<img>` simples: 28px vindo de CDN externo não
          // compensa a volta pelo otimizador.
          <img
            src={user.avatarUrl}
            alt=""
            width={28}
            height={28}
            className="size-7 shrink-0 rounded-full ring-1 ring-inset ring-line"
          />
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-raised text-fg-subtle">
            <User size={14} strokeWidth={2} />
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.8125rem] font-medium text-fg">{label}</span>
          {user.email && user.name ? (
            <span className="block truncate text-caption normal-case tracking-normal text-fg-subtle">
              {user.email}
            </span>
          ) : null}
        </span>
      </button>

      <AnimatePresence>
        {open ? (
          <>
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-10 cursor-default"
            />
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              // Dropdown flutua sobre o conteúdo: glass permitido.
              className="glass absolute bottom-full left-0 z-20 mb-2 w-full rounded-md p-1 shadow-lg"
            >
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-[0.8125rem] text-fg-muted transition-colors duration-[180ms] hover:bg-raised hover:text-fg"
                >
                  <LogOut size={14} strokeWidth={2} />
                  Sair
                </button>
              </form>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
