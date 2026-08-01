import { PageHeader } from '@/components/layout/page-header'
import { IncomeDashboard } from '@/features/income/income-dashboard'
import { requireTenant } from '@/server/auth/session'
import { loadIncome } from '@/server/queries/income'

/**
 * Renda passiva — Server Component.
 *
 * Consolida no servidor com `Decimal` e entrega texto pronto. O filtro de ano
 * vive na URL para que um período específico possa ser compartilhado e voltar
 * pelo botão de voltar do navegador.
 */
export default async function ProventosPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>
}) {
  const context = await requireTenant()
  const { ano } = await searchParams

  // Só aceita quatro dígitos: o valor vem da URL, e passá-lo ao filtro sem
  // conferir deixaria qualquer texto entrar na comparação de datas.
  const year = ano && /^\d{4}$/.test(ano) ? ano : null

  const summary = await loadIncome(context.user.id, context.tenantId, year ?? undefined)

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Renda passiva"
        description="Dividendos, JCP, aluguéis e juros — apurados pela quantidade que você tinha na data-com."
      />
      <IncomeDashboard summary={summary} year={year} />
    </div>
  )
}
