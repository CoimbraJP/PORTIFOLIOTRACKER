import { z } from 'zod'
import { ASSET_CLASSES } from '@/config/asset-classes'
import { parseDecimalInput } from '@/core/money/parse'

const SLUGS = ASSET_CLASSES.map((c) => c.slug) as [string, ...string[]]

/**
 * Valor monetário chega como texto e continua texto até o `Decimal` do
 * servidor. Converter para `number` aqui já perderia precisão — e aceita
 * vírgula, porque é o que o teclado brasileiro digita.
 */
const decimalString = z
  .string()
  .trim()
  .min(1, 'Obrigatório')
  .transform(parseDecimalInput)
  .refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0, 'Informe um número maior que zero')

/**
 * Câmbio do dia da compra.
 *
 * Aceita até quatro casas: a diferença entre 5,08 e 5,0812 num aporte grande já
 * é dinheiro visível.
 */
const rateString = z
  .string()
  .trim()
  .transform(parseDecimalInput)
  .refine((v) => /^\d+(\.\d{1,6})?$/.test(v) && Number(v) > 0, 'Informe uma cotação válida')

/** Novo ativo numa carteira: cria instrumento, posição e a compra inicial. */
export const newPositionSchema = z.object({
  classSlug: z.enum(SLUGS),
  /** Id de carteira existente, ou vazio quando `newWalletName` é usado. */
  walletId: z.string().trim(),
  newWalletName: z.string().trim().max(60).optional(),
  symbol: z.string().trim().min(1, 'Obrigatório').max(40),
  name: z.string().trim().max(80).optional(),
  quantity: decimalString,
  unitCost: decimalString,
  /** Valor unitário atual. Ausente = usa o custo, e o lucro nasce zero. */
  unitValue: decimalString.optional(),
  occurredAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
    .optional(),
  /**
   * Moeda em que os valores acima foram DIGITADOS.
   *
   * Não confundir com a moeda de exibição: aqui a pergunta é em que moeda o
   * dinheiro saiu da conta. O custo é convertido para a moeda do domínio na
   * gravação, e o original fica guardado no lançamento.
   */
  entryCurrency: z.enum(['BRL', 'USD']).default('BRL'),
  /** Cotação do dólar usada na conversão. Obrigatória quando a entrada é USD. */
  entryRate: rateString.optional(),
})

export type NewPositionInput = z.input<typeof newPositionSchema>
export type NewPositionData = z.output<typeof newPositionSchema>
