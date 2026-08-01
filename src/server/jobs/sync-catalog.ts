import 'server-only'

import { eq, inArray } from 'drizzle-orm'
import { getDb, type Database } from '@/db/client'
import { instrument, tickerCatalog } from '@/db/schema'
import {
  fetchB3Catalog,
  fetchCryptoCatalog,
  fetchInternationalCatalog,
  type CatalogEntry,
} from '@/integrations/catalog/sources'

export interface CatalogReport {
  total: number
  /** Instrumentos que já existiam e ganharam logo ou id externo. */
  enriched: number
  byProvider: Record<string, number>
  errors: { source: string; message: string }[]
}

/**
 * Reconstrói o catálogo de tickers.
 *
 * Cada fonte é independente: a B3 sair do ar não pode apagar as criptomoedas
 * do autocomplete. Por isso a limpeza é por PROVIDER e só acontece depois que
 * aquela fonte respondeu — o campo nunca fica vazio por causa de uma API
 * instável.
 *
 * Roda pelo cron, não por digitação. Consultar a API a cada tecla queimaria a
 * cota e deixaria o campo lento; a lista de papéis da B3 muda algumas vezes por
 * ano, não a cada minuto.
 */
export async function syncCatalogJob(): Promise<CatalogReport> {
  const db = getDb()

  const fontes: { nome: string; buscar: () => Promise<CatalogEntry[]> }[] = [
    { nome: 'brapi', buscar: fetchB3Catalog },
    { nome: 'coingecko', buscar: fetchCryptoCatalog },
    { nome: 'twelvedata', buscar: fetchInternationalCatalog },
  ]

  const report: CatalogReport = { total: 0, enriched: 0, byProvider: {}, errors: [] }

  for (const fonte of fontes) {
    try {
      const entries = await fonte.buscar()
      if (entries.length === 0) continue

      await db.delete(tickerCatalog).where(eq(tickerCatalog.provider, fonte.nome))

      // Em lotes: um `insert` com milhares de linhas estoura o limite de
      // parâmetros do Postgres muito antes de estourar a memória.
      for (const lote of chunk(entries, 500)) {
        await db
          .insert(tickerCatalog)
          .values(
            lote.map((e) => ({
              symbol: e.symbol,
              name: e.name,
              classSlug: e.classSlug,
              currency: e.currency,
              exchange: e.exchange,
              logoUrl: e.logoUrl,
              externalIds: e.externalIds,
              rank: String(e.rank),
              provider: e.provider,
            })),
          )
          // O mesmo símbolo pode vir duas vezes de bolsas diferentes. Vence o
          // primeiro, que é o mais relevante pela ordenação da fonte.
          .onConflictDoNothing()
      }

      report.byProvider[fonte.nome] = entries.length
      report.total += entries.length
      report.enriched += await enrichInstruments(db, entries)
    } catch (error) {
      report.errors.push({
        source: fonte.nome,
        message: error instanceof Error ? error.message : 'falha desconhecida',
      })
    }
  }

  return report
}

/**
 * Completa instrumentos já cadastrados com o que o catálogo sabe.
 *
 * Um ativo cadastrado antes desta sincronização nasceu sem logo e sem id
 * externo. Sem isto, ele ficaria com o monograma para sempre — e, se for
 * cripto, sem cotação nenhuma, porque a CoinGecko é indexada por id e não por
 * ticker.
 *
 * Preenche apenas o que está FALTANDO. Logo trocado à mão pelo usuário mora em
 * outra tabela e não é tocado aqui; e sobrescrever um id externo já resolvido
 * seria trocar o certo pelo provável.
 */
async function enrichInstruments(db: Database, entries: CatalogEntry[]): Promise<number> {
  const comDados = entries.filter(
    (e) => e.logoUrl !== null || Object.keys(e.externalIds).length > 0,
  )
  if (comDados.length === 0) return 0

  const porSimbolo = new Map(comDados.map((e) => [e.symbol, e]))

  const alvos = await db
    .select({
      id: instrument.id,
      symbol: instrument.symbol,
      logoUrl: instrument.logoUrl,
      externalIds: instrument.externalIds,
    })
    .from(instrument)
    .where(inArray(instrument.symbol, [...porSimbolo.keys()]))

  let count = 0

  for (const alvo of alvos) {
    const fonte = porSimbolo.get(alvo.symbol)
    if (!fonte) continue

    const idsAtuais = (alvo.externalIds ?? {}) as Record<string, string>
    const faltaLogo = !alvo.logoUrl && fonte.logoUrl
    const faltaId = Object.keys(idsAtuais).length === 0 && Object.keys(fonte.externalIds).length > 0

    if (!faltaLogo && !faltaId) continue

    await db
      .update(instrument)
      .set({
        ...(faltaLogo ? { logoUrl: fonte.logoUrl, logoSyncedAt: new Date() } : {}),
        ...(faltaId ? { externalIds: fonte.externalIds } : {}),
      })
      .where(eq(instrument.id, alvo.id))

    count += 1
  }

  return count
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}
