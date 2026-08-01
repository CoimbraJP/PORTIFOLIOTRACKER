import { PageHeader } from '@/components/layout/page-header'
import { ClassCardGrid, type ClassCardData } from '@/features/class-workspace/class-card-grid'
import { ASSET_CLASSES } from '@/config/asset-classes'
import { toPortfolioView } from '@/core/view/portfolio-view'
import { requireTenant } from '@/server/auth/session'
import { loadPortfolio } from '@/server/queries/portfolio'

/**
 * Ponto de entrada por classe.
 *
 * Um card por classe de ativo, incluindo as vazias — é assim que o usuário
 * descobre que pode cadastrar imóveis ou empréstimos sem procurar em menu.
 */
export default async function CarteirasPage() {
  const context = await requireTenant()
  const portfolio = toPortfolioView(await loadPortfolio(context.user.id, context.tenantId))
  const summaryBySlug = new Map(portfolio.classes.map((c) => [c.slug, c]))

  const items: ClassCardData[] = ASSET_CLASSES.map((definition) => {
    const summary = summaryBySlug.get(definition.slug) ?? null
    return {
      slug: definition.slug,
      name: definition.name,
      walletTerm: definition.walletTerm.one,
      assetTerm: definition.assetTerm.one,
      walletCount: portfolio.wallets.filter((w) => w.classSlug === definition.slug).length,
      summary,
    }
  }).sort((a, b) => {
    const av = a.summary?.currentValue.raw ?? -1
    const bv = b.summary?.currentValue.raw ?? -1
    return bv - av
  })

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Carteiras e classes"
        description="Cada classe organiza suas carteiras do jeito que faz sentido: cidades para imóveis, corretoras para ações, exchanges para cripto."
      />
      <ClassCardGrid items={items} />
    </div>
  )
}
