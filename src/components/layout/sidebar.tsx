'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { PanelLeft, PanelLeftClose, Search, X } from 'lucide-react'
import { NAVIGATION, type NavItem } from '@/config/navigation'
import { icon } from '@/lib/icons'
import type { SessionUser } from '@/server/auth/types'
import { AccountMenu } from './account-menu'
import { useShell } from './shell-provider'
import { cn } from '@/lib/cn'

/**
 * Aba mínima na borda esquerda, o único vestígio do menu quando ele está
 * recolhido. Sem ela não haveria caminho de volta.
 */
export function SidebarHandle() {
  const { collapsed, toggleSidebar } = useShell()
  if (!collapsed) return null

  return (
    <motion.button
      type="button"
      onClick={toggleSidebar}
      aria-label="Mostrar menu"
      title="Mostrar menu"
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      className="fixed left-0 top-6 z-40 hidden rounded-r-md border border-l-0 border-line bg-elevated py-2.5 pl-1.5 pr-2 text-fg-subtle transition-colors duration-[180ms] hover:border-accent/40 hover:text-accent lg:block"
    >
      <PanelLeft size={15} strokeWidth={2} />
    </motion.button>
  )
}

export function Sidebar({
  user,
  extraItems = [],
}: {
  user: SessionUser
  /** Itens do operador. Vêm do servidor — ver `MASTER_NAVIGATION`. */
  extraItems?: readonly NavItem[]
}) {
  const items = [...NAVIGATION, ...extraItems]
  const pathname = usePathname()
  const { collapsed, toggleSidebar, query, setQuery, placeholder } = useShell()

  return (
    <AnimatePresence initial={false}>
      {collapsed ? null : (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 240, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          className="sticky top-0 hidden h-screen shrink-0 overflow-hidden border-r border-line bg-surface/40 lg:block"
        >
          <div className="flex h-full w-60 flex-col">
            <div className="flex h-16 shrink-0 items-center gap-2.5 px-4">
              <span className="flex size-7 items-center justify-center rounded-md border border-accent/30 bg-accent/10">
                <span className="size-2 rounded-full bg-accent shadow-[var(--glow-dot)]" />
              </span>
              <span className="text-[0.9375rem] font-semibold tracking-[-0.01em]">Patrimônio</span>

              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Ocultar menu"
                title="Ocultar menu"
                className="ml-auto rounded-sm p-1.5 text-fg-subtle transition-colors duration-[180ms] hover:bg-raised hover:text-fg"
              >
                <PanelLeftClose size={15} strokeWidth={2} />
              </button>
            </div>

            <nav className="flex flex-col gap-0.5 px-3 py-4">
              {items.map((item) => {
                const Icon = icon(item.icon)
                const active =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'relative flex items-center gap-2.5 rounded-md px-3 py-2',
                      'text-sm transition-colors duration-[180ms]',
                      active ? 'text-fg' : 'text-fg-muted hover:bg-raised hover:text-fg',
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId="nav-active"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        className="absolute inset-0 -z-10 rounded-md border border-accent/22 bg-accent/8"
                      />
                    ) : null}
                    <Icon
                      size={16}
                      strokeWidth={1.9}
                      className={active ? 'text-accent' : 'text-fg-subtle'}
                    />
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            {/*
              Busca contextual: uma caixa só, sempre no mesmo lugar. O que ela
              filtra depende da página aberta — o placeholder anuncia o escopo.
            */}
            <div className="mt-2 border-t border-line px-3 pt-4">
              <div className="relative">
                <Search
                  size={14}
                  strokeWidth={2}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={placeholder}
                  className={cn(
                    'h-9 w-full rounded-md border border-line bg-elevated pl-8 pr-8',
                    'text-[0.8125rem] text-fg placeholder:text-fg-subtle',
                    'transition-colors duration-[180ms] hover:border-line-strong',
                    'focus:border-accent/60 focus:shadow-[var(--glow-control)] focus:outline-none',
                  )}
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-fg-subtle transition-colors duration-[180ms] hover:text-fg"
                  >
                    <X size={12} strokeWidth={2.2} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-auto border-t border-line p-3">
              <AccountMenu user={user} />
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
