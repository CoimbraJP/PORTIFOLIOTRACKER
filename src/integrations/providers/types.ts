import type { AssetClassSlug, InstrumentKind } from '@/core/types/portfolio'

/** Instrumento como o provider precisa vê-lo — sem depender do schema do banco. */
export interface InstrumentRef {
  id: string
  symbol: string
  /** A classe da CARTEIRA onde ele está. Diz onde foi arquivado. */
  classSlug: AssetClassSlug
  /**
   * A natureza do próprio ativo. Diz o que ele é.
   *
   * Os dois vêm juntos porque podem discordar: um CDB arquivado numa carteira
   * de ações tem `classSlug: 'acoes-br'` e `kind: 'FIXED_INCOME'`. Nenhum
   * provider deve aceitar um instrumento sem os dois concordarem — senão o
   * papel errado vai para a API de bolsa e volta "não encontrado", queimando
   * requisição e poluindo o relatório.
   */
  kind: InstrumentKind
  /** `{ coingecko: "bitcoin", brapi: "BBAS3" }` */
  externalIds: Record<string, string>
}

export interface QuoteResult {
  instrumentId: string
  /** String de propósito: o `Decimal` converte sem passar por `float`. */
  price: string
  currency: string
  asOf: Date
  /** Alguns providers devolvem o logo junto — aproveitar economiza chamada. */
  logoUrl?: string | null
}

export interface ProviderRun {
  provider: string
  quotes: QuoteResult[]
  /** Símbolos que o provider não soube responder. */
  missing: string[]
  /** Falha de rede, limite ou credencial. Não interrompe os outros providers. */
  error?: string
}

export interface PriceProvider {
  readonly name: string
  /** Se está utilizável agora — token presente, por exemplo. */
  isAvailable(): boolean
  supports(instrument: InstrumentRef): boolean
  /** Sempre em lote: um instrumento por requisição estoura qualquer rate limit. */
  fetchQuotes(instruments: InstrumentRef[]): Promise<ProviderRun>
}

/**
 * Converte o preço vindo da API para texto, ou devolve `null`.
 *
 * Existe porque checar `=== null` não basta: campo ausente vira `undefined`,
 * API instável devolve `NaN` ou string vazia, e `String(undefined)` produz o
 * texto `"undefined"` — que chega no `numeric` do Postgres e derruba a
 * gravação. Preço inválido tem que morrer aqui, não no banco.
 *
 * Zero também é recusado: ativo não vale zero: isso é dado faltando, e gravar
 * zeraria a posição no dashboard.
 */
export function toPriceString(value: unknown): string | null {
  const numero = typeof value === 'string' ? Number(value) : value

  if (typeof numero !== 'number' || !Number.isFinite(numero) || numero <= 0) {
    return null
  }

  return String(numero)
}

/**
 * Busca com prazo.
 *
 * Sem timeout, uma API lenta trava o job inteiro — e o job roda com o usuário
 * esperando quando ele aperta "Atualizar cotações". Melhor falhar em 8s e
 * seguir para o próximo provider do que pendurar a tela.
 */
export async function fetchJson<T>(
  url: string,
  options: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', ...options.headers },
      // Cotação nunca vem de cache do Next: o dado é o próprio motivo da chamada.
      cache: 'no-store',
    })

    if (!response.ok) {
      // O corpo do erro costuma dizer o que faltou — token inválido, ticker
      // inexistente, limite excedido. Sem ele, "HTTP 400" não ajuda ninguém.
      const detail = await response.text().catch(() => '')
      const resumo = detail.slice(0, 200).replace(/\s+/g, ' ').trim()

      throw new Error(
        `HTTP ${response.status} em ${new URL(url).host}${resumo ? ` — ${resumo}` : ''}`,
      )
    }

    return (await response.json()) as T
  } finally {
    clearTimeout(timer)
  }
}
