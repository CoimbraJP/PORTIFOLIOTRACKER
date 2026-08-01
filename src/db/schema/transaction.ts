import { index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { corporateAction } from './market'
import { transactionSourceEnum, transactionTypeEnum } from './enums'
import { position } from './position'
import { tenant } from './tenant'

/**
 * O LEDGER — fonte única da verdade.
 *
 * Quantidade e preço médio nunca são digitados: são derivados daqui. É esta
 * tabela que torna possível saber quanto o usuário tinha na data-com de um
 * dividendo, ajustar preço médio num desdobramento e calcular lucro realizado
 * numa venda parcial. Ver docs/00 §3.1.
 *
 * Nada é apagado de verdade: `deleted_at` em vez de DELETE.
 */
export const transaction = pgTable(
  'transaction',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    positionId: uuid('position_id')
      .notNull()
      .references(() => position.id, { onDelete: 'cascade' }),

    type: transactionTypeEnum('type').notNull(),
    /** Data do FATO, não do cadastro. Lançamento retroativo é normal. */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),

    quantity: numeric('quantity', { precision: 28, scale: 10 }).notNull().default('0'),
    unitPrice: numeric('unit_price', { precision: 28, scale: 10 }).notNull().default('0'),
    grossAmount: numeric('gross_amount', { precision: 28, scale: 10 }).notNull().default('0'),
    fees: numeric('fees', { precision: 28, scale: 10 }).notNull().default('0'),
    taxes: numeric('taxes', { precision: 28, scale: 10 }).notNull().default('0'),
    netAmount: numeric('net_amount', { precision: 28, scale: 10 }).notNull().default('0'),

    /** Moeda original + câmbio na data. Sem isso não dá para saber se o ganho
     *  veio do ativo ou do dólar. Ver docs/00 §3.6. */
    currency: text('currency').notNull().default('BRL'),
    fxRate: numeric('fx_rate', { precision: 28, scale: 10 }).notNull().default('1'),

    /** Razão do desdobramento/grupamento/bonificação. */
    ratio: numeric('ratio', { precision: 28, scale: 10 }),

    source: transactionSourceEnum('source').notNull().default('MANUAL'),
    corporateActionId: uuid('corporate_action_id').references(() => corporateAction.id),
    /** Liga as duas pernas de uma transferência. */
    transferGroupId: uuid('transfer_group_id'),

    /**
     * Impede duplicata em importação e em provento buscado duas vezes.
     * Ver CLAUDE.md §2.10.
     */
    idempotencyKey: text('idempotency_key'),

    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    // Ordem cronológica por posição: é como o motor de ledger varre.
    index('transaction_position_time_idx').on(t.positionId, t.occurredAt),
    index('transaction_tenant_time_idx').on(t.tenantId, t.occurredAt),
    index('transaction_transfer_group_idx').on(t.transferGroupId),
  ],
)

export type TransactionRow = typeof transaction.$inferSelect
export type NewTransaction = typeof transaction.$inferInsert
