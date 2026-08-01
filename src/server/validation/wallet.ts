import { z } from 'zod'
import { ASSET_CLASSES } from '@/config/asset-classes'

const SLUGS = ASSET_CLASSES.map((c) => c.slug) as [string, ...string[]]

const KINDS = ['BROKER', 'EXCHANGE', 'SELF_CUSTODY', 'BANK', 'OTHER'] as const

const walletName = z
  .string()
  .trim()
  .min(1, 'Informe um nome')
  .max(60, 'Use no máximo 60 caracteres')

export const newWalletSchema = z.object({
  classSlug: z.enum(SLUGS),
  name: walletName,
  kind: z.enum(KINDS).default('OTHER'),
})

/**
 * A classe fica de fora de propósito.
 *
 * Mudar a classe de uma carteira moveria todos os ativos dentro dela de uma vez
 * para um lugar onde talvez não caibam — um CDB acabaria numa carteira de
 * ações, que é exatamente o problema que já custou caro aqui.
 */
export const renameWalletSchema = z.object({
  id: z.string().uuid(),
  name: walletName,
  kind: z.enum(KINDS).optional(),
})

export type NewWalletInput = z.input<typeof newWalletSchema>
export type RenameWalletInput = z.input<typeof renameWalletSchema>
