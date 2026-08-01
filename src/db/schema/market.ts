import {
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
import { sql } from 'drizzle-orm'
import { corporateActionTypeEnum } from './enums'
import { instrument } from './instrument'

/* -------------------------------------------------------------------------- *
 * Dados GLOBAIS — sem tenant_id.
 *
 * Cotação, câmbio e evento corporativo são fatos do mercado, iguais para todo
 * mundo. Leitura liberada a qualquer usuário autenticado; escrita só pelo job,
 * com a service role. É isto que faz o custo de API crescer com o número de
 * ativos distintos, não de usuários.
 * -------------------------------------------------------------------------- */

export const quote = pgTable(
  'quote',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => instrument.id, { onDelete: 'cascade' }),
    price: numeric('price', { precision: 28, scale: 10 }).notNull(),
    currency: text('currency').notNull(),
    /**
     * Quando o preço era VERDADEIRO no mercado.
     *
     * Não confundir com `created_at`: numa fonte com atraso, um preço buscado
     * agora carrega `as_of` de horas atrás. Serve para exibir "cotação de tal
     * hora" — nunca para decidir qual cotação é a mais recente.
     */
    asOf: timestamp('as_of', { withTimezone: true }).notNull(),
    provider: text('provider').notNull(),
    /**
     * Quando NÓS soubemos do preço. É este que ordena.
     *
     * A última coisa que gravamos é o que sabemos hoje, mesmo que o mercado a
     * tenha carimbado horas antes.
     */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('quote_instrument_asof_idx').on(t.instrumentId, t.asOf.desc()),
    // O índice que a busca de "cotação atual" usa de verdade.
    index('quote_instrument_created_idx').on(t.instrumentId, t.createdAt.desc()),
  ],
)

export const fxRate = pgTable(
  'fx_rate',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    base: text('base').notNull(),
    quoteCurrency: text('quote_currency').notNull(),
    rate: numeric('rate', { precision: 28, scale: 10 }).notNull(),
    asOf: date('as_of').notNull(),
    provider: text('provider').notNull(),
  },
  (t) => [index('fx_rate_pair_idx').on(t.base, t.quoteCurrency, t.asOf.desc())],
)

/**
 * Evento corporativo.
 *
 * `ex_date` é a DATA-COM: quem tinha o ativo nela tem direito ao provento. É
 * por isso que o motor precisa reconstruir a posição histórica pelo ledger —
 * sem histórico de transações, não há como saber quanto o usuário tinha.
 */
export const corporateAction = pgTable(
  'corporate_action',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => instrument.id, { onDelete: 'cascade' }),
    type: corporateActionTypeEnum('type').notNull(),
    exDate: date('ex_date').notNull(),
    paymentDate: date('payment_date'),
    valuePerShare: numeric('value_per_share', { precision: 28, scale: 10 }),
    /** Para split, grupamento e bonificação. */
    ratio: numeric('ratio', { precision: 28, scale: 10 }),
    currency: text('currency').notNull().default('BRL'),
    provider: text('provider').notNull(),
    /** Resposta crua do provider, para auditar divergência sem refazer a busca. */
    raw: jsonb('raw'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('corporate_action_instrument_idx').on(t.instrumentId, t.exDate.desc()),
    // Idempotência do lado do BANCO, não só do código.
    //
    // A sincronização vai rebuscar os mesmos proventos toda vez que rodar. Sem
    // esta restrição, um `insert` esquecido em algum caminho novo duplicaria o
    // dividendo — e provento duplicado vira renda que nunca existiu.
    //
    // O `coalesce` existe porque `payment_date` é nulo em provento anunciado e
    // ainda não pago. Pelo padrão do Postgres dois nulos são considerados
    // diferentes entre si, então a restrição não pegaria justamente esse caso —
    // e é ele que mais aparece, já que o anúncio vem antes do pagamento.
    uniqueIndex('corporate_action_unique_idx').on(
      t.instrumentId,
      t.type,
      t.exDate,
      sql`coalesce(${t.paymentDate}, ${t.exDate})`,
    ),
  ],
)

/**
 * Catálogo de tickers conhecidos.
 *
 * Serve ao autocomplete do formulário, e o motivo é evitar um erro caro: sem
 * lista, "KLBN4" digitado como "KLBN44" cria um ativo fantasma que nunca terá
 * cotação, e o usuário só descobre semanas depois — ou pior, "vende" algo que
 * nunca existiu para se livrar dele.
 *
 * Global e sem `tenant_id`: a lista de papéis da B3 é a mesma para todo mundo.
 * Sincronizada por job, nunca por digitação — consultar a API a cada tecla
 * queimaria a cota e deixaria o campo lento.
 */
export const tickerCatalog = pgTable(
  'ticker_catalog',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    symbol: text('symbol').notNull(),
    name: text('name').notNull(),
    /** A classe onde este papel deve ser cadastrado. */
    classSlug: text('class_slug').notNull(),
    currency: text('currency').notNull().default('BRL'),
    exchange: text('exchange'),
    logoUrl: text('logo_url'),
    /** `{ coingecko: "bitcoin" }` — resolve o id que o provider precisa. */
    externalIds: jsonb('external_ids').notNull().default({}),
    /**
     * Posição por relevância, menor é mais relevante.
     *
     * Existe para a sugestão não ser alfabética: quem digita "B" espera BBAS3
     * antes de BAHI3. Vem do volume na B3 e do valor de mercado em cripto.
     */
    rank: numeric('rank', { precision: 12, scale: 0 }),
    provider: text('provider').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Um papel pode existir em duas classes? Não — mas pode existir com o mesmo
    // símbolo em bolsas diferentes, e é a classe que separa.
    uniqueIndex('ticker_catalog_symbol_idx').on(t.symbol, t.classSlug),
    // Busca por prefixo do código, que é como as pessoas digitam.
    index('ticker_catalog_search_idx').on(t.classSlug, t.symbol),
  ],
)

export type TickerCatalogRow = typeof tickerCatalog.$inferSelect
export type QuoteRow = typeof quote.$inferSelect
export type FxRateRow = typeof fxRate.$inferSelect
export type CorporateActionRow = typeof corporateAction.$inferSelect
