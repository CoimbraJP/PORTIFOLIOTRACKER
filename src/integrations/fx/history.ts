import { fetchJson } from '../providers/types'

const DAILY = 'https://economia.awesomeapi.com.br/json/daily/USD-BRL'

interface DailyPair {
  bid?: string
  timestamp?: string
}

/** Câmbio de cada data, em texto. Chave `YYYY-MM-DD`. */
export type RatesByDate = Record<string, string>

/** A API recusa janelas muito largas; 360 dias é o limite seguro por chamada. */
const JANELA_MAXIMA_DIAS = 360

/** Sem isto, importar dez anos de histórico viraria trinta chamadas em fila. */
const MAX_JANELAS = 12

function aaaammdd(iso: string): string {
  return iso.replace(/-/g, '')
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function diasEntre(inicio: string, fim: string): number {
  const ms = new Date(`${fim}T12:00:00Z`).getTime() - new Date(`${inicio}T12:00:00Z`).getTime()
  return Math.round(ms / 86_400_000)
}

/**
 * Busca o câmbio USD/BRL de um intervalo de datas passadas.
 *
 * Existe para a importação. Um bitcoin comprado em março de 2024 custou o dólar
 * de março de 2024 — converter pelo dólar de hoje reescreveria o custo de
 * aquisição e, com ele, todo o lucro que o sistema exibe. É um erro que não
 * aparece em lugar nenhum: o número fica plausível e simplesmente errado.
 *
 * Usa o `bid` pelo mesmo motivo que `fetchFxRates`: é a cotação de venda do
 * dólar, e é ela que diz quanto aquele dólar valia em reais.
 */
export async function fetchFxHistory(inicio: string, fim: string): Promise<RatesByDate> {
  if (diasEntre(inicio, fim) < 0) return {}

  const rates: RatesByDate = {}
  let janelas = 0
  let cursor = inicio

  while (diasEntre(cursor, fim) >= 0 && janelas < MAX_JANELAS) {
    const proximo = somarDias(cursor, JANELA_MAXIMA_DIAS)
    const ate = diasEntre(proximo, fim) < 0 ? proximo : fim

    const url = `${DAILY}/?start_date=${aaaammdd(cursor)}&end_date=${aaaammdd(ate)}`
    const dados = await fetchJson<DailyPair[]>(url)

    for (const item of Array.isArray(dados) ? dados : []) {
      if (!item?.bid || !item.timestamp) continue

      const data = new Date(Number(item.timestamp) * 1000).toISOString().slice(0, 10)
      rates[data] = item.bid
    }

    cursor = somarDias(ate, 1)
    janelas += 1
  }

  return rates
}

/**
 * Completa fim de semana e feriado com o último pregão anterior.
 *
 * Não há câmbio de sábado porque não há mercado no sábado. Uma compra marcada
 * no sábado liquidou pela taxa de sexta — usar a de segunda seria antecipar
 * informação que ainda não existia na data do negócio.
 *
 * Preenche no máximo `limite` dias para trás. Data anterior ao início da série
 * fica de fora de propósito: é melhor a linha parar e o usuário informar a taxa
 * do que herdar em silêncio o câmbio de um ano qualquer.
 */
export function preencherLacunas(
  rates: RatesByDate,
  datas: Iterable<string>,
  limite = 5,
): RatesByDate {
  const completo: RatesByDate = { ...rates }

  for (const data of datas) {
    if (completo[data]) continue

    for (let recuo = 1; recuo <= limite; recuo += 1) {
      const anterior = rates[somarDias(data, -recuo)]
      if (anterior) {
        completo[data] = anterior
        break
      }
    }
  }

  return completo
}
