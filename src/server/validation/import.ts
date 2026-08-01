import { z } from 'zod'
import { ASSET_CLASSES } from '@/config/asset-classes'

const SLUGS = ASSET_CLASSES.map((c) => c.slug) as [string, ...string[]]

/** Um arquivo da leva. */
export const arquivoSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  // 2 MB de CSV é bem mais que uma vida inteira de negócios; o limite existe
  // para o corpo da requisição não virar um vetor de abuso.
  csv: z.string().min(1, 'Arquivo vazio.').max(2_000_000, 'Arquivo grande demais (máximo 2 MB).'),
  /**
   * Carteira deste arquivo.
   *
   * Fica no arquivo, e não na leva, porque é justamente isso que muda entre
   * eles: exportador de corretora e de cripto gera um arquivo por conta, e o
   * nome da conta está no nome do arquivo. Uma carteira só para a leva inteira
   * misturaria a Binance com a Ledger.
   */
  wallet: z.string().trim().max(80, 'Nome de carteira muito longo.').optional(),
  /**
   * Valores corrigidos à mão na conferência, por número de linha da planilha.
   *
   * Vem como TEXTO e é convertido no servidor, pelo mesmo caminho de sempre.
   * Aceitar o número já pronto do navegador seria abrir justamente a porta que
   * o resto da importação fecha: o servidor não teria como saber se "2341" é
   * dois mil e trezentos ou dois vírgula três.
   */
  correcoes: z
    .record(
      z.string().regex(/^\d+$/),
      z.object({
        unitPrice: z.string().trim().max(40).optional(),
        quantity: z.string().trim().max(40).optional(),
      }),
    )
    .optional(),
})

/**
 * O que a tela manda para importar.
 *
 * Manda o TEXTO dos arquivos, não as linhas já convertidas. O cliente reparsear
 * e enviar números prontos seria confiar no navegador para decidir quanto custou
 * cada compra — e o servidor não teria como saber que "100" na verdade era
 * "100.000" mal lido. O servidor lê os mesmos arquivos de novo e é a leitura
 * dele que vale (CLAUDE.md §2.5).
 */
export const importSchema = z.object({
  arquivos: z
    .array(arquivoSchema)
    .min(1, 'Escolha ao menos um arquivo.')
    .max(20, 'Máximo de 20 arquivos por vez.'),
  /** A classe vale para a leva: quem importa cripto importa só cripto. */
  classSlug: z.enum(SLUGS, { message: 'Escolha a classe dos ativos.' }),
  currency: z.enum(['BRL', 'USD']).optional(),
})

export type ImportInput = z.output<typeof importSchema>
export type ArquivoInput = z.output<typeof arquivoSchema>
