import 'server-only'

import {
  detectNumberFormat,
  guessMapping,
  mapRows,
  parseCsv,
  diagnosticar,
  type ColumnMap,
  type ImportedRow,
} from '@/core/import'

import { assetClass as assetClassConfig } from '@/config/asset-classes'
import type { AssetClassSlug } from '@/core/types/portfolio'
import { fetchFxHistory, preencherLacunas } from '@/integrations/fx/history'
import { buildClassLookup } from './class-lookup'
import type { ImportInput } from '@/server/validation/import'

export interface Prepared {
  rows: ImportedRow[]
  mapping: ColumnMap
  headers: string[]
  delimiter: string
  formato: 'br' | 'us'
  /** Impedimento do arquivo INTEIRO. Quando vem preenchido, nada é importado. */
  bloqueio?: string
}

/**
 * Lê o arquivo e devolve o que ele diz — sem gravar nada.
 *
 * É o mesmo caminho que a pré-visualização e a gravação usam, e isso é
 * proposital: se a tela mostrasse um resultado e a gravação calculasse outro, a
 * conferência que o usuário faz antes de confirmar não valeria nada.
 */
export async function prepararImportacao(input: ImportInput): Promise<Prepared> {
  const tabela = parseCsv(input.csv)
  const mapping = guessMapping(tabela.headers)
  const formato = detectNumberFormat(tabela.rows.flat())

  const base: Prepared = {
    rows: [],
    mapping,
    headers: tabela.headers,
    delimiter: tabela.delimiter,
    formato,
  }

  const impedimento = diagnosticar(tabela.headers, mapping)
  if (impedimento) return { ...base, bloqueio: impedimento }

  const slug = input.classSlug as AssetClassSlug
  const definition = assetClassConfig(slug)
  const classes = buildClassLookup()

  const defaults = {
    classSlug: slug,
    wallet: input.wallet,
    currency: input.currency,
  }

  // Primeira passada: descobre as datas. Sem ela não há como saber de quais
  // dias buscar o câmbio, porque a data só existe depois de interpretada.
  const primeira = mapRows(tabela.rows, mapping, classes, defaults, formato)

  const precisaCambio = primeira.filter((r) => r.currency === 'USD' && !r.erro?.includes('câmbio'))
  const temUsd = primeira.some((r) => r.currency === 'USD')

  if (temUsd && !definition.foreignEntry) {
    return {
      ...base,
      rows: primeira,
      bloqueio: `${definition.name} não aceita lançamento em dólar.`,
    }
  }

  if (!temUsd) return { ...base, rows: primeira }

  const rates = await buscarCambio([...precisaCambio, ...primeira].map((r) => r.date))

  // Segunda passada, agora com o câmbio de cada dia em mãos.
  return { ...base, rows: mapRows(tabela.rows, mapping, classes, { ...defaults, rates }, formato) }
}

/**
 * Câmbio de todas as datas do arquivo.
 *
 * Uma chamada cobrindo o intervalo inteiro, não uma por linha: um arquivo de
 * dez anos viraria mil requisições, e a API cortaria muito antes disso.
 *
 * Falha de rede devolve vazio em vez de estourar. A consequência é a linha em
 * dólar parar com "sem câmbio", que é exatamente o que deve acontecer — o
 * contrário seria importar custo convertido por uma taxa inventada.
 */
async function buscarCambio(datas: string[]): Promise<Record<string, string>> {
  const validas = datas.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  const inicio = validas[0]
  const fim = validas[validas.length - 1]

  if (!inicio || !fim) return {}

  try {
    // Recua um pouco o início: negócio de segunda-feira precisa da sexta
    // anterior quando o dia não teve pregão.
    const desde = new Date(`${inicio}T12:00:00Z`)
    desde.setUTCDate(desde.getUTCDate() - 7)

    const bruto = await fetchFxHistory(desde.toISOString().slice(0, 10), fim)
    return preencherLacunas(bruto, validas)
  } catch {
    return {}
  }
}
