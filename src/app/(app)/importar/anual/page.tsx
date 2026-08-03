import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { ReconstructPanel } from '@/features/reconstruct/reconstruct-panel'
import { requireTenant } from '@/server/auth/session'

export default async function ImportarAnualPage() {
  await requireTenant()

  return (
    <div className="mx-auto max-w-[1400px]">
      <Link
        href="/importar"
        className="mb-4 inline-flex items-center gap-1.5 text-[0.8125rem] text-fg-subtle transition-colors duration-[180ms] hover:text-fg"
      >
        <ArrowLeft size={14} strokeWidth={2} />
        Importar
      </Link>

      <PageHeader
        title="Reconstruir pelo relatório anual"
        description="Para quem não tem o histórico de negociação — deduz o que dá a partir das posições de 31/12."
      />

      <ReconstructPanel />
    </div>
  )
}
