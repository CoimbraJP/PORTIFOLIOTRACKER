import 'server-only'

import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm'
import { money } from '@/core/money/decimal'
import { convertMoney, currencyFor } from '@/core/money/display'
import { formatDate, formatMoney, formatQuantity } from '@/core/money/format'
import type { AssetClassSlug } from '@/core/types/portfolio'
import { withRls } from '@/db/rls'
import { assetClass, instrument, position, transaction, wallet } from '@/db/schema'
import { loadDisplaySettings } from './display-settings'

export interface HistoryEntry {
  id: string
  type: string
  typeLabel: string
  /** Grupo do lançamento, para colorir e filtrar. */
  group: 'trade' | 'transfer' | 'income' | 'event'
  date: string
  dateLabel: string
  symbol: string
  name: string
  logoUrl: string | null
  classSlug: AssetClassSlug
  className: string
  walletName: string
  quantity: string | null
  amount: string
  /** Sinal do efeito em caixa: entrada, saída ou neutro. */
  direction: 'in' | 'out' | 'neutral'
  notes: string | null
  source: string
}

export interface HistoryFilters {
  classSlug?: string
  walletId?: string
  group?: string
  from?: string
  to?: string
}

export interface HistoryResult {
  entries: HistoryEntry[]
  classes: { slug: string; name: string }[]
  wallets: { id: string; name: string }[]
  total: number
}

const LABELS: Record<string, { label: string; group: HistoryEntry['group']; direction: HistoryEntry['direction'] }> = {
  BUY: { label: 'Compra', group: 'trade', direction: 'out' },
  SELL: { label: 'Venda', group: 'trade', direction: 'in' },
  TRANSFER_IN: { label: 'Transferência recebida', group: 'transfer', direction: 'neutral' },
  TRANSFER_OUT: { label: 'Transferência enviada', group: 'transfer', direction: 'neutral' },
  DIVIDEND: { label: 'Dividendo', group: 'income', direction: 'in' },
  JCP: { label: 'JCP', group: 'income', direction: 'in' },
  INCOME: { label: 'Rendimento', group: 'income', direction: 'in' },
  RENT: { label: 'Aluguel', group: 'income', direction: 'in' },
  INTEREST: { label: 'Juros recebidos', group: 'income', direction: 'in' },
  STAKING: { label: 'Staking', group: 'income', direction: 'in' },
  SPLIT: { label: 'Desdobramento', group: 'event', direction: 'neutral' },
  REVERSE_SPLIT: { label: 'Grupamento', group: 'event', direction: 'neutral' },
  BONUS: { label: 'Bonificação', group: 'event', direction: 'neutral' },
  ACCRUAL: { label: 'Juros provisionados', group: 'income', direction: 'neutral' },
}

/**
 * Histórico de lançamentos do tenant.
 *
 * Os filtros vão no SQL, não em memória: uma carteira com anos de operação
 * pode ter milhares de linhas, e trazer tudo para filtrar no servidor
 * desperdiçaria banda a cada troca de filtro.
 *
 * Nada de `deleted_at` aparece — patrimônio usa soft delete, e o histórico
 * mostra o que vale hoje. A trilha de auditoria continua no banco.
 */
export async function loadHistory(
  userId: string,
  tenantId: string,
  filters: HistoryFilters = {},
): Promise<HistoryResult> {
  const display = await loadDisplaySettings(tenantId)

  return withRls(userId, async (tx) => {
    const conditions = [isNull(transaction.deletedAt), isNull(position.deletedAt)]

    if (filters.classSlug) conditions.push(eq(assetClass.slug, filters.classSlug))
    if (filters.walletId) conditions.push(eq(wallet.id, filters.walletId))
    if (filters.from) conditions.push(gte(transaction.occurredAt, new Date(`${filters.from}T00:00:00Z`)))
    if (filters.to) conditions.push(lte(transaction.occurredAt, new Date(`${filters.to}T23:59:59Z`)))

    const rows = await tx
      .select({
        id: transaction.id,
        type: transaction.type,
        occurredAt: transaction.occurredAt,
        quantity: transaction.quantity,
        grossAmount: transaction.grossAmount,
        netAmount: transaction.netAmount,
        taxes: transaction.taxes,
        notes: transaction.notes,
        source: transaction.source,
        symbol: instrument.symbol,
        name: instrument.name,
        logoUrl: instrument.logoUrl,
        walletName: wallet.name,
        classSlug: assetClass.slug,
        className: assetClass.name,
      })
      .from(transaction)
      .innerJoin(position, eq(transaction.positionId, position.id))
      .innerJoin(instrument, eq(position.instrumentId, instrument.id))
      .innerJoin(wallet, eq(position.walletId, wallet.id))
      .innerJoin(assetClass, eq(wallet.assetClassId, assetClass.id))
      .where(and(...conditions))
      .orderBy(desc(transaction.occurredAt), desc(transaction.createdAt))
      .limit(500)

    const entries: HistoryEntry[] = rows
      .map((row) => {
        const meta = LABELS[row.type] ?? {
          label: row.type,
          group: 'event' as const,
          direction: 'neutral' as const,
        }

        const slug = row.classSlug as AssetClassSlug
        const currency = currencyFor(slug, display)
        const raw = money(row.netAmount)
        const amount = convertMoney(raw, display.base, currency, display.usdBrl)

        return {
          id: row.id,
          type: row.type,
          typeLabel: meta.label,
          group: meta.group,
          date: row.occurredAt.toISOString().slice(0, 10),
          dateLabel: formatDate(row.occurredAt.toISOString()),
          symbol: row.symbol,
          name: row.name,
          logoUrl: row.logoUrl,
          classSlug: slug,
          className: row.className,
          walletName: row.walletName,
          quantity: money(row.quantity).isZero() ? null : formatQuantity(money(row.quantity)),
          amount: formatMoney(amount, currency),
          direction: meta.direction,
          notes: row.notes,
          source: row.source,
        }
      })
      .filter((entry) => !filters.group || entry.group === filters.group)

    // Opções dos seletores: só o que o usuário realmente tem.
    const classes = await tx
      .selectDistinct({ slug: assetClass.slug, name: assetClass.name })
      .from(wallet)
      .innerJoin(assetClass, eq(wallet.assetClassId, assetClass.id))
      .where(isNull(wallet.deletedAt))

    const wallets = await tx
      .select({ id: wallet.id, name: wallet.name })
      .from(wallet)
      .where(isNull(wallet.deletedAt))

    return { entries, classes, wallets, total: entries.length }
  })
}
