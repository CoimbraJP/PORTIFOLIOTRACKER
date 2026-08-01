import 'server-only'

import { eq, isNull } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { assetClass, fxRate, instrument, position, quote, wallet } from '@/db/schema'
import { isQuotable, syncQuotes as runProviders } from '@/integrations/providers/registry'
import { LOGO_TTL_DAYS } from '@/integrations/providers/logo'
import { toPriceString, type InstrumentRef } from '@/integrations/providers/types'
import type { AssetClassSlug } from '@/core/types/portfolio'
import { fetchFxRates } from '@/integrations/fx/awesome-api'

export interface SyncReport {
  instruments: number
  updated: number
  logos: number
  unresolved: string[]
  errors: { provider: string; message: string }[]
  skipped: string[]
}

/**
 * Atualiza as cotações de tudo que está em carteira.
 *
 * Roda com a conexão privilegiada, sem RLS: `quote` e `instrument` global são
 * dados de MERCADO, iguais para todos os tenants. Um job sem usuário associado
 * não teria contexto de RLS para assumir, e forçar um seria mentir sobre quem
 * está pedindo.
 *
 * Só busca instrumento que alguém realmente possui. É isso que faz o custo de
 * API crescer com o número de ativos distintos, não de usuários.
 */
export async function syncQuotesJob(): Promise<SyncReport> {
  const db = getDb()

  const rows = await db
    .selectDistinct({
      id: instrument.id,
      symbol: instrument.symbol,
      kind: instrument.kind,
      externalIds: instrument.externalIds,
      logoUrl: instrument.logoUrl,
      logoSyncedAt: instrument.logoSyncedAt,
      classSlug: assetClass.slug,
    })
    .from(position)
    .innerJoin(instrument, eq(position.instrumentId, instrument.id))
    .innerJoin(wallet, eq(position.walletId, wallet.id))
    .innerJoin(assetClass, eq(wallet.assetClassId, assetClass.id))
    .where(isNull(position.deletedAt))

  const refs: InstrumentRef[] = rows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    classSlug: row.classSlug as AssetClassSlug,
    kind: row.kind,
    externalIds: (row.externalIds ?? {}) as Record<string, string>,
  }))

  // Imóvel e empréstimo não têm cotação de mercado. Mandá-los aos providers
  // gastaria requisição para receber "não encontrado".
  const quotable = refs.filter(isQuotable)

  if (quotable.length === 0) {
    return { instruments: 0, updated: 0, logos: 0, unresolved: [], errors: [], skipped: [] }
  }

  const outcome = await runProviders(quotable)

  const staleLogoCutoff = new Date(Date.now() - LOGO_TTL_DAYS * 86_400_000)
  const logoStateById = new Map(rows.map((r) => [r.id, r]))
  let logos = 0

  const invalidos: string[] = []

  for (const result of outcome.quotes) {
    // Última linha de defesa antes do banco. Os providers já validam, mas um
    // provider novo pode esquecer — e `numeric` recusando string quebra a
    // sincronização inteira, não só aquele ativo.
    if (toPriceString(result.price) === null) {
      invalidos.push(logoStateById.get(result.instrumentId)?.symbol ?? result.instrumentId)
      continue
    }

    await db.insert(quote).values({
      instrumentId: result.instrumentId,
      price: result.price,
      currency: result.currency,
      asOf: result.asOf,
      provider: outcomeProvider(outcome, result.instrumentId),
    })

    // Logo vem de carona na mesma resposta. Só grava se estiver faltando ou
    // vencido — marca não muda toda semana, e escrever à toa suja o histórico.
    const current = logoStateById.get(result.instrumentId)
    const vencido = !current?.logoSyncedAt || current.logoSyncedAt < staleLogoCutoff

    if (result.logoUrl && current && (!current.logoUrl || vencido)) {
      await db
        .update(instrument)
        .set({ logoUrl: result.logoUrl, logoSyncedAt: new Date() })
        .where(eq(instrument.id, result.instrumentId))
      logos += 1
    }
  }

  return {
    instruments: quotable.length,
    updated: outcome.quotes.length,
    logos,
    unresolved: [...outcome.unresolved, ...invalidos],
    errors: outcome.errors,
    skipped: outcome.skipped,
  }
}

function outcomeProvider(outcome: { quotes: { instrumentId: string }[] }, id: string): string {
  // O registry já agregou; o provider exato não volta por cotação. Como cada
  // classe tem um provider só, guardar a origem genérica basta para auditoria.
  return outcome.quotes.some((q) => q.instrumentId === id) ? 'auto' : 'desconhecido'
}

export interface FxReport {
  pairs: number
  error?: string
}

/** Câmbio. Separado das cotações: falha de um não pode derrubar o outro. */
export async function syncFxJob(): Promise<FxReport> {
  const db = getDb()

  try {
    const rates = await fetchFxRates(['USD-BRL'])

    for (const rate of rates) {
      await db.insert(fxRate).values({
        base: rate.base,
        quoteCurrency: rate.quote,
        rate: rate.rate,
        asOf: rate.asOf.toISOString().slice(0, 10),
        provider: 'awesomeapi',
      })
    }

    return { pairs: rates.length }
  } catch (error) {
    return { pairs: 0, error: error instanceof Error ? error.message : 'Falha no câmbio' }
  }
}
