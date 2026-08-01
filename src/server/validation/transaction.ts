import { z } from 'zod'

/**
 * Valor monetário chega como texto e continua texto até o `Decimal` do
 * servidor. Aceita vírgula, porque é o que o teclado brasileiro digita.
 */
const decimalString = z
  .string()
  .trim()
  .min(1, 'Obrigatório')
  .transform((v) => v.replace(/\./g, '').replace(',', '.'))
  .refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0, 'Informe um número maior que zero')

const optionalDecimal = z
  .string()
  .trim()
  .transform((v) => (v ? v.replace(/\./g, '').replace(',', '.') : '0'))
  .refine((v) => /^\d+(\.\d+)?$/.test(v), 'Valor inválido')

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')

/** Tipos que o formulário oferece. Split e bonificação vêm do motor de eventos. */
export const MANUAL_TYPES = [
  'BUY',
  'SELL',
  'TRANSFER',
  'DIVIDEND',
  'JCP',
  'INCOME',
  'RENT',
  'INTEREST',
  'STAKING',
  'VALUATION',
] as const

export type ManualType = (typeof MANUAL_TYPES)[number]

const base = z.object({
  positionId: z.string().uuid(),
  occurredAt: isoDate,
  notes: z.string().trim().max(280).optional(),
})

export const buyOrSellSchema = base.extend({
  type: z.enum(['BUY', 'SELL']),
  quantity: decimalString,
  unitPrice: decimalString,
  fees: optionalDecimal.optional(),
  taxes: optionalDecimal.optional(),
})

/**
 * Transferência entre carteiras.
 *
 * Só a origem e o destino: o custo que acompanha a quantidade é calculado pelo
 * servidor, a partir do preço médio da posição de origem. Deixar o usuário
 * digitar isso seria a porta de entrada para lucro fantasma.
 */
export const transferSchema = base.extend({
  type: z.literal('TRANSFER'),
  quantity: decimalString,
  /** Carteira de destino. Precisa ser da mesma classe. */
  targetWalletId: z.string().uuid(),
  fees: optionalDecimal.optional(),
})

export const incomeSchema = base.extend({
  type: z.enum(['DIVIDEND', 'JCP', 'INCOME', 'RENT', 'INTEREST', 'STAKING']),
  /** Valor bruto recebido. */
  grossAmount: decimalString,
  /** IR retido, típico em JCP. */
  taxes: optionalDecimal.optional(),
})

/**
 * Reavaliação de imóvel, empresa ou item alternativo.
 *
 * Não é transação: não move dinheiro nem quantidade. Vive na tabela
 * `valuation` — o ledger registra fatos econômicos, e reavaliação é uma
 * opinião de valor numa data.
 */
export const valuationSchema = base.extend({
  type: z.literal('VALUATION'),
  value: decimalString,
})

export const transactionSchema = z.discriminatedUnion('type', [
  buyOrSellSchema,
  transferSchema,
  incomeSchema,
  valuationSchema,
])

export type TransactionInput = z.input<typeof transactionSchema>
export type TransactionData = z.output<typeof transactionSchema>

/**
 * Lançamento em edição.
 *
 * Só compra, venda e provento. Transferência tem duas pernas amarradas pelo
 * mesmo grupo — editar uma delas quebraria a conservação de custo entre as
 * carteiras, e o certo ali é apagar e refazer. Reavaliação vive em outra tabela.
 *
 * O TIPO não é editável. Trocar uma compra por um dividendo não é corrigir um
 * lançamento, é apagar um e criar outro — e a interface deve dizer isso em vez
 * de fingir que é a mesma coisa.
 */
export const editTransactionSchema = z.discriminatedUnion('type', [
  buyOrSellSchema.extend({ id: z.string().uuid() }),
  incomeSchema.extend({ id: z.string().uuid() }),
])

export type EditTransactionInput = z.input<typeof editTransactionSchema>

/** Tipos que a interface deixa editar. Os demais só podem ser apagados. */
export const EDITABLE_TYPES = [
  'BUY',
  'SELL',
  'DIVIDEND',
  'JCP',
  'INCOME',
  'RENT',
  'INTEREST',
  'STAKING',
] as const
