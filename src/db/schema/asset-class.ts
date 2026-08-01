import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { valuationModeEnum } from './enums'
import { tenant } from './tenant'

/**
 * Classe de ativo.
 *
 * `tenant_id` nulo = classe de sistema, visível a todos. As 12 iniciais entram
 * assim pelo seed.
 *
 * `field_schema`, `wallet_term` e `asset_term` são JSONB de propósito: criar a
 * classe "Obras de Arte" com campos próprios precisa ser um INSERT, não uma
 * migration. Uma tabela por classe tornaria "criar classe" um deploy — inviável
 * num SaaS. Ver docs/00 §3.4.
 */
export const assetClass = pgTable(
  'asset_class',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenant.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    valuationMode: valuationModeEnum('valuation_mode').notNull(),
    supportsDividends: boolean('supports_dividends').notNull().default(false),
    /** { one, many } — "Cidade/Cidades" em imóveis, "Corretora/Corretoras" em ações. */
    walletTerm: jsonb('wallet_term').notNull(),
    assetTerm: jsonb('asset_term').notNull(),
    /** Campos dinâmicos renderizados pelo formulário. */
    fieldSchema: jsonb('field_schema').notNull().default({ fields: [] }),
    icon: text('icon').notNull(),
    /** Nome do token de cor, nunca hexadecimal. */
    colorVar: text('color_var').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('asset_class_tenant_idx').on(t.tenantId, t.sortOrder)],
).enableRLS()

export type AssetClassRow = typeof assetClass.$inferSelect
export type NewAssetClass = typeof assetClass.$inferInsert
