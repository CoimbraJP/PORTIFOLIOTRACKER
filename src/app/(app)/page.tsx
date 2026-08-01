import { AreaChartGlow } from '@/components/charts/area-chart-glow'
import { DonutAllocation } from '@/components/charts/donut-allocation'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FadeIn } from '@/components/motion/fade-in'
import { MetricsRow } from '@/features/dashboard/metrics-row'
import { MissingQuotesNotice } from '@/features/dashboard/missing-quotes-notice'
import { NetWorthHero } from '@/features/dashboard/net-worth-hero'
import { PortfolioViews } from '@/features/dashboard/portfolio-views'
import { assetClass } from '@/config/asset-classes'
import { toPortfolioView } from '@/core/view/portfolio-view'
import { requireTenant } from '@/server/auth/session'
import { loadPortfolio } from '@/server/queries/portfolio'

/**
 * Dashboard — Server Component.
 *
 * Lê do banco, consolida no servidor com `Decimal` e entrega ao cliente apenas
 * valores já formatados. O cliente renderiza e anima; não calcula patrimônio.
 * Ver CLAUDE.md §2.5.
 */
export default async function DashboardPage() {
  const context = await requireTenant()
  const summary = await loadPortfolio(context.user.id, context.tenantId)
  const portfolio = toPortfolioView(summary)

  if (portfolio.positions.length === 0) {
    return (
      <div className="mx-auto max-w-[1400px]">
        <EmptyState
          title="Seu patrimônio começa aqui"
          description="Cadastre o primeiro ativo em Carteiras e classes. A partir do primeiro lançamento, o histórico passa a ser gravado todos os dias."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-12">
      {/* Primeira dobra: metade patrimônio, metade os três indicadores. */}
      <FadeIn>
        <div className="grid items-stretch gap-5 lg:grid-cols-2">
          <NetWorthHero portfolio={portfolio} />
          <MetricsRow portfolio={portfolio} />
        </div>
      </FadeIn>

      <MissingQuotesNotice symbols={summary.missingQuotes} />

      <FadeIn delay={0.08}>
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Evolução patrimonial</CardTitle>
                <CardDescription>
                  Linha cheia: patrimônio. Tracejada: valor investido.
                </CardDescription>
              </div>
            </CardHeader>
            <AreaChartGlow data={portfolio.history} currency={portfolio.baseCurrency} />
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Distribuição</CardTitle>
                <CardDescription>Participação de cada classe</CardDescription>
              </div>
            </CardHeader>
            <DonutAllocation
              slices={portfolio.classes.map((c) => ({
                key: c.slug,
                label: c.name,
                // Geometria da fatia usa a moeda base: misturar BRL e USD aqui
                // deformaria as proporções do anel.
                value: c.baseValue.raw,
                share: c.shareRaw,
                color: assetClass(c.slug).colorVar,
              }))}
              total={portfolio.totalValue.compact}
              currency={portfolio.baseCurrency}
            />
          </Card>
        </div>
      </FadeIn>

      <FadeIn delay={0.12}>
        <PortfolioViews portfolio={portfolio} />
      </FadeIn>
    </div>
  )
}
