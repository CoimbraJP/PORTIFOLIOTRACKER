import type { AssetClassSlug } from '@/core/types/portfolio'

/**
 * Contrato de sincronização de logos — implementado na Fase 4.
 *
 * DECISÃO: o logo é atributo do INSTRUMENTO, não da posição, e vive no catálogo
 * global. Uma busca serve todos os tenants, exatamente como a cotação. Ele é
 * resolvido uma vez, no job de sincronização, e gravado em `instrument.logo_url`.
 *
 * O que NÃO fazer, e o motivo:
 *
 * 1. Buscar logo no browser, a cada render. Vira dezenas de requisições por
 *    tela, estoura rate limit e atrasa a pintura da tabela.
 * 2. Montar a URL por convenção a partir do ticker. Os CDNs usam IDs internos
 *    (o Bitcoin é `/coins/images/1/...` no CoinGecko, não `/bitcoin`), então
 *    adivinhar o caminho produz imagem quebrada silenciosa.
 * 3. Redesenhar a marca como SVG no projeto. Logo de empresa é marca
 *    registrada; recriar Apple, Vale ou Petrobras à mão é problema jurídico,
 *    não atalho de design.
 */
export interface LogoResolution {
  symbol: string
  logoUrl: string | null
  provider: string
}

export interface LogoProvider {
  readonly name: string
  supports(classSlug: AssetClassSlug): boolean
  resolve(symbols: string[]): Promise<LogoResolution[]>
}

/**
 * De onde cada classe tira o logo.
 *
 * Classes com `null` não têm marca para buscar — o `AssetAvatar` cai no
 * monograma, que ali é a aparência definitiva e não um estado degradado.
 */
export const LOGO_SOURCE: Record<AssetClassSlug, string | null> = {
  // CoinGecko: campo `image.large` de /coins/markets, casado por `coingecko_id`
  // guardado em `instrument.external_ids`.
  cripto: 'coingecko',

  // BRAPI: campo `logourl` de /quote/{ticker}.
  'acoes-br': 'brapi',
  fiis: 'brapi',
  etfs: 'brapi',

  // Provider internacional (definir na Fase 4 junto com a fonte de cotação).
  stocks: 'international',
  'etfs-int': 'international',

  // Sem marca: o monograma é o visual final.
  'renda-fixa': null,
  imoveis: null,
  emprestimos: null,
  alternativos: null,
  empresas: null,
  outros: null,
}

/**
 * TTL do logo. Marca muda de tempos em tempos, mas não toda semana — revalidar
 * junto com a cotação seria desperdício de chamada.
 */
export const LOGO_TTL_DAYS = 30
