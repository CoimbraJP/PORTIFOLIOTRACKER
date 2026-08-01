import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchB3Catalog, fetchCryptoCatalog } from '../sources'

function respostaOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

afterEach(() => vi.unstubAllGlobals())

describe('catálogo da B3', () => {
  it('traduz o subtipo da B3 para a classe do produto', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respostaOk({
          results: [
            { symbol: 'PETR4', name: 'Petrobras', subType: 'stock', isActive: true },
            { symbol: 'TAEE11', name: 'Taesa', subType: 'unit', isActive: true },
            { symbol: 'HGLG11', name: 'CSHG', subType: 'fii', isActive: true },
            { symbol: 'BOVA11', name: 'iShares', subType: 'etf', isActive: true },
            { symbol: 'AAPL34', name: 'Apple BDR', subType: 'bdr', isActive: true },
          ],
          pagination: { hasNextPage: false },
        }),
      ),
    )

    const entries = await fetchB3Catalog()
    const classePor = new Map(entries.map((e) => [e.symbol, e.classSlug]))

    expect(classePor.get('PETR4')).toBe('acoes-br')
    // Unit é ação com pacote de papéis; vai para a mesma classe.
    expect(classePor.get('TAEE11')).toBe('acoes-br')
    expect(classePor.get('HGLG11')).toBe('fiis')
    expect(classePor.get('BOVA11')).toBe('etfs')
    // BDR negocia na B3 em real, então é ativo brasileiro para quem declara.
    expect(classePor.get('AAPL34')).toBe('acoes-br')
  })

  it('descarta índice e papel inativo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respostaOk({
          results: [
            { symbol: '^BVSP', name: 'IBOVESPA', assetType: 'index', isActive: true },
            { symbol: 'XXXX3', name: 'Delistada', subType: 'stock', isActive: false },
            { symbol: 'VALE3', name: 'Vale', subType: 'stock', isActive: true },
          ],
          pagination: { hasNextPage: false },
        }),
      ),
    )

    const entries = await fetchB3Catalog()

    // Sugerir um índice como ativo comprável seria pior do que não sugerir.
    expect(entries.map((e) => e.symbol)).toEqual(['VALE3'])
  })

  it('o rank preserva a ordem por volume que a fonte devolveu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respostaOk({
          results: [
            { symbol: 'BBAS3', name: 'Banco do Brasil', subType: 'stock', isActive: true },
            { symbol: 'BAHI3', name: 'Bahema', subType: 'stock', isActive: true },
          ],
          pagination: { hasNextPage: false },
        }),
      ),
    )

    const entries = await fetchB3Catalog()

    // Quem digita "BA" espera o papel mais negociado primeiro, não o alfabético.
    expect(entries[0]?.symbol).toBe('BBAS3')
    expect(entries[0]?.rank).toBeLessThan(entries[1]!.rank)
  })
})

describe('catálogo de cripto', () => {
  it('guarda o id da CoinGecko junto do símbolo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respostaOk([
          { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', image: 'https://x/btc.png' },
          { id: 'ondo-finance', symbol: 'ondo', name: 'Ondo', image: null },
        ]),
      ),
    )

    const entries = await fetchCryptoCatalog()

    // Sem o id, a cotação viria da moeda errada: ticker de cripto colide.
    expect(entries[0]?.externalIds).toEqual({ coingecko: 'bitcoin' })
    expect(entries[0]?.symbol).toBe('BTC')
    expect(entries[1]?.externalIds.coingecko).toBe('ondo-finance')
  })
})
