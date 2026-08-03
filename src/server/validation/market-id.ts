import { z } from 'zod'

/**
 * Id da moeda na CoinGecko.
 *
 * É o pedaço final da URL da moeda no site: `coingecko.com/pt/moedas/bitcoin`
 * → `bitcoin`. Minúsculas, números e hífen — a API rejeita qualquer outra
 * coisa, e validar aqui evita gravar um id que só falharia na próxima
 * sincronização, longe de quem digitou.
 */
export const marketIdSchema = z.object({
  positionId: z.string().uuid('Ativo inválido.'),
  coingeckoId: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'Informe o id da moeda.')
    .max(80, 'Id muito longo.')
    .regex(/^[a-z0-9-]+$/, 'O id tem só letras minúsculas, números e hífen — como "usd-coin".'),
})
