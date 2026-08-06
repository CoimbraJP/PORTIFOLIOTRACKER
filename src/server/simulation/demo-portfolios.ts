import type { AssetClassSlug } from '@/core/types/portfolio'

/**
 * Carteiras de demonstração.
 *
 * Existem para mostrar o sistema cheio a quem nunca cadastrou nada. Uma tela
 * vazia não demonstra consolidação, alocação por classe nem histórico — e
 * pedir para o visitante digitar trinta lançamentos antes de ver qualquer
 * coisa é perder a pessoa na primeira tela.
 *
 * Os valores são plausíveis, não reais: tickers e preços de mercado existem,
 * mas as quantidades foram escolhidas para compor um patrimônio de ~R$ 2,5
 * milhões em cada perfil. Ninguém tem exatamente esta carteira.
 *
 * ## Por que dois perfis
 *
 * O produto trata classes muito diferentes com a mesma mecânica, e isso só
 * aparece quando há contraste. O perfil **Brasil** concentra renda variável e
 * renda fixa locais, com imóvel — tudo em reais, dividendo e JCP. O perfil
 * **US** é dólar do começo ao fim: ações, ETFs e cripto, onde a conversão
 * cambial passa a governar o número exibido. Ver os dois lado a lado mostra o
 * que a moeda de exibição faz com o patrimônio.
 */

export interface PosicaoDemo {
  symbol: string
  name: string
  quantity: string
  /** Preço médio de aquisição, na moeda de entrada. */
  unitCost: string
  /**
   * Valor unitário atual, na moeda de entrada.
   *
   * Só é usado nas classes sem cotação de mercado (imóvel, renda fixa): ali o
   * valor é uma avaliação do dono. Nas classes cotadas, a sincronização traz o
   * preço real e este campo fica de fora.
   */
  unitValue?: string
  /** Data da compra, `YYYY-MM-DD`. */
  occurredAt: string
}

export interface CarteiraDemo {
  classSlug: AssetClassSlug
  /** Nome da carteira: corretora, cidade, instituição — depende da classe. */
  wallet: string
  /** Moeda em que os valores acima foram digitados. */
  currency: 'BRL' | 'USD'
  /** Câmbio da data da compra. Obrigatório quando a entrada é em dólar. */
  fxRate?: string
  posicoes: PosicaoDemo[]
}

export interface PerfilDemo {
  /** Identificador do perfil, usado no usuário e na carteira. */
  slug: 'br' | 'us'
  /** Nome que aparece na interface. */
  nome: string
  descricao: string
  /**
   * Moeda base do tenant — governa todo o cálculo consolidado.
   *
   * Real nos DOIS perfis, inclusive no global. O investidor brasileiro que tem
   * carteira lá fora continua medindo patrimônio em reais; ver o total em
   * dólar é uma escolha de leitura, e ela está a um clique em Configurações.
   * Fixar USD aqui trocaria o número de manchete por um que não responde a
   * pergunta que a pessoa faz ao abrir o app.
   */
  baseCurrency: 'BRL' | 'USD'
  carteiras: CarteiraDemo[]
}

/**
 * Câmbio usado nas compras em dólar do perfil US.
 *
 * Fixo de propósito: a compra aconteceu numa data, e o custo em reais fica
 * congelado naquela taxa para sempre. É o que a Receita considera e o que
 * descreve quanto o patrimônio realmente cresceu.
 */
const USD_BRL = '5.40'

export const PERFIS_DEMO: PerfilDemo[] = [
  {
    slug: 'br',
    nome: 'Investidor Brasil',
    descricao: 'Ações, FIIs, renda fixa e imóvel — tudo em reais.',
    baseCurrency: 'BRL',
    carteiras: [
      {
        classSlug: 'acoes-br',
        wallet: 'XP Investimentos',
        currency: 'BRL',
        posicoes: [
          { symbol: 'ITSA4', name: 'Itaúsa', quantity: '15000', unitCost: '9.85', occurredAt: '2021-03-15' },
          { symbol: 'BBAS3', name: 'Banco do Brasil', quantity: '9000', unitCost: '16.40', occurredAt: '2021-06-10' },
          { symbol: 'BBSE3', name: 'BB Seguridade', quantity: '3500', unitCost: '27.30', occurredAt: '2022-02-18' },
          { symbol: 'WEGE3', name: 'WEG', quantity: '3000', unitCost: '35.60', occurredAt: '2022-08-05' },
          { symbol: 'TAEE11', name: 'Taesa', quantity: '2200', unitCost: '34.20', occurredAt: '2021-11-22' },
          { symbol: 'EGIE3', name: 'Engie Brasil', quantity: '2200', unitCost: '38.90', occurredAt: '2022-05-12' },
          { symbol: 'VIVT3', name: 'Telefônica Brasil', quantity: '2000', unitCost: '24.10', occurredAt: '2023-01-20' },
          { symbol: 'KLBN11', name: 'Klabin', quantity: '3000', unitCost: '19.75', occurredAt: '2022-11-08' },
          { symbol: 'ALUP11', name: 'Alupar', quantity: '1800', unitCost: '25.60', occurredAt: '2023-04-14' },
        ],
      },
      {
        classSlug: 'fiis',
        wallet: 'XP Investimentos',
        currency: 'BRL',
        posicoes: [
          { symbol: 'MXRF11', name: 'Maxi Renda', quantity: '22000', unitCost: '9.90', occurredAt: '2021-09-03' },
          { symbol: 'KNRI11', name: 'Kinea Renda Imobiliária', quantity: '900', unitCost: '142.50', occurredAt: '2022-03-25' },
          { symbol: 'HGLG11', name: 'CSHG Logística', quantity: '500', unitCost: '151.20', occurredAt: '2022-07-19' },
        ],
      },
      {
        classSlug: 'renda-fixa',
        wallet: 'Banco Inter',
        currency: 'BRL',
        posicoes: [
          {
            symbol: 'CDB-INTER-2027',
            name: 'CDB Inter 118% CDI',
            quantity: '1',
            unitCost: '220000',
            unitValue: '265000',
            occurredAt: '2023-02-01',
          },
          {
            symbol: 'TESOURO-IPCA-2035',
            name: 'Tesouro IPCA+ 2035',
            quantity: '1',
            unitCost: '110000',
            unitValue: '140000',
            occurredAt: '2022-06-15',
          },
        ],
      },
      {
        classSlug: 'imoveis',
        wallet: 'São Paulo',
        currency: 'BRL',
        posicoes: [
          {
            symbol: 'APTO-PINHEIROS',
            name: 'Apartamento 84m², Pinheiros',
            quantity: '1',
            unitCost: '520000',
            unitValue: '650000',
            occurredAt: '2020-10-08',
          },
        ],
      },
    ],
  },
  {
    slug: 'us',
    nome: 'Investidor Global',
    descricao: 'Ações e ETFs americanos, com cripto — comprados em dólar.',
    baseCurrency: 'BRL',
    carteiras: [
      {
        classSlug: 'stocks',
        wallet: 'Avenue',
        currency: 'USD',
        fxRate: USD_BRL,
        posicoes: [
          { symbol: 'MSFT', name: 'Microsoft', quantity: '150', unitCost: '338.00', occurredAt: '2022-09-14' },
          { symbol: 'AAPL', name: 'Apple', quantity: '250', unitCost: '168.40', occurredAt: '2022-04-06' },
          { symbol: 'NVDA', name: 'NVIDIA', quantity: '300', unitCost: '96.20', occurredAt: '2023-05-24' },
          { symbol: 'META', name: 'Meta Platforms', quantity: '70', unitCost: '312.50', occurredAt: '2023-02-09' },
          { symbol: 'BRK.B', name: 'Berkshire Hathaway', quantity: '90', unitCost: '355.00', occurredAt: '2023-08-17' },
          { symbol: 'GOOGL', name: 'Alphabet', quantity: '200', unitCost: '138.70', occurredAt: '2023-10-11' },
          { symbol: 'DIS', name: 'Walt Disney', quantity: '150', unitCost: '96.30', occurredAt: '2024-01-23' },
        ],
      },
      {
        classSlug: 'etfs-int',
        wallet: 'Interactive Brokers',
        currency: 'USD',
        fxRate: USD_BRL,
        posicoes: [
          { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', quantity: '130', unitCost: '412.80', occurredAt: '2022-12-05' },
          { symbol: 'QQQ', name: 'Invesco QQQ Trust', quantity: '55', unitCost: '368.40', occurredAt: '2023-03-28' },
        ],
      },
      {
        classSlug: 'cripto',
        wallet: 'Ledger',
        currency: 'USD',
        fxRate: USD_BRL,
        posicoes: [
          { symbol: 'BTC', name: 'Bitcoin', quantity: '0.30', unitCost: '41200.00', occurredAt: '2023-07-11' },
          { symbol: 'ETH', name: 'Ethereum', quantity: '3', unitCost: '2180.00', occurredAt: '2023-09-19' },
        ],
      },
    ],
  },
]

export function perfilDemo(slug: 'br' | 'us'): PerfilDemo {
  const perfil = PERFIS_DEMO.find((p) => p.slug === slug)
  if (!perfil) throw new Error(`Perfil de demonstração desconhecido: ${slug}`)
  return perfil
}
