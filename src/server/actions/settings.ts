'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { instrument, instrumentLogoOverride, tenant } from '@/db/schema'
import { withRls } from '@/db/rls'
import { requireTenant } from '@/server/auth/session'
import { isMaster, requireMaster } from '@/server/auth/master'

const currencySchema = z.enum(['BRL', 'USD'])

const preferencesSchema = z.object({
  baseCurrency: currencySchema,
  /** { cripto: 'USD', stocks: 'USD' } — classe ausente segue a base. */
  classDisplayCurrency: z.record(z.string(), currencySchema),
})

export interface ActionResult {
  ok: boolean
  error?: string
}

/**
 * Salva a moeda base e os overrides por classe.
 *
 * A base é coluna própria porque governa todo o cálculo; os overrides vivem em
 * `settings` (jsonb) porque são preferência de apresentação e não mudam
 * somatório nenhum. Preferências assim tendem a se multiplicar, e cada uma
 * virar coluna seria uma migration por capricho.
 */
export async function savePreferences(raw: unknown): Promise<ActionResult> {
  const context = await requireTenant()

  const parsed = preferencesSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Preferência inválida.' }

  const { baseCurrency, classDisplayCurrency } = parsed.data

  try {
    await withRls(context.user.id, async (tx) => {
      const [current] = await tx
        .select({ settings: tenant.settings })
        .from(tenant)
        .where(eq(tenant.id, context.tenantId))
        .limit(1)

      const settings = { ...((current?.settings ?? {}) as Record<string, unknown>) }

      // Guarda só o que difere da base: override igual à base é ruído, e
      // apagá-lo mantém o jsonb enxuto.
      const overrides: Record<string, string> = {}
      for (const [slug, currency] of Object.entries(classDisplayCurrency)) {
        if (currency !== baseCurrency) overrides[slug] = currency
      }

      settings.classDisplayCurrency = overrides
      // O formato antigo sai de cena assim que o novo é gravado.
      delete settings.cryptoDisplayCurrency

      await tx
        .update(tenant)
        .set({ baseCurrency, settings, updatedAt: new Date() })
        .where(eq(tenant.id, context.tenantId))
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha ao salvar.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

const logoSchema = z.object({
  instrumentId: z.string().uuid(),
  /** Vazio remove o override e volta ao logo automático. */
  logoUrl: z.string().trim().url('Informe uma URL válida').or(z.literal('')),
})

/**
 * Troca o logo de um ativo — só para este tenant.
 *
 * `instrument` é global: o BTC é o mesmo registro para todo mundo. Escrever o
 * logo direto lá mudaria a tela de todos os usuários. Por isso o override mora
 * em tabela própria, com RLS, e apagar a linha restaura o automático.
 */
export async function saveLogoOverride(raw: unknown): Promise<ActionResult> {
  // Restrito ao operador. A verificação é AQUI, não só no botão: esconder na
  // interface não protege — a Server Action continua sendo um endpoint, e quem
  // souber o nome dela chama direto.
  await requireMaster()

  const context = await requireTenant()

  const parsed = logoSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const { instrumentId, logoUrl } = parsed.data

  try {
    await withRls(context.user.id, async (tx) => {
      if (!logoUrl) {
        await tx
          .delete(instrumentLogoOverride)
          .where(
            and(
              eq(instrumentLogoOverride.tenantId, context.tenantId),
              eq(instrumentLogoOverride.instrumentId, instrumentId),
            ),
          )
        return
      }

      await tx
        .insert(instrumentLogoOverride)
        .values({ tenantId: context.tenantId, instrumentId, logoUrl })
        .onConflictDoUpdate({
          target: [instrumentLogoOverride.tenantId, instrumentLogoOverride.instrumentId],
          set: { logoUrl, updatedAt: new Date() },
        })
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha ao salvar.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export interface InstrumentLogoRow {
  id: string
  symbol: string
  name: string
  /** O que o provider trouxe. */
  automatic: string | null
  /** O que você definiu. Nulo = usando o automático. */
  override: string | null
}

/** Ativos do tenant com o logo atual, para a tela de personalização. */
export async function listInstrumentLogos(): Promise<InstrumentLogoRow[]> {
  // Sem permissão, lista vazia em vez de erro: a tela simplesmente não mostra
  // a seção, e ninguém vê uma mensagem de acesso negado sobre algo que nem
  // deveria saber que existe.
  if (!(await isMaster())) return []

  const context = await requireTenant()
  const db = getDb()

  const overrides = await withRls(context.user.id, (tx) =>
    tx
      .select({
        instrumentId: instrumentLogoOverride.instrumentId,
        logoUrl: instrumentLogoOverride.logoUrl,
      })
      .from(instrumentLogoOverride),
  )

  const overrideById = new Map(overrides.map((o) => [o.instrumentId, o.logoUrl]))

  const rows = await db
    .select({ id: instrument.id, symbol: instrument.symbol, name: instrument.name, logoUrl: instrument.logoUrl })
    .from(instrument)

  return rows
    .map((row) => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      automatic: row.logoUrl,
      override: overrideById.get(row.id) ?? null,
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
}
