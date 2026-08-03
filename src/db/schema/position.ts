import {
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { instrument } from './instrument'
import { tenant } from './tenant'
import { wallet } from './wallet'

/**
 * O ativo dentro de uma carteira.
 *
 * ATENÇÃO: `quantity`, `avg_price`, `total_cost`, `realized_pnl` e
 * `income_total` são CACHE, não fonte da verdade. Eles existem por performance
 * — varrer o ledger a cada render seria caro. A verdade continua sendo a tabela
 * `transaction`, e `recomputePosition()` reconstrói estes valores do zero a
 * qualquer momento. Nenhum código de aplicação escreve aqui diretamente.
 * Ver CLAUDE.md §2.1.
 *
 * `numeric` com 10 casas: cripto tem satoshi (8 casas) e tokens com 18 decimais
 * já existem. `float` aqui corromperia dinheiro silenciosamente.
 */
export const position = pgTable(
  'position',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallet.id, { onDelete: 'cascade' }),
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => instrument.id),

    /** Valores do `field_schema` da classe. */
    customFields: jsonb('custom_fields').notNull().default({}),

    // --- derivados do ledger ------------------------------------------------
    quantity: numeric('quantity', { precision: 28, scale: 10 }).notNull().default('0'),
    avgPrice: numeric('avg_price', { precision: 28, scale: 10 }).notNull().default('0'),
    totalCost: numeric('total_cost', { precision: 28, scale: 10 }).notNull().default('0'),
    /** Tudo que já foi comprado. Não diminui na venda — ver `PositionState`. */
    totalInvested: numeric('total_invested', { precision: 28, scale: 10 }).notNull().default('0'),
    realizedPnl: numeric('realized_pnl', { precision: 28, scale: 10 }).notNull().default('0'),
    incomeTotal: numeric('income_total', { precision: 28, scale: 10 }).notNull().default('0'),
    recomputedAt: timestamp('recomputed_at', { withTimezone: true }),

    openedAt: date('opened_at').notNull(),
    /** Preenchido quando a posição zera. */
    closedAt: date('closed_at'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    // Um ativo aparece uma vez por carteira. A consolidação entre carteiras
    // acontece na leitura, nunca duplicando linha.
    uniqueIndex('position_wallet_instrument_idx').on(t.walletId, t.instrumentId),
    index('position_tenant_idx').on(t.tenantId, t.walletId),
  ],
).enableRLS()

export type PositionRow = typeof position.$inferSelect
export type NewPosition = typeof position.$inferInsert
