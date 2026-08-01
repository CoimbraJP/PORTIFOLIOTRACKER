import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TwelveDataProvider } from '../twelve-data'
import type { InstrumentRef } from '../types'

function acao(symbol: string, id = `inst-${symbol}`): InstrumentRef {
  return { id, symbol, classSlug: 'stocks', kind: 'STOCK', externalIds: {} }
}

function respostaOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

describe('TwelveDataProvider', () => {
  beforeEach(() => {
    process.env.TWELVEDATA_API_KEY = 'chave-de-teste'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.TWELVEDATA_API_KEY
    delete process.env.TWELVEDATA_MAX_PER_REQUEST
  })

  it('lê a resposta em lote, indexada por ticker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respostaOk({
          AAPL: { symbol: 'AAPL', currency: 'USD', close: '182.50', timestamp: 1_770_000_000 },
          MSFT: { symbol: 'MSFT', currency: 'USD', close: '410.10', timestamp: 1_770_000_000 },
        }),
      ),
    )

    const run = await new TwelveDataProvider().fetchQuotes([acao('AAPL'), acao('MSFT')])

    expect(run.quotes).toHaveLength(2)
    expect(run.quotes.map((q) => q.price).sort()).toEqual(['182.5', '410.1'])
    expect(run.missing).toEqual([])
  })

  it('lê a resposta solta de um símbolo só', async () => {
    // A API muda de formato quando há um único ticker. Tratar só o caso do
    // lote quebraria exatamente quem tem um ativo internacional.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respostaOk({ symbol: 'AAPL', currency: 'USD', close: '182.50' })),
    )

    const run = await new TwelveDataProvider().fetchQuotes([acao('AAPL')])

    expect(run.quotes).toHaveLength(1)
    expect(run.quotes[0]?.price).toBe('182.5')
  })

  it('grava a cotação em USD, não em BRL', async () => {
    // Marcar como BRL faria uma ação de US$ 182 entrar no patrimônio valendo
    // R$ 182 — um erro silencioso de mais de cinco vezes.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respostaOk({ symbol: 'AAPL', currency: 'USD', close: '182.50' })),
    )

    const run = await new TwelveDataProvider().fetchQuotes([acao('AAPL')])

    expect(run.quotes[0]?.currency).toBe('USD')
  })

  it('isola o símbolo que falhou dentro do lote', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respostaOk({
          AAPL: { symbol: 'AAPL', currency: 'USD', close: '182.50' },
          XXXX: { status: 'error', message: 'symbol not found' },
        }),
      ),
    )

    const run = await new TwelveDataProvider().fetchQuotes([acao('AAPL'), acao('XXXX')])

    expect(run.quotes).toHaveLength(1)
    expect(run.missing).toEqual(['XXXX'])
    expect(run.error).toContain('XXXX')
  })

  it('trata erro global com HTTP 200 e status error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respostaOk({ code: 429, status: 'error', message: 'limite de créditos atingido' }),
      ),
    )

    const run = await new TwelveDataProvider().fetchQuotes([acao('AAPL')])

    expect(run.quotes).toEqual([])
    expect(run.error).toContain('créditos')
  })

  it('só aceita stocks e ETFs internacionais', () => {
    const provider = new TwelveDataProvider()

    expect(provider.supports(acao('AAPL'))).toBe(true)
    expect(
      provider.supports({ ...acao('PETR4'), classSlug: 'acoes-br' }),
      'B3 é da BRAPI',
    ).toBe(false)
    expect(
      provider.supports({ ...acao('CDB'), kind: 'FIXED_INCOME' }),
      'renda fixa não é cotada',
    ).toBe(false)
  })

  it('sem chave, se declara indisponível em vez de falhar', async () => {
    delete process.env.TWELVEDATA_API_KEY
    const provider = new TwelveDataProvider()

    expect(provider.isAvailable()).toBe(false)
    const run = await provider.fetchQuotes([acao('AAPL')])
    expect(run.error).toContain('TWELVEDATA_API_KEY')
  })
})
