import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { instrument } from './instrument'
import { tenant } from './tenant'

/**
 * Logo escolhido pelo usuário, sobrepondo o que o provider trouxe.
 *
 * Existe porque `instrument` é GLOBAL: trocar o logo do BTC direto lá mudaria
 * para todos os tenants. O override é por tenant e protegido por RLS — cada um
 * enxerga e altera apenas o seu. Ver docs/01 §3.
 *
 * Apagar a linha faz voltar ao logo automático, então "restaurar o padrão" é
 * um DELETE, não um campo extra de estado.
 */
export const instrumentLogoOverride = pgTable(
  'instrument_logo_override',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => instrument.id, { onDelete: 'cascade' }),
    logoUrl: text('logo_url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.instrumentId] })],
)

export type InstrumentLogoOverrideRow = typeof instrumentLogoOverride.$inferSelect
