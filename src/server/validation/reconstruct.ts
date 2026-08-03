import { z } from 'zod'
import { ASSET_CLASSES } from '@/config/asset-classes'

const SLUGS = ASSET_CLASSES.map((c) => c.slug) as [string, ...string[]]

/** Uma aba de posição exportada do relatório consolidado. */
export const arquivoAnualSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  csv: z.string().min(1, 'Arquivo vazio.').max(2_000_000, 'Arquivo grande demais (máximo 2 MB).'),
})

/**
 * A proposta como a tela devolve.
 *
 * Números e datas viajam como TEXTO e são convertidos no servidor, pelo mesmo
 * motivo da importação de negócios: aceitar valor já pronto do navegador
 * deixaria o custo de aquisição na mão do cliente.
 */
export const propostaSchema = z.object({
  id: z.string().max(120),
  year: z.number().int().min(1990).max(2100),
  type: z.enum(['BUY', 'SELL', 'BONUS', 'SPLIT', 'REVERSE_SPLIT', 'TRANSFERENCIA']),
  symbol: z.string().trim().min(1).max(20),
  name: z.string().trim().max(120),
  fromSymbol: z.string().trim().max(20).optional(),
  quantity: z.string().trim().max(40),
  unitPrice: z.string().trim().max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  ratio: z.string().trim().max(40).optional(),
  motivo: z.string().max(400),
  confirmar: z.boolean(),
  incluir: z.boolean(),
})

export const lerAnualSchema = z.object({
  arquivos: z
    .array(arquivoAnualSchema)
    .min(1, 'Escolha ao menos um arquivo.')
    .max(40, 'Máximo de 40 arquivos por vez.'),
})

export const gravarAnualSchema = z.object({
  classSlug: z.enum(SLUGS, { message: 'Escolha a classe dos ativos.' }),
  wallet: z.string().trim().min(1, 'Informe a carteira.').max(80),
  propostas: z.array(propostaSchema).min(1, 'Nada para gravar.').max(2000),
})

export type LerAnualInput = z.output<typeof lerAnualSchema>
export type GravarAnualInput = z.output<typeof gravarAnualSchema>
export type PropostaInput = z.output<typeof propostaSchema>
