import { z } from 'zod'
import { ASSET_CLASSES } from '@/config/asset-classes'

const SLUGS = ASSET_CLASSES.map((c) => c.slug) as [string, ...string[]]

/**
 * O que a tela manda para importar.
 *
 * Manda o TEXTO do arquivo, não as linhas já convertidas. O cliente reparsear e
 * enviar números prontos seria confiar no navegador para decidir quanto custou
 * cada compra — e o servidor não teria como saber que "100" na verdade era
 * "100.000" mal lido. O servidor lê o mesmo arquivo de novo e é a leitura dele
 * que vale (CLAUDE.md §2.5).
 */
export const importSchema = z.object({
  // 2 MB de CSV é bem mais que uma vida inteira de negócios; o limite existe
  // para o corpo da requisição não virar um vetor de abuso.
  csv: z.string().min(1, 'Arquivo vazio.').max(2_000_000, 'Arquivo grande demais (máximo 2 MB).'),
  classSlug: z.enum(SLUGS, { message: 'Escolha a classe dos ativos do arquivo.' }),
  /** Carteira padrão, para arquivos que não trazem a coluna. */
  wallet: z.string().trim().max(80, 'Nome de carteira muito longo.').optional(),
  /** Moeda padrão, para arquivos sem coluna de moeda. */
  currency: z.enum(['BRL', 'USD']).optional(),
})

export type ImportInput = z.output<typeof importSchema>
