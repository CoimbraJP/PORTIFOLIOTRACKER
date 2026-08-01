import type { Money } from '../money/decimal'
import type { PositionState } from '../types/portfolio'

export type TransactionType =
  | 'BUY'
  | 'SELL'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'DIVIDEND'
  | 'JCP'
  | 'INCOME'
  | 'RENT'
  | 'INTEREST'
  | 'STAKING'
  | 'SPLIT'
  | 'REVERSE_SPLIT'
  | 'BONUS'
  | 'ACCRUAL'

/** Lançamento do ledger, já em `Decimal`. Tipo de domínio, sem ORM. */
export interface LedgerEntry {
  id: string
  type: TransactionType
  occurredAt: Date
  quantity: Money
  unitPrice: Money
  fees: Money
  taxes: Money
  netAmount: Money
  /** Razão do desdobramento, grupamento ou bonificação. */
  ratio?: Money | null
  /**
   * Custo que acompanha uma transferência. A perna de saída informa quanto do
   * custo saiu; a de entrada, quanto entrou. Sem isso a transferência
   * inventaria ou destruiria custo.
   */
  transferCost?: Money | null
}

export type { PositionState }

/** Tipos que geram renda sem alterar quantidade nem custo. */
export const INCOME_TYPES: ReadonlySet<TransactionType> = new Set([
  'DIVIDEND',
  'JCP',
  'INCOME',
  'RENT',
  'INTEREST',
  'STAKING',
])
