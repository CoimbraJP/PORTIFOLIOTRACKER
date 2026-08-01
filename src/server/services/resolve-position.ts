import 'server-only'

import { and, eq, isNull } from 'drizzle-orm'
import { assetClass as assetClassConfig } from '@/config/asset-classes'
import type { AssetClassSlug } from '@/core/types/portfolio'
import type { Database } from '@/db/client'
import { assetClass, instrument, position, wallet } from '@/db/schema'
import type { CatalogMatch } from './catalog-lookup'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export interface ResolveInput {
  classSlug: AssetClassSlug
  /** Carteira existente escolhida no formulário. */
  walletId?: string | undefined
  /** Nome da carteira, quando ela ainda não existe ou vem de um arquivo. */
  walletName?: string | undefined
  symbol: string
  name?: string | undefined
  /** Data de abertura, se a posição precisar ser criada. `YYYY-MM-DD`. */
  openedAt: string
}

export interface Resolved {
  walletId: string
  instrumentId: string
  positionId: string
}

/**
 * Encontra (ou cria) onde um lançamento deve entrar.
 *
 * Está aqui, e não dentro de uma Server Action, porque o lançamento manual e a
 * importação precisam exatamente da mesma resposta — e as duas regras que este
 * caminho carrega são fáceis de reproduzir *quase* igual em dois lugares. Foi
 * assim que um CDB já foi parar numa carteira de ações: a segunda cópia da
 * lógica não tinha a verificação de classe.
 *
 * Roda dentro da transação de quem chamou: se o lançamento falhar depois, a
 * carteira criada aqui volta atrás junto.
 */
export async function resolvePosition(
  tx: Tx,
  tenantId: string,
  input: ResolveInput,
  catalogo: CatalogMatch | null,
): Promise<Resolved> {
  const definition = assetClassConfig(input.classSlug)

  const [classRow] = await tx
    .select({ id: assetClass.id })
    .from(assetClass)
    .where(eq(assetClass.slug, input.classSlug))
    .limit(1)

  if (!classRow) throw new Error(`Classe "${input.classSlug}" não existe no banco.`)

  const walletId = await resolverCarteira(tx, tenantId, classRow.id, input, definition)

  // Instrumento é COMPARTILHADO entre tenants — é o que faz a cotação do PETR4
  // ser buscada uma vez e servir todo mundo. Só entra no acervo comum o que o
  // catálogo conhece: símbolo vindo da B3, da CoinGecko ou da Twelve Data é
  // fato de mercado.
  //
  // Ticker que o catálogo não conhece vira instrumento PRIVADO do tenant. Não é
  // punição a quem cadastra ativo obscuro: é que um erro de digitação não pode
  // sujar o acervo dos outros usuários, e "KLBN44" no acervo comum ficaria lá
  // para sempre. Privado, o estrago é de quem digitou e some quando ele apagar.
  const isPrivate = definition.privateInstrument || catalogo === null
  const symbol = input.symbol.toUpperCase()

  const [existente] = await tx
    .select({ id: instrument.id })
    .from(instrument)
    .where(
      and(
        eq(instrument.symbol, symbol),
        isPrivate ? eq(instrument.tenantId, tenantId) : eq(instrument.isGlobal, true),
      ),
    )
    .limit(1)

  const instrumentId =
    existente?.id ??
    (
      await tx
        .insert(instrument)
        .values({
          tenantId: isPrivate ? tenantId : null,
          isGlobal: !isPrivate,
          symbol,
          name: input.name?.trim() || catalogo?.name || symbol,
          kind: definition.instrumentKind,
          // A moeda vem do catálogo: uma ação da NYSE é cotada em dólar, e
          // gravar BRL aqui faria a leitura tratar US$ 300 como R$ 300.
          currency: catalogo?.currency ?? 'BRL',
          // Logo e ids externos já vieram na sincronização do catálogo.
          // Descartá-los obrigaria o ativo a esperar a próxima cotação para
          // ganhar ícone — e, no caso da cripto, a nunca ganhar preço, já que a
          // CoinGecko é indexada por id e não por ticker.
          logoUrl: catalogo?.logoUrl ?? null,
          logoSyncedAt: catalogo?.logoUrl ? new Date() : null,
          externalIds: catalogo?.externalIds ?? {},
        })
        .returning({ id: instrument.id })
    )[0]!.id

  const [posicao] = await tx
    .select({ id: position.id })
    .from(position)
    .where(
      and(
        eq(position.walletId, walletId),
        eq(position.instrumentId, instrumentId),
        isNull(position.deletedAt),
      ),
    )
    .limit(1)

  const positionId =
    posicao?.id ??
    (
      await tx
        .insert(position)
        .values({ tenantId, walletId, instrumentId, openedAt: input.openedAt })
        .returning({ id: position.id })
    )[0]!.id

  return { walletId, instrumentId, positionId }
}

/**
 * A carteira do lançamento: a escolhida, a existente com aquele nome, ou uma nova.
 *
 * O `walletId` vem do cliente e não pode ser aceito de palavra. Duas coisas são
 * verificadas, e nenhuma delas o RLS cobre: uma chave estrangeira não passa por
 * policy, então um id forjado apontando para a carteira de outro tenant seria
 * gravado sem reclamação; e a carteira precisa ser DESTA classe — é o que
 * impede um CDB de acabar dentro de uma carteira de ações.
 */
async function resolverCarteira(
  tx: Tx,
  tenantId: string,
  assetClassId: string,
  input: ResolveInput,
  definition: ReturnType<typeof assetClassConfig>,
): Promise<string> {
  const termo = definition.walletTerm.one.toLowerCase()

  if (input.walletId) {
    const [alvo] = await tx
      .select({ id: wallet.id })
      .from(wallet)
      .where(
        and(
          eq(wallet.id, input.walletId),
          eq(wallet.tenantId, tenantId),
          eq(wallet.assetClassId, assetClassId),
          isNull(wallet.deletedAt),
        ),
      )
      .limit(1)

    if (!alvo) throw new Error(`Esta ${termo} não pertence a ${definition.name}.`)
    return alvo.id
  }

  const nome = input.walletName?.trim()
  if (!nome) throw new Error(`Informe o nome da ${termo}.`)

  // Reaproveita a carteira de mesmo nome em vez de criar outra. Importar o
  // mesmo arquivo duas vezes não pode deixar duas "Binance" na tela — e o
  // usuário não teria como saber qual das duas tem o quê.
  const [existente] = await tx
    .select({ id: wallet.id })
    .from(wallet)
    .where(
      and(
        eq(wallet.tenantId, tenantId),
        eq(wallet.assetClassId, assetClassId),
        eq(wallet.name, nome),
        isNull(wallet.deletedAt),
      ),
    )
    .limit(1)

  if (existente) return existente.id

  const [criada] = await tx
    .insert(wallet)
    .values({
      tenantId,
      assetClassId,
      name: nome,
      kind: input.classSlug === 'cripto' ? 'SELF_CUSTODY' : 'OTHER',
    })
    .returning({ id: wallet.id })

  return criada!.id
}
