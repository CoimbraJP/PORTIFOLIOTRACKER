import 'server-only'

import { desc, eq } from 'drizzle-orm'
import { money } from '@/core/money/decimal'
import type { ClassOverrides, DisplaySettings } from '@/core/money/display'
import type { CurrencyCode } from '@/core/money/format'
import type { AssetClassSlug } from '@/core/types/portfolio'
import { ASSET_CLASSES } from '@/config/asset-classes'
import { getDb } from '@/db/client'
import { fxRate, tenant } from '@/db/schema'

interface TenantSettings {
  /** { cripto: 'USD', stocks: 'USD' } */
  classDisplayCurrency?: Record<string, string>
  /** Formato antigo, de quando só cripto tinha override. */
  cryptoDisplayCurrency?: string
}

const VALID_SLUGS = new Set<string>(ASSET_CLASSES.map((c) => c.slug))

/**
 * Preferências de exibição do tenant, já com o câmbio resolvido.
 *
 * `baseCurrency` é coluna própria porque governa o cálculo inteiro. Os
 * overrides por classe vivem em `settings` (jsonb): são apresentação pura, não
 * mudam somatório nenhum, e virar coluna cada um seria uma migration por
 * capricho.
 */
export async function loadDisplaySettings(tenantId: string): Promise<DisplaySettings> {
  const db = getDb()

  const [row] = await db
    .select({ baseCurrency: tenant.baseCurrency, settings: tenant.settings })
    .from(tenant)
    .where(eq(tenant.id, tenantId))
    .limit(1)

  const base = normalize(row?.baseCurrency) ?? 'BRL'
  const settings = (row?.settings ?? {}) as TenantSettings

  const classOverrides = readOverrides(settings, base)
  const precisaCambio = Object.keys(classOverrides).length > 0 || base !== 'BRL'

  let usdBrl: ReturnType<typeof money> | null = null

  if (precisaCambio) {
    const [rate] = await db
      .select({ rate: fxRate.rate })
      .from(fxRate)
      .where(eq(fxRate.base, 'USD'))
      .orderBy(desc(fxRate.asOf))
      .limit(1)

    usdBrl = rate ? money(rate.rate) : null
  }

  return { base, classOverrides, usdBrl }
}

/**
 * Lê o mapa de overrides, aceitando o formato antigo.
 *
 * A versão anterior guardava só `cryptoDisplayCurrency`. Migrar em silêncio
 * evita que quem já configurou perca a preferência ao atualizar.
 */
function readOverrides(settings: TenantSettings, base: CurrencyCode): ClassOverrides {
  const result: ClassOverrides = {}
  const raw = settings.classDisplayCurrency ?? {}

  for (const [slug, value] of Object.entries(raw)) {
    if (!VALID_SLUGS.has(slug)) continue
    const currency = normalize(value)
    // Override igual à base não é override — evita conversão de ida e volta.
    if (currency && currency !== base) result[slug as AssetClassSlug] = currency
  }

  if (!settings.classDisplayCurrency && settings.cryptoDisplayCurrency) {
    const legado = normalize(settings.cryptoDisplayCurrency)
    if (legado && legado !== base) result.cripto = legado
  }

  return result
}

function normalize(value: string | undefined | null): CurrencyCode | null {
  if (value === 'BRL' || value === 'USD' || value === 'EUR') return value
  return null
}
