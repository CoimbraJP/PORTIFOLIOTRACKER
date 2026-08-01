import { money, type Money } from '../money/decimal'
import type { LedgerEntry, TransactionType } from '../ledger/types'

/** Provento anunciado por um emissor. Um por evento, não por investidor. */
export interface CorporateActionInput {
  id: string
  type: 'DIVIDEND' | 'JCP' | 'INCOME'
  /**
   * Data-com: o último dia em que ter o ativo dá direito ao provento.
   *
   * Quem tinha no fechamento deste dia recebe, mesmo que venda tudo no dia
   * seguinte. Quem comprou depois não recebe, mesmo que ainda tenha na data do
   * pagamento. É a regra inteira do direito a provento.
   */
  exDate: Date
  /** Quando o dinheiro cai. Nulo em provento anunciado e ainda não pago. */
  paymentDate: Date | null
  /** Valor bruto por cota. */
  valuePerShare: Money
  currency: string
}

export interface MatchedIncome {
  corporateActionId: string
  type: TransactionType
  /** Quando o dinheiro entrou — é a data do FATO no ledger. */
  occurredAt: Date
  /** Quantidade que tinha direito, apurada na data-com. */
  quantity: Money
  valuePerShare: Money
  gross: Money
  /** Imposto retido na fonte. Zero fora do JCP. */
  taxes: Money
  /** O que efetivamente entrou na conta. */
  net: Money
  currency: string
}

/**
 * Alíquota de IR retida na fonte sobre JCP.
 *
 * Dividendo de ação e rendimento de FII são isentos para pessoa física; JCP não
 * é — a empresa retém 15% antes de pagar. Registrar o bruto inflaria a renda
 * passiva em 15% sobre uma parcela que nunca chegou na conta.
 */
const JCP_TAX_RATE = money('0.15')

/** Tipos que geram quantidade. `SELL` e `TRANSFER_OUT` reduzem. */
const AUMENTA = new Set<TransactionType>(['BUY', 'TRANSFER_IN', 'BONUS'])
const DIMINUI = new Set<TransactionType>(['SELL', 'TRANSFER_OUT'])

/**
 * Quanto a posição tinha no fim de um dia.
 *
 * Reconstruído do ledger, não lido da posição atual: a posição de hoje não diz
 * nada sobre quantas ações existiam há dois anos, e é isso que decide o direito
 * ao provento.
 *
 * O limite é o FIM da data-com. Uma compra feita no próprio dia da data-com dá
 * direito — por isso a comparação inclui o dia inteiro, não o instante.
 */
export function quantityOn(entries: LedgerEntry[], date: Date): Money {
  const limite = endOfDay(date)
  let quantidade = money(0)

  for (const entry of entries) {
    if (entry.occurredAt > limite) continue

    if (AUMENTA.has(entry.type)) quantidade = quantidade.plus(entry.quantity)
    else if (DIMINUI.has(entry.type)) quantidade = quantidade.minus(entry.quantity)
    else if (entry.type === 'SPLIT' && entry.ratio) quantidade = quantidade.times(entry.ratio)
    else if (entry.type === 'REVERSE_SPLIT' && entry.ratio)
      quantidade = quantidade.dividedBy(entry.ratio)
  }

  return quantidade
}

/**
 * Cruza os proventos do instrumento com o histórico de uma posição.
 *
 * Devolve só o que aquela posição tem direito a receber, com a quantidade
 * apurada na data-com de cada evento. Função pura: nada aqui grava, busca ou
 * conhece banco — o que permite testar a regra que mais importa do produto sem
 * subir infraestrutura.
 */
export function matchCorporateActions(
  entries: LedgerEntry[],
  actions: CorporateActionInput[],
): MatchedIncome[] {
  // Ordem cronológica é premissa de `quantityOn`, e o chamador pode não ter
  // garantido. Ordenar aqui custa pouco e evita um erro difícil de enxergar.
  const ordenados = [...entries].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())

  const resultado: MatchedIncome[] = []

  for (const action of actions) {
    const quantidade = quantityOn(ordenados, action.exDate)

    // Sem posição na data-com não há direito. Quantidade negativa não deveria
    // existir, mas se existir é dado inconsistente e gerar "renda negativa"
    // seria pior do que ignorar.
    if (quantidade.lessThanOrEqualTo(0)) continue

    const gross = quantidade.times(action.valuePerShare)
    if (gross.lessThanOrEqualTo(0)) continue

    const taxes = action.type === 'JCP' ? gross.times(JCP_TAX_RATE) : money(0)

    resultado.push({
      corporateActionId: action.id,
      type: action.type,
      // Sem data de pagamento, a data-com serve de âncora: o provento existe e
      // precisa aparecer em algum mês. Quando o pagamento for anunciado, a
      // sincronização corrige.
      occurredAt: action.paymentDate ?? action.exDate,
      quantity: quantidade,
      valuePerShare: action.valuePerShare,
      gross,
      taxes,
      net: gross.minus(taxes),
      currency: action.currency,
    })
  }

  return resultado
}

/**
 * Chave que identifica um provento de forma estável.
 *
 * É o que torna a geração idempotente: rodar a sincronização dez vezes produz a
 * mesma chave dez vezes, e o banco recusa a partir da segunda. Deriva de
 * posição e evento, nunca de data de execução ou de valor — se o provedor
 * corrigir o valor anunciado, tem que ser o MESMO lançamento atualizado, não um
 * segundo lançamento somando por cima.
 */
export function incomeIdempotencyKey(positionId: string, corporateActionId: string): string {
  return `ca:${positionId}:${corporateActionId}`
}

function endOfDay(date: Date): Date {
  const fim = new Date(date)
  fim.setUTCHours(23, 59, 59, 999)
  return fim
}
