import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { instrumentKindEnum } from './enums'
import { tenant } from './tenant'

/**
 * Catálogo de instrumentos.
 *
 * `is_global = true` → compartilhado por todos os tenants. Uma cotação de BTC
 * serve o sistema inteiro: o custo de API cresce com o número de ativos
 * distintos, não de usuários. Ver docs/00 §3.2.
 *
 * `is_global = false` → instrumento privado do tenant. Imóvel, empresa e
 * contrato de empréstimo entram aqui, e assim o resto do sistema trata tudo de
 * forma uniforme, sem `if (é imóvel)` espalhado pelo código.
 */
export const instrument = pgTable(
  'instrument',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Preenchido apenas quando `is_global = false`. */
    tenantId: uuid('tenant_id').references(() => tenant.id, { onDelete: 'cascade' }),
    isGlobal: boolean('is_global').notNull().default(true),
    /** Canônico e em caixa alta. É por ele que a consolidação agrupa. */
    symbol: text('symbol').notNull(),
    name: text('name').notNull(),
    kind: instrumentKindEnum('kind').notNull(),
    currency: text('currency').notNull().default('BRL'),
    exchange: text('exchange'),
    /** { coingecko: "bitcoin", brapi: "BBAS3", isin: "..." } */
    externalIds: jsonb('external_ids').notNull().default({}),
    /** Sincronizado pelo LogoProvider. Nulo é estado normal, não erro. */
    logoUrl: text('logo_url'),
    logoSyncedAt: timestamp('logo_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Símbolo global é único no sistema inteiro; símbolo privado é único por
    // tenant. Dois índices parciais em vez de um constraint que não caberia
    // nos dois casos.
    uniqueIndex('instrument_global_symbol_idx').on(t.symbol).where(sql`${t.isGlobal} = true`),
    uniqueIndex('instrument_tenant_symbol_idx')
      .on(t.tenantId, t.symbol)
      .where(sql`${t.isGlobal} = false`),
    index('instrument_symbol_idx').on(t.symbol),
  ],
).enableRLS()

export type InstrumentRow = typeof instrument.$inferSelect
export type NewInstrument = typeof instrument.$inferInsert
