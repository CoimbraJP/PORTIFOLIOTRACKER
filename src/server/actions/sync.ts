'use server'

import { revalidatePath } from 'next/cache'
import { desc } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { quote } from '@/db/schema'
import { requireTenant } from '@/server/auth/session'
import { dailySnapshotJob } from '@/server/jobs/daily-snapshot'
import { syncCatalogJob } from '@/server/jobs/sync-catalog'
import { syncIncomeJob } from '@/server/jobs/sync-income'
import { syncFxJob, syncQuotesJob } from '@/server/jobs/sync-quotes'

export interface SyncNowResult {
  ok: boolean
  updated: number
  logos: number
  unresolved: string[]
  warnings: string[]
  error?: string
}

/**
 * "Cotar agora", disparado da interface.
 *
 * É o MESMO código do job agendado — só o gatilho muda. Isso importa: se o
 * botão rodasse uma versão própria, os dois caminhos divergiriam com o tempo e
 * o usuário veria resultado diferente conforme o jeito de atualizar.
 *
 * Exige sessão. O endpoint `/api/jobs/*` existe para o cron, com segredo; aqui
 * quem chama é uma pessoa logada, e a garantia vem da sessão.
 */
export async function syncNow(): Promise<SyncNowResult> {
  await requireTenant()

  try {
    const quotes = await syncQuotesJob()
    const fx = await syncFxJob()

    const warnings = [
      ...quotes.errors.map((e) => `${e.provider}: ${e.message}`),
      ...quotes.skipped.map((p) => `${p} desligado — falta credencial`),
      ...(fx.error ? [`câmbio: ${fx.error}`] : []),
    ]

    revalidatePath('/', 'layout')

    return {
      ok: true,
      updated: quotes.updated,
      logos: quotes.logos,
      unresolved: quotes.unresolved,
      warnings,
    }
  } catch (error) {
    return {
      ok: false,
      updated: 0,
      logos: 0,
      unresolved: [],
      warnings: [],
      error: error instanceof Error ? error.message : 'Falha ao atualizar.',
    }
  }
}

/**
 * Grava a foto de hoje sob demanda.
 *
 * Separado de `syncNow` de propósito: cotar é barato e pode ser repetido à
 * vontade; gravar snapshot mexe no histórico, e misturar as duas coisas num
 * botão só faria o usuário reescrever o ponto do dia sem querer.
 */
export async function snapshotNow(): Promise<{ ok: boolean; error?: string }> {
  await requireTenant()

  try {
    await dailySnapshotJob()
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha no snapshot.' }
  }
}

/**
 * Quando a última cotação foi GRAVADA — alimenta o rótulo do botão.
 *
 * `created_at`, não `as_of`: o rótulo responde "há quanto tempo você não
 * atualiza", e não "de quando é o preço do mercado". Com uma fonte atrasada os
 * dois divergem em horas.
 */
export async function lastQuoteAt(): Promise<string | null> {
  await requireTenant()

  const [row] = await getDb()
    .select({ createdAt: quote.createdAt })
    .from(quote)
    .orderBy(desc(quote.createdAt))
    .limit(1)

  return row?.createdAt.toISOString() ?? null
}

export interface CatalogResult {
  ok: boolean
  total: number
  enriched: number
  warnings: string[]
  error?: string
}

/**
 * Reconstrói o catálogo de tickers sob demanda.
 *
 * Existe como botão porque a primeira carga precisa acontecer antes do primeiro
 * cron — sem ela o autocomplete nasce vazio e parece quebrado. Depois disso, o
 * job agendado dá conta.
 */
export async function syncCatalogNow(): Promise<CatalogResult> {
  await requireTenant()

  try {
    const report = await syncCatalogJob()
    revalidatePath('/', 'layout')

    return {
      ok: true,
      total: report.total,
      enriched: report.enriched,
      warnings: report.errors.map((e) => `${e.source}: ${e.message}`),
    }
  } catch (error) {
    return {
      ok: false,
      total: 0,
      enriched: 0,
      warnings: [],
      error: error instanceof Error ? error.message : 'Falha ao montar o catálogo.',
    }
  }
}

export interface IncomeResult {
  ok: boolean
  created: number
  updated: number
  actions: number
  unresolved: string[]
  warnings: string[]
  error?: string
}

/**
 * "Buscar proventos", disparado da interface.
 *
 * Separado de `syncNow` de propósito. Cotação muda o dia inteiro e é barato
 * repetir; provento é anunciado com dias de antecedência e cada busca custa uma
 * requisição por ativo. Juntar os dois num botão faria o usuário queimar a cota
 * de proventos toda vez que quisesse só ver o preço.
 */
export async function syncIncomeNow(): Promise<IncomeResult> {
  await requireTenant()

  try {
    const report = await syncIncomeJob()
    revalidatePath('/', 'layout')

    return {
      ok: true,
      created: report.created,
      updated: report.updated,
      actions: report.actions,
      unresolved: report.unresolved,
      warnings: report.errors.map((e) => `${e.provider}: ${e.message}`),
    }
  } catch (error) {
    return {
      ok: false,
      created: 0,
      updated: 0,
      actions: 0,
      unresolved: [],
      warnings: [],
      error: error instanceof Error ? error.message : 'Falha ao buscar proventos.',
    }
  }
}
