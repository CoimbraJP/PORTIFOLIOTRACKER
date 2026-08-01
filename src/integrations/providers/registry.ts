import { BrapiProvider } from './brapi'
import { CoinGeckoProvider } from './coingecko'
import { TwelveDataProvider } from './twelve-data'
import type { InstrumentRef, PriceProvider, ProviderRun, QuoteResult } from './types'

export interface SyncOutcome {
  quotes: QuoteResult[]
  /** Símbolos que nenhum provider soube responder. */
  unresolved: string[]
  /** Falhas por provider — informativas, nunca fatais. */
  errors: { provider: string; message: string }[]
  /** Providers desligados por falta de credencial. */
  skipped: string[]
}

const PROVIDERS: PriceProvider[] = [
  new CoinGeckoProvider(),
  new BrapiProvider(),
  new TwelveDataProvider(),
]

/**
 * Roteia instrumentos para os providers e agrega o resultado.
 *
 * Duas regras que evitam os problemas clássicos:
 *
 * 1. **Sempre em lote.** Um instrumento por requisição estoura o rate limit de
 *    qualquer API gratuita na primeira dezena de ativos.
 * 2. **Falha de um não derruba os outros.** Se a BRAPI está fora do ar, cripto
 *    ainda atualiza. Um erro vira uma linha no relatório, não uma exceção — a
 *    alternativa seria o usuário apertar "Atualizar" e não ver nada acontecer.
 *
 * Instrumento que nenhum provider aceita não é erro: imóvel e empréstimo não
 * têm cotação de mercado, e é assim mesmo.
 */
export async function syncQuotes(instruments: InstrumentRef[]): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { quotes: [], unresolved: [], errors: [], skipped: [] }
  const pending = new Set(instruments.map((i) => i.symbol))

  const active = PROVIDERS.filter((provider) => {
    if (provider.isAvailable()) return true
    outcome.skipped.push(provider.name)
    return false
  })

  // Providers em paralelo: são hosts diferentes, não competem entre si.
  const runs: ProviderRun[] = await Promise.all(
    active.map((provider): Promise<ProviderRun> => {
      const mine = instruments.filter((i) => provider.supports(i))
      if (mine.length === 0) {
        return Promise.resolve({ provider: provider.name, quotes: [], missing: [] })
      }
      return provider.fetchQuotes(mine)
    }),
  )

  for (const run of runs) {
    outcome.quotes.push(...run.quotes)
    if (run.error) outcome.errors.push({ provider: run.provider, message: run.error })
  }

  const resolved = new Set(outcome.quotes.map((q) => q.instrumentId))
  for (const instrument of instruments) {
    if (resolved.has(instrument.id)) pending.delete(instrument.symbol)
  }

  outcome.unresolved = [...pending]
  return outcome
}

/** Instrumentos que algum provider consegue cotar. Evita chamada inútil. */
export function isQuotable(instrument: InstrumentRef): boolean {
  return PROVIDERS.some((provider) => provider.supports(instrument))
}
