import 'server-only'

import {
  detectHeaderCurrency,
  detectNumberFormat,
  diagnosticar,
  guessMapping,
  mapRows,
  parseCsv,
  sugerirCorrecoes,
  type ColumnMap,
  type ImportedRow,
} from '@/core/import'
import { fetchSpotPrices } from '@/integrations/providers/coingecko'
import { assetClass as assetClassConfig } from '@/config/asset-classes'
import type { AssetClassSlug } from '@/core/types/portfolio'
import { fetchFxHistory, preencherLacunas } from '@/integrations/fx/history'
import { buildClassLookup } from './class-lookup'
import type { ArquivoInput, ImportInput } from '@/server/validation/import'

export interface PreparedFile {
  nome: string
  /**
   * A moeda que o ARQUIVO declara no cabeçalho, quando declara.
   *
   * Vence a escolha da tela. Ver `detectHeaderCurrency`.
   */
  moedaDoArquivo?: 'BRL' | 'USD'
  rows: ImportedRow[]
  mapping: ColumnMap
  headers: string[]
  delimiter: string
  /** Impedimento deste arquivo. Quando vem preenchido, ele inteiro fica de fora. */
  bloqueio?: string
}

export interface Prepared {
  arquivos: PreparedFile[]
  /** Como foi a busca de câmbio. Ausente quando não havia preço em dólar. */
  fx?: FxInfo
}

export interface FxInfo {
  fonte: 'bcb' | 'awesomeapi' | null
  /** Quantas datas ficaram sem cotação. */
  faltando: number
  erro?: string
}

/**
 * Lê os arquivos e devolve o que eles dizem — sem gravar nada.
 *
 * É o mesmo caminho que a pré-visualização e a gravação usam, e isso é
 * proposital: se a tela mostrasse um resultado e a gravação calculasse outro, a
 * conferência que o usuário faz antes de confirmar não valeria nada.
 *
 * Um arquivo bloqueado não derruba os outros. Quem sobe quatro extratos e tem
 * um deles no formato errado quer importar os três que estão certos.
 */
export async function prepararImportacao(input: ImportInput): Promise<Prepared> {
  const slug = input.classSlug as AssetClassSlug
  const lidos = input.arquivos.map((arquivo) => lerArquivo(arquivo, slug, input.currency))

  // Câmbio de UMA vez para a leva inteira: quatro arquivos do mesmo período
  // pediriam quatro vezes o mesmo intervalo à mesma API.
  const datas = lidos.flatMap((r) => (r.precisaCambio ? r.prep.rows.map((l) => l.date) : []))
  if (datas.length === 0) return { arquivos: await propor(lidos.map((r) => r.prep)) }

  const cambio = await buscarCambio(datas)
  const classes = buildClassLookup()

  const arquivos = lidos.map(({ prep, arquivo, precisaCambio, formato }) => {
    if (!precisaCambio || prep.bloqueio) return prep

    const rows = mapRows(
      parseCsv(arquivo.csv).rows,
      prep.mapping,
      classes,
      {
        classSlug: slug,
        wallet: arquivo.wallet,
        currency: prep.moedaDoArquivo ?? input.currency,
        rates: cambio.rates,
        correcoes: numerarLinhas(arquivo.correcoes),
      },
      formato,
    )

    return { ...prep, rows }
  })

  return { arquivos: await propor(arquivos), fx: cambio }
}

/**
 * Anexa a sugestão de preço às linhas marcadas como absurdas.
 *
 * Busca a cotação de agora das criptos em que aquelas linhas foram denominadas
 * — é o divisor do defeito descrito em `suggest.ts`. Falha na busca some sem
 * barulho: sugestão é conveniência, e a linha continua marcada e editável.
 */
async function propor(arquivos: PreparedFile[]): Promise<PreparedFile[]> {
  const denominacoes = new Set(
    arquivos.flatMap((a) => a.rows.filter((r) => r.aviso && r.denominacao).map((r) => r.denominacao)),
  )

  if (denominacoes.size === 0) return arquivos

  // A âncora precisa estar na MESMA moeda do preço da linha, senão a divisão
  // troca o erro de multiplicação por um erro de câmbio.
  const emDolar = arquivos.some((a) => a.rows.some((r) => r.currency === 'USD'))

  try {
    const precos = await fetchSpotPrices([...denominacoes], emDolar ? 'usd' : 'brl')
    if (Object.keys(precos).length === 0) return arquivos

    return arquivos.map((a) => ({ ...a, rows: sugerirCorrecoes(a.rows, precos) }))
  } catch {
    return arquivos
  }
}

interface Leitura {
  arquivo: ArquivoInput
  prep: PreparedFile
  precisaCambio: boolean
  formato: 'br' | 'us'
}

/** Primeira passada: descobre estrutura, datas e se há preço em dólar. */
function lerArquivo(
  arquivo: ArquivoInput,
  slug: AssetClassSlug,
  currency: 'BRL' | 'USD' | undefined,
): Leitura {
  const tabela = parseCsv(arquivo.csv)
  const mapping = guessMapping(tabela.headers)
  const formato = detectNumberFormat(tabela.rows.flat())

  // O arquivo tem a última palavra sobre a própria moeda. Um CSV com
  // `Price (USD)` importado como Real gravaria todo o custo cinco vezes menor,
  // e o resultado é plausível demais para alguém notar.
  const doCabecalho = detectHeaderCurrency(tabela.headers)
  const moeda = doCabecalho ?? currency

  const base: PreparedFile = {
    nome: arquivo.nome,
    rows: [],
    mapping,
    headers: tabela.headers,
    delimiter: tabela.delimiter,
    ...(doCabecalho ? { moedaDoArquivo: doCabecalho } : {}),
  }

  const impedimento = diagnosticar(tabela.headers, mapping)
  if (impedimento) {
    return { arquivo, prep: { ...base, bloqueio: impedimento }, precisaCambio: false, formato }
  }

  const rows = mapRows(
    tabela.rows,
    mapping,
    buildClassLookup(),
    {
      classSlug: slug,
      wallet: arquivo.wallet,
      currency: moeda,
      correcoes: numerarLinhas(arquivo.correcoes),
    },
    formato,
  )

  const definition = assetClassConfig(slug)
  const temUsd = rows.some((r) => r.currency === 'USD')

  if (temUsd && !definition.foreignEntry) {
    return {
      arquivo,
      prep: { ...base, rows, bloqueio: `${definition.name} não aceita lançamento em dólar.` },
      precisaCambio: false,
      formato,
    }
  }

  return { arquivo, prep: { ...base, rows }, precisaCambio: temUsd, formato }
}

/**
 * O JSON traz a linha como texto; o motor trabalha com número.
 *
 * Conversão explícita, e não `as`: chave de objeto em JavaScript é sempre
 * string, e `Record<number, T>` é uma ficção do TypeScript que não sobrevive à
 * serialização.
 */
function numerarLinhas(
  correcoes: ArquivoInput['correcoes'],
): Record<number, { unitPrice?: string; quantity?: string }> | undefined {
  if (!correcoes) return undefined

  return Object.fromEntries(Object.entries(correcoes).map(([linha, v]) => [Number(linha), v]))
}

/**
 * Câmbio de todas as datas da leva.
 *
 * Uma chamada cobrindo o intervalo inteiro, não uma por linha: um arquivo de
 * dez anos viraria mil requisições, e a API cortaria muito antes disso.
 *
 * Falha não vira taxa inventada — a linha em dólar para, e é isso mesmo. Mas o
 * MOTIVO sobe junto: sem ele o usuário vê vinte linhas dizendo "sem câmbio" e
 * conclui que o arquivo dele está errado, quando quem caiu foi a fonte.
 */
async function buscarCambio(datas: string[]): Promise<FxInfo & { rates: Record<string, string> }> {
  const validas = datas.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  const inicio = validas[0]
  const fim = validas[validas.length - 1]

  if (!inicio || !fim) return { rates: {}, fonte: null, faltando: 0 }

  try {
    // Recua o início: negócio de segunda-feira precisa da sexta anterior
    // quando o dia não teve pregão, e feriadão chega a quatro dias.
    const desde = new Date(`${inicio}T12:00:00Z`)
    desde.setUTCDate(desde.getUTCDate() - 10)

    const resultado = await fetchFxHistory(desde.toISOString().slice(0, 10), fim)
    const rates = preencherLacunas(resultado.rates, validas)
    const faltando = new Set(validas.filter((d) => !rates[d])).size

    return { rates, fonte: resultado.fonte, faltando, ...(resultado.erro ? { erro: resultado.erro } : {}) }
  } catch (error) {
    // Nunca em silêncio: a importação inteira depende disto, e vinte linhas
    // dizendo "sem câmbio" não contam ao usuário que a fonte é que caiu.
    return {
      rates: {},
      fonte: null,
      faltando: new Set(validas).size,
      erro: error instanceof Error ? error.message : 'erro desconhecido',
    }
  }
}
