import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Um usuário, um tenant.
 *
 * Sem tabela `membership` — decisão de docs/01 §3. O que preserva o caminho
 * para o multiusuário não é a membership, é o `tenant_id` presente em toda
 * tabela de negócio. Se um dia existir "convidar membro", entra a membership e
 * muda só a origem do claim; nenhum dado migra.
 */
export const tenant = pgTable('tenant', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** FK lógica para auth.users. O trigger de signup cria a linha. */
  ownerUserId: uuid('owner_user_id').notNull().unique(),
  name: text('name').notNull(),
  baseCurrency: text('base_currency').notNull().default('BRL'),
  /** Preferências: showAdvancedReturns, allocationTargets… */
  settings: jsonb('settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Tenant = typeof tenant.$inferSelect
export type NewTenant = typeof tenant.$inferInsert
