import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { assetClass } from './asset-class'
import { walletKindEnum } from './enums'
import { tenant } from './tenant'

/**
 * O nível do meio. Chama-se `wallet` no banco em toda classe; só o rótulo muda
 * na tela — "Campinas" é uma wallet de imóveis. Ver docs/01 §4.2.
 */
export const wallet = pgTable(
  'wallet',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    assetClassId: uuid('asset_class_id')
      .notNull()
      .references(() => assetClass.id),
    name: text('name').notNull(),
    kind: walletKindEnum('kind').notNull().default('OTHER'),
    /** Rede, endereço público, agência, cidade… */
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('wallet_tenant_class_idx').on(t.tenantId, t.assetClassId)],
).enableRLS()

export type WalletRow = typeof wallet.$inferSelect
export type NewWallet = typeof wallet.$inferInsert
