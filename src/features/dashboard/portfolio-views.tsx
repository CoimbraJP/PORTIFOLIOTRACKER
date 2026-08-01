'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ViewSwitcher } from '@/components/layout/view-switcher'
import { matches, useSearchScope } from '@/components/layout/shell-provider'
import { EmptyState } from '@/components/ui/empty-state'
import { ClassTable } from './class-table'
import { WalletGrid } from './wallet-grid'
import type { PortfolioView } from '@/core/view/portfolio-view'

type ViewKey = 'classes' | 'wallets'

const OPTIONS = [
  { key: 'classes' as const, label: 'Classes' },
  { key: 'wallets' as const, label: 'Carteiras' },
]

/** As duas visões do mesmo patrimônio. Troca por cross-fade, sem recarregar. */
export function PortfolioViews({ portfolio }: { portfolio: PortfolioView }) {
  const [view, setView] = useState<ViewKey>('classes')
  const query = useSearchScope('Buscar classe, ativo ou carteira')

  // A busca casa pelo nome da classe OU por qualquer ativo dentro dela: digitar
  // "BTC" precisa revelar Criptomoedas, não esconder tudo.
  const classes = portfolio.classes.filter(
    (c) =>
      matches(c.name, query) ||
      portfolio.consolidated.some((a) => a.classSlug === c.slug && matchesAsset(a.symbol, a.name, query)),
  )

  const wallets = portfolio.wallets.filter(
    (w) =>
      matches(w.name, query) ||
      portfolio.positions.some((p) => p.walletId === w.id && matchesAsset(p.symbol, p.name, query)),
  )

  const empty = view === 'classes' ? classes.length === 0 : wallets.length === 0

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-fg">
            Composição do patrimônio
          </h2>
          <p className="mt-1 text-[0.8125rem] text-fg-subtle">
            {view === 'classes'
              ? 'Classe → ativo consolidado → onde cada quantidade está guardada.'
              : 'Todas as carteiras lado a lado. Clique para ver os ativos de cada uma.'}
          </p>
        </div>

        <ViewSwitcher
          layoutId="portfolio-view"
          options={OPTIONS}
          value={view}
          onChange={setView}
        />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          {empty ? (
            <EmptyState
              title="Nada encontrado"
              description={`Nenhuma classe ou ativo corresponde a "${query}".`}
            />
          ) : view === 'classes' ? (
            <ClassTable
              classes={classes}
              positions={portfolio.positions}
              consolidated={portfolio.consolidated}
            />
          ) : (
            <WalletGrid wallets={wallets} positions={portfolio.positions} />
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  )
}

function matchesAsset(symbol: string, name: string, query: string): boolean {
  return matches(symbol, query) || matches(name, query)
}
