import { money } from '../money/decimal'
import type { Movement } from './types'

/**
 * O que um movimento vira no ledger.
 *
 * `TRANSFERENCIA` é o par que resolve troca de ticker: sai de um instrumento e
 * entra no outro carregando o MESMO custo. O motor já sabe fazer isso sem
 * inventar nem destruir dinheiro — é a mesma mecânica de quem manda bitcoin da
 * exchange para a carteira fria (`compute-position.ts`).
 */
export type ProposalType =
  | 'BUY'
  | 'SELL'
  | 'BONUS'
  | 'SPLIT'
  | 'REVERSE_SPLIT'
  | 'TRANSFERENCIA'

export interface Proposal {
  /** Chave estável, para a tela editar e o servidor reencontrar. */
  id: string
  year: number
  type: ProposalType
  symbol: string
  name: string
  /** Só em transferência: de onde o papel veio. */
  fromSymbol?: string
  quantity: string
  /**
   * Preço proposto. Vazio quando não se aplica — bonificação e desdobramento
   * não têm preço, e um campo preenchido ali convidaria a inventar custo.
   */
  unitPrice: string
  /** `YYYY-MM-DD`. Nasce em 31/12 do ano, que é a data do preço. */
  date: string
  ratio?: string
  motivo: string
  confirmar: boolean
  /** `false` desliga esta linha sem apagá-la da tela. */
  incluir: boolean
}

const TIPO: Record<Movement['kind'], ProposalType> = {
  ENTRADA: 'BUY',
  AUMENTO: 'BUY',
  SAIDA: 'SELL',
  REDUCAO: 'SELL',
  BONIFICACAO: 'BONUS',
  DESDOBRAMENTO: 'SPLIT',
  GRUPAMENTO: 'REVERSE_SPLIT',
  RENOMEACAO: 'TRANSFERENCIA',
  INCORPORACAO: 'TRANSFERENCIA',
}

/** Tipos em que preço não existe: quantidade muda, dinheiro não. */
const SEM_PRECO = new Set<ProposalType>(['BONUS', 'SPLIT', 'REVERSE_SPLIT', 'TRANSFERENCIA'])

/**
 * Traduz os movimentos em lançamentos propostos.
 *
 * A data nasce em **31/12 do ano**, e não por acaso: é a data a que o preço do
 * relatório se refere. Qualquer outra data com aquele preço junta um dia com a
 * cotação de outro. Quando o usuário souber a data real, ele troca — e aí o
 * preço passa a ser responsabilidade dele, que é o certo.
 */
export function toProposals(movements: readonly Movement[]): Proposal[] {
  return movements.map((m, indice) => {
    const type = TIPO[m.kind]

    return {
      id: `${m.year}-${m.symbol}-${m.kind}-${indice}`,
      year: m.year,
      type,
      symbol: m.symbol,
      name: m.name,
      ...(m.fromSymbol ? { fromSymbol: m.fromSymbol } : {}),
      quantity: m.quantity,
      unitPrice: SEM_PRECO.has(type) ? '' : m.referencePrice,
      date: `${m.year}-12-31`,
      ...(m.ratio ? { ratio: m.ratio } : {}),
      motivo: m.motivo,
      confirmar: m.confirmar,
      incluir: true,
    }
  })
}

/**
 * Diz se a proposta pode ser gravada como está.
 *
 * A checagem é de coerência, não de gosto: quantidade tem que ser positiva,
 * compra e venda precisam de preço, e a data tem que cair no ano do relatório
 * que a originou. Data fora do ano é o erro mais fácil de cometer digitando, e
 * o mais difícil de perceber depois — ela desloca o negócio para um exercício
 * em que ele não aconteceu.
 */
export function validarProposta(p: Proposal): string | null {
  const quantidade = money(p.quantity || '0')
  if (quantidade.lessThanOrEqualTo(0)) return 'Quantidade precisa ser maior que zero.'

  if (!SEM_PRECO.has(p.type)) {
    const preco = money(p.unitPrice || '0')
    if (preco.lessThanOrEqualTo(0)) return 'Informe o preço.'
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return 'Data inválida.'
  if (Number(p.date.slice(0, 4)) !== p.year) {
    return `A data precisa ser de ${p.year}, o ano do relatório que originou esta linha.`
  }

  return null
}
