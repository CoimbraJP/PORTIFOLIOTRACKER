import { pgEnum } from 'drizzle-orm/pg-core'

/** Como o valor atual do ativo é obtido. Ver docs/00 §3.3. */
export const valuationModeEnum = pgEnum('valuation_mode', [
  'QUANTITATIVE',
  'VALUATED',
  'ACCRUAL',
])

export const walletKindEnum = pgEnum('wallet_kind', [
  'BROKER',
  'EXCHANGE',
  'SELF_CUSTODY',
  'BANK',
  'OTHER',
])

export const instrumentKindEnum = pgEnum('instrument_kind', [
  'STOCK',
  'FII',
  'ETF',
  'CRYPTO',
  'FIXED_INCOME',
  'CUSTOM',
])

/**
 * Tipos de lançamento do ledger. Ver docs/01 §4.2.
 *
 * Reavaliação de imóvel NÃO está aqui: não move dinheiro nem quantidade, então
 * vive na tabela `valuation`. O ledger registra fatos econômicos.
 */
export const transactionTypeEnum = pgEnum('transaction_type', [
  // posição
  'BUY',
  'SELL',
  // movimentação — preserva preço médio, não gera lucro
  'TRANSFER_IN',
  'TRANSFER_OUT',
  // proventos — não alteram quantidade
  'DIVIDEND',
  'JCP',
  'INCOME',
  'RENT',
  'INTEREST',
  'STAKING',
  // eventos corporativos — ajustam quantidade e preço médio, valor constante
  'SPLIT',
  'REVERSE_SPLIT',
  'BONUS',
  // provisão de juros de renda fixa e empréstimos
  'ACCRUAL',
])

export const transactionSourceEnum = pgEnum('transaction_source', [
  'MANUAL',
  'IMPORT',
  'AUTO_CORPORATE_ACTION',
])

export const corporateActionTypeEnum = pgEnum('corporate_action_type', [
  'DIVIDEND',
  'JCP',
  'BONUS',
  'SPLIT',
  'REVERSE_SPLIT',
  'INCOME',
])

export const valuationMethodEnum = pgEnum('valuation_method', [
  'MANUAL',
  'APPRAISAL',
  'MARKET',
])

export const attachmentKindEnum = pgEnum('attachment_kind', ['PHOTO', 'DOCUMENT'])
