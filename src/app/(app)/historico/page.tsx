import { Suspense } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { HistoryTable } from '@/features/history/history-table'
import { requireTenant } from '@/server/auth/session'
import { loadHistory } from '@/server/queries/history'

export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const context = await requireTenant()

  const data = await loadHistory(context.user.id, context.tenantId, {
    classSlug: params.classe,
    walletId: params.carteira,
    group: params.group,
    from: params.de,
    to: params.ate,
  })

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Histórico"
        description="Todo lançamento do ledger: compras, vendas, transferências e proventos. É daqui que quantidade e preço médio são derivados."
      />

      {/* Os filtros leem a URL, então o componente precisa de Suspense. */}
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <HistoryTable data={data} />
      </Suspense>
    </div>
  )
}
