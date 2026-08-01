import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { AccountsTable } from '@/features/admin/accounts-table'
import { isMaster } from '@/server/auth/master'
import { requireTenant } from '@/server/auth/session'
import { listAccounts } from '@/server/queries/accounts'

export const metadata = { title: 'Contas · Patrimônio' }

/**
 * Administração de contas.
 *
 * `notFound()` em vez de "acesso negado": para quem não é operador, a rota não
 * existe. Uma mensagem de permissão confirmaria que há algo ali, e é informação
 * que não precisa ser dada.
 *
 * A verificação se repete dentro de `listAccounts` e de `deleteAccount`. Não é
 * redundância — são pontos de entrada diferentes, e proteger só a página
 * deixaria as Server Actions abertas a quem soubesse chamá-las.
 */
export default async function AdminPage() {
  await requireTenant()

  if (!(await isMaster())) notFound()

  const accounts = await listAccounts()

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Contas"
        description="Todas as pessoas cadastradas. Apagar remove o acesso e tudo que a conta guarda."
      />
      <AccountsTable accounts={accounts} />
    </div>
  )
}
