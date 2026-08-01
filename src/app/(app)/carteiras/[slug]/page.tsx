import { notFound } from 'next/navigation'
import { ClassWorkspace } from '@/features/class-workspace/class-workspace'
import { ASSET_CLASSES } from '@/config/asset-classes'
import type { AssetClassSlug } from '@/core/types/portfolio'
import { requireTenant } from '@/server/auth/session'
import { loadClassWorkspace } from '@/server/queries/class-workspace'

// Sem generateStaticParams: a rota é autenticada e depende de cookie, então não
// existe versão estática para pré-renderizar.
const VALID = new Set<string>(ASSET_CLASSES.map((c) => c.slug))

export default async function ClassePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!VALID.has(slug)) notFound()

  const context = await requireTenant()
  // Todo o cálculo com Decimal acontece aqui, no servidor.
  const workspace = await loadClassWorkspace(context.user.id, context.tenantId, slug as AssetClassSlug)

  return <ClassWorkspace initial={workspace} />
}
