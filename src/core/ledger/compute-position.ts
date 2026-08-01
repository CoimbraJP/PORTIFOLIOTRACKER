import { divide, money, type Money } from '../money/decimal'
import type { PositionState } from '../types/portfolio'
import { INCOME_TYPES, type LedgerEntry } from './types'

/**
 * O motor de posição.
 *
 * Percorre o ledger em ordem cronológica e produz o estado derivado. Função
 * PURA: sem I/O, sem banco, sem data atual. É por isso que ela pode ser testada
 * em milissegundos e é por isso que o preço médio nunca vira um campo digitado.
 * Ver docs/00 §3.1 e CLAUDE.md §2.1.
 *
 * Metodologia: **custo médio ponderado**, o padrão brasileiro. Não é FIFO.
 *
 * Regras, e o motivo de cada uma:
 *
 * - `BUY`  — soma quantidade e custo. Taxas entram no custo, porque corretagem
 *   faz parte do que você pagou pelo ativo.
 * - `SELL` — realiza lucro contra o preço médio e reduz o custo na mesma
 *   proporção. O preço médio NÃO muda numa venda: vender não altera o que você
 *   pagou pelo que sobrou.
 * - `TRANSFER_IN` / `TRANSFER_OUT` — movem quantidade e custo proporcional
 *   entre posições. Nunca geram lucro. Sem isso, todo usuário de cripto veria
 *   lucro fantasma ao mandar BTC da exchange para a carteira fria.
 * - `SPLIT` / `REVERSE_SPLIT` — multiplicam a quantidade pela razão e dividem o
 *   preço médio. O custo total fica intacto: desdobramento não cria riqueza.
 * - `BONUS` — aumenta a quantidade sem aumentar o custo, então o preço médio
 *   cai. É o efeito correto de uma bonificação.
 * - Proventos — não tocam quantidade nem custo; acumulam em `incomeTotal`. IR
 *   retido no JCP é descontado, porque o que entrou na conta foi o líquido.
 * - `ACCRUAL` — juros provisionados de renda fixa e empréstimo. Aumentam o
 *   valor devido sem aporte novo, então entram como renda.
 */
export function computePosition(entries: readonly LedgerEntry[]): PositionState {
  const ordered = [...entries].sort((a, b) => {
    const diff = a.occurredAt.getTime() - b.occurredAt.getTime()
    // Empate no mesmo instante: ordem estável pelo id, para que o resultado
    // não dependa da ordem em que o banco devolveu as linhas.
    return diff !== 0 ? diff : a.id.localeCompare(b.id)
  })

  let quantity = money(0)
  let totalCost = money(0)
  let realizedPnl = money(0)
  let incomeTotal = money(0)

  for (const entry of ordered) {
    switch (entry.type) {
      case 'BUY': {
        quantity = quantity.plus(entry.quantity)
        totalCost = totalCost.plus(entry.quantity.times(entry.unitPrice)).plus(entry.fees)
        break
      }

      case 'SELL': {
        const avgPrice = divide(totalCost, quantity)
        const sold = min(entry.quantity, quantity)

        const proceeds = sold.times(entry.unitPrice).minus(entry.fees).minus(entry.taxes)
        const costOfSold = avgPrice.times(sold)

        realizedPnl = realizedPnl.plus(proceeds.minus(costOfSold))
        quantity = quantity.minus(sold)
        totalCost = totalCost.minus(costOfSold)
        break
      }

      case 'TRANSFER_IN': {
        quantity = quantity.plus(entry.quantity)
        // Sem custo informado, assume o preço unitário do lançamento.
        totalCost = totalCost.plus(entry.transferCost ?? entry.quantity.times(entry.unitPrice))
        break
      }

      case 'TRANSFER_OUT': {
        const avgPrice = divide(totalCost, quantity)
        const moved = min(entry.quantity, quantity)
        const cost = entry.transferCost ?? avgPrice.times(moved)

        quantity = quantity.minus(moved)
        totalCost = totalCost.minus(cost)
        break
      }

      case 'SPLIT':
      case 'REVERSE_SPLIT': {
        const ratio = entry.ratio
        if (ratio && !ratio.isZero()) {
          quantity = quantity.times(ratio)
          // totalCost intacto de propósito: o preço médio cai (ou sobe) sozinho
          // porque é derivado de custo ÷ quantidade.
        }
        break
      }

      case 'BONUS': {
        quantity = quantity.plus(entry.quantity)
        // Sem custo: ações bonificadas são recebidas de graça.
        break
      }

      case 'ACCRUAL': {
        incomeTotal = incomeTotal.plus(entry.netAmount)
        break
      }

      default: {
        if (INCOME_TYPES.has(entry.type)) {
          // `netAmount` é o que ENTROU na conta, imposto já descontado — é o
          // que o nome diz e o que a coluna `gross_amount` existe para
          // complementar. Subtrair `taxes` aqui descontaria o IR duas vezes.
          //
          // Quem grava é responsável por essa distinção: um JCP de R$ 300 com
          // 15% retidos entra como bruto 300, imposto 45 e líquido 255.
          incomeTotal = incomeTotal.plus(entry.netAmount)
        }
        break
      }
    }
  }

  // Posição zerada não deve carregar custo residual de arredondamento.
  if (quantity.isZero()) {
    totalCost = money(0)
  }

  return {
    quantity,
    avgPrice: divide(totalCost, quantity),
    totalCost,
    realizedPnl,
    incomeTotal,
  }
}

/**
 * Quantidade que a posição tinha numa data — a pergunta da data-com.
 *
 * É a razão de o ledger existir: sem histórico de transações, não há como saber
 * quantas ações o usuário detinha quando o dividendo foi anunciado, e o motor
 * de proventos automáticos seria impossível. Ver docs/01 §5.3.
 */
export function quantityAt(entries: readonly LedgerEntry[], date: Date): Money {
  const upTo = entries.filter((e) => e.occurredAt.getTime() <= date.getTime())
  return computePosition(upTo).quantity
}

function min(a: Money, b: Money): Money {
  return a.lessThan(b) ? a : b
}
