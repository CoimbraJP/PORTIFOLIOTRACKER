import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrapiProvider } from '../brapi'
import type { InstrumentRef } from '../types'

const PETR: InstrumentRef = {
  id: 'inst-petr',
  symbol: 'PETR4',
  classSlug: 'acoes-br',
  kind: 'STOCK',
  externalIds: {},
}

/** CDB arquivado por engano numa carteira de ações. */
const CDB_MAL_ARQUIVADO: InstrumentRef = {
  id: 'inst-cdb',
  symbol: 'CDB INTER 118% CDI',
  classSlug: 'acoes-br',
  kind: 'FIXED_INCOME',
  externalIds: {},
}

/** Resposta no formato v2: o preço mora em `results[].data`, não na raiz. */
function respostaV2(overrides: Record<string, unknown> = {}) {
  return {
    results: [
      {
        requestedSymbol: 'PETR4',
        symbol: 'PETR4',
        changed: false,
        data: {
          currency: 'BRL',
          regularMarketPrice: 38.5,
          regularMarketTime: '2026-07-31T17:08:00.000Z',
          logourl: 'https://icons.brapi.dev/icons/PETR4.svg',
          ...overrides,
        },
      },
    ],
  }
}

function respostaOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

function respostaErro(status: number) {
  return {
    ok: false,
    status,
    text: async () => '{"error":true,"message":"Erro inesperado do servidor"}',
  } as unknown as Response
}

describe('BrapiProvider', () => {
  beforeEach(() => {
    process.env.BRAPI_TOKEN = 'token-de-teste'
    process.env.BRAPI_MAX_PER_REQUEST = '1'
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    delete process.env.BRAPI_TOKEN
    delete process.env.BRAPI_MAX_PER_REQUEST
  })

  it('lê o preço dentro de `data`, não na raiz', async () => {
    // Este é o bug que gravou `undefined` numa coluna numeric: a v2 aninha os
    // dados de mercado e a raiz só carrega o ticker.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respostaOk(respostaV2())),
    )

    const run = await new BrapiProvider().fetchQuotes([PETR])

    expect(run.quotes).toHaveLength(1)
    expect(run.quotes[0]?.price).toBe('38.5')
    expect(run.quotes[0]?.currency).toBe('BRL')
    expect(run.quotes[0]?.logoUrl).toContain('PETR4')
    expect(run.missing).toEqual([])
  })

  it('casa pelo ticker pedido quando o papel foi renomeado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respostaOk({
          results: [
            {
              requestedSymbol: 'PETR4',
              symbol: 'PETR7',
              changed: true,
              data: { currency: 'BRL', regularMarketPrice: 12.3 },
            },
          ],
        }),
      ),
    )

    const run = await new BrapiProvider().fetchQuotes([PETR])

    expect(run.quotes[0]?.instrumentId).toBe('inst-petr')
    expect(run.missing).toEqual([])
  })

  it('não grava preço ausente: manda o ticker para `missing`', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respostaOk({ results: [{ requestedSymbol: 'PETR4', data: {} }] })),
    )

    const run = await new BrapiProvider().fetchQuotes([PETR])

    expect(run.quotes).toEqual([])
    expect(run.missing).toEqual(['PETR4'])
  })

  it('repete uma vez em erro 5xx e diz qual ticker falhou', async () => {
    const fetchMock = vi.fn(async () => respostaErro(500))
    vi.stubGlobal('fetch', fetchMock)

    const run = await new BrapiProvider().fetchQuotes([PETR])

    // Uma tentativa + uma retentativa. Erro do servidor deles costuma passar.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(run.error).toContain('PETR4')
    expect(run.missing).toEqual(['PETR4'])
  })

  it('não repete em erro 4xx: insistir só queima cota', async () => {
    const fetchMock = vi.fn(async () => respostaErro(400))
    vi.stubGlobal('fetch', fetchMock)

    await new BrapiProvider().fetchQuotes([PETR])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('recusa renda fixa mesmo em carteira de ações', () => {
    // A classe diz onde o ativo foi arquivado; o kind diz o que ele é. Quando
    // discordam, quem manda é o kind — senão o CDB vai para a API de bolsa.
    const provider = new BrapiProvider()

    expect(provider.supports(PETR)).toBe(true)
    expect(provider.supports(CDB_MAL_ARQUIVADO)).toBe(false)
  })

  it('sem token, se declara indisponível em vez de falhar', async () => {
    delete process.env.BRAPI_TOKEN
    const provider = new BrapiProvider()

    expect(provider.isAvailable()).toBe(false)

    const run = await provider.fetchQuotes([PETR])
    expect(run.error).toContain('BRAPI_TOKEN')
  })
})
