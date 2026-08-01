import {
  bigint,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { attachmentKindEnum, valuationMethodEnum } from './enums'
import { position } from './position'
import { tenant } from './tenant'

/**
 * Reavaliação de imóvel, empresa ou item alternativo.
 *
 * Não é transação: não move dinheiro nem quantidade. O ledger registra fatos
 * econômicos; a reavaliação é uma opinião de valor numa data.
 */
export const valuation = pgTable(
  'valuation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    positionId: uuid('position_id')
      .notNull()
      .references(() => position.id, { onDelete: 'cascade' }),
    valuedAt: date('valued_at').notNull(),
    value: numeric('value', { precision: 28, scale: 10 }).notNull(),
    currency: text('currency').notNull().default('BRL'),
    method: valuationMethodEnum('method').notNull().default('MANUAL'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('valuation_position_date_idx').on(t.positionId, t.valuedAt.desc())],
).enableRLS()

/**
 * Foto do patrimônio no fim do dia.
 *
 * Existe desde o dia 1 porque o histórico que não for gravado hoje está perdido
 * para sempre — e porque imóvel e empresa não têm série histórica de cotação
 * para reconstruir depois. Ver docs/00 §3.5.
 */
export const portfolioSnapshot = pgTable(
  'portfolio_snapshot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    totalValue: numeric('total_value', { precision: 28, scale: 10 }).notNull(),
    totalCost: numeric('total_cost', { precision: 28, scale: 10 }).notNull(),
    totalIncome: numeric('total_income', { precision: 28, scale: 10 }).notNull().default('0'),
    /** Valor por classe, para o gráfico de composição ao longo do tempo. */
    breakdown: jsonb('breakdown').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('snapshot_tenant_date_idx').on(t.tenantId, t.date)],
).enableRLS()

export const attachment = pgTable(
  'attachment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    positionId: uuid('position_id')
      .notNull()
      .references(() => position.id, { onDelete: 'cascade' }),
    kind: attachmentKindEnum('kind').notNull(),
    /** Caminho no Storage, sempre prefixado por tenant_id/. */
    storagePath: text('storage_path').notNull(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('attachment_position_idx').on(t.positionId)],
).enableRLS()

export type ValuationRow = typeof valuation.$inferSelect
export type SnapshotRow = typeof portfolioSnapshot.$inferSelect
export type AttachmentRow = typeof attachment.$inferSelect
