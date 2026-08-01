import { fetchJson } from '../providers/types'

/** Câmbio de cada data, em texto. Chave `YYYY-MM-DD`. */
export type RatesByDate = Record<string, string>

export interface FxHistory {
  rates: RatesByDate
  /** Quem respondeu. Aparece na tela: saber a origem do custo importa. */
  fonte: 'bcb' | 'awesomeapi' | null
  /** Por que não deu, quando não deu. Nunca fica em silêncio. */
  erro?: string
}

const BCB =
  'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@i,dataFinalCotacao=@f)'
const AWESOME = 'https://economia.awesomeapi.com.br/json/daily/USD-BRL'

interface BcbResposta {
  value?: { cotacaoCompra?: number; dataHoraCotacao?: string }[]
}

interface AwesomePar {
  bid?: string
  timestamp?: string
}

/**
 * Câmbio USD/BRL de um intervalo de datas passadas.
 *
 * Existe para a importação. Um bitcoin comprado em março de 2024 custou o dólar
 * de março de 2024 — converter pelo dólar de hoje reescreveria o custo de
 * aquisição e, com ele, todo o lucro que o sistema exibe. É um erro que não
 * aparece em lugar nenhum: o número fica plausível e simplesmente errado.
 *
 * O Banco Central vem primeiro. A PTAX é a taxa oficial, é a que a Receita usa
 * para converter bem no exterior, e a série vai até os anos 80 — a AwesomeAPI é
 * ótima para o câmbio de agora e rala para trás. Ela fica como reserva, para o
 * caso de o Olinda estar fora do ar.
 *
 * Falha das duas devolve o motivo escrito. Devolver vazio calado foi o que fez
 * uma importação inteira parar sem explicar por quê.
 */
export async function fetchFxHistory(inicio: string, fim: string): Promise<FxHistory> {
  if (diasEntre(inicio, fim) < 0) return { rates: {}, fonte: null }

  const motivos: string[] = []

  try {
    const rates = await doBancoCentral(inicio, fim)
    if (Object.keys(rates).length > 0) return { rates, fonte: 'bcb' }
    motivos.push('Banco Central não devolveu nenhuma cotação no período')
  } catch (error) {
    motivos.push(`Banco Central: ${mensagem(error)}`)
  }

  try {
    const rates = await daAwesomeApi(inicio, fim)
    if (Object.keys(rates).length > 0) return { rates, fonte: 'awesomeapi' }
    motivos.push('AwesomeAPI não devolveu nenhuma cotação no período')
  } catch (error) {
    motivos.push(`AwesomeAPI: ${mensagem(error)}`)
  }

  return { rates: {}, fonte: null, erro: motivos.join('. ') }
}

/**
 * PTAX do Banco Central, pelo Olinda.
 *
 * As datas vão em `MM-DD-AAAA` entre aspas simples — formato do OData, não do
 * Brasil. Inverter mês e dia aqui devolveria uma janela vazia sem erro nenhum.
 *
 * Usa `cotacaoCompra` pela mesma razão que o resto do sistema: é quanto se
 * receberia vendendo aquele dólar. A de venda inflaria o patrimônio pelo spread.
 */
async function doBancoCentral(inicio: string, fim: string): Promise<RatesByDate> {
  const url =
    `${BCB}?@i='${mmddaaaa(inicio)}'&@f='${mmddaaaa(fim)}'` +
    `&$top=10000&$format=json&$select=cotacaoCompra,dataHoraCotacao`

  const dados = await fetchJson<BcbResposta>(url, { timeoutMs: 15_000 })
  const rates: RatesByDate = {}

  for (const item of dados.value ?? []) {
    if (!item?.cotacaoCompra || !item.dataHoraCotacao) continue
    // `2024-03-12 13:03:24.096` — o dia é o que importa.
    rates[item.dataHoraCotacao.slice(0, 10)] = String(item.cotacaoCompra)
  }

  return rates
}

/**
 * AwesomeAPI, em janelas.
 *
 * A quantidade de dias vai NO CAMINHO, antes da query. Sem ela o endpoint
 * ignora o intervalo e devolve só a última cotação — o que não parece erro
 * nenhum: chega uma resposta válida, com uma data só, e todas as outras somem.
 */
async function daAwesomeApi(inicio: string, fim: string): Promise<RatesByDate> {
  const rates: RatesByDate = {}
  let cursor = inicio
  let janelas = 0

  while (diasEntre(cursor, fim) >= 0 && janelas < 12) {
    const proximo = somarDias(cursor, 360)
    const ate = diasEntre(proximo, fim) < 0 ? proximo : fim
    const dias = Math.min(diasEntre(cursor, ate) + 1, 360)

    const url = `${AWESOME}/${dias}?start_date=${aaaammdd(cursor)}&end_date=${aaaammdd(ate)}`
    const dados = await fetchJson<AwesomePar[]>(url)

    for (const item of Array.isArray(dados) ? dados : []) {
      if (!item?.bid || !item.timestamp) continue
      rates[new Date(Number(item.timestamp) * 1000).toISOString().slice(0, 10)] = item.bid
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
 * Preenche no máximo `limite` dias para trás. Feriadão de Carnaval chega a
 * quatro; além disso, é melhor a linha parar e o usuário informar a taxa do que
 * herdar em silêncio o câmbio de um mês qualquer.
 */
export function preencherLacunas(
  rates: RatesByDate,
  datas: Iterable<string>,
  limite = 6,
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

function aaaammdd(iso: string): string {
  return iso.replace(/-/g, '')
}

function mmddaaaa(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${mes}-${dia}-${ano}`
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

function mensagem(error: unknown): string {
  return error instanceof Error ? error.message : 'erro desconhecido'
}
