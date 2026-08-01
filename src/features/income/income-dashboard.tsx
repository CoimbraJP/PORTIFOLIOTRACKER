'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Coins, Download, Sparkles } from 'lucide-react'
import { AssetAvatar } from '@/components/data/asset-avatar'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FadeIn } from '@/components/motion/fade-in'
import { syncIncomeNow, type IncomeResult } from '@/server/actions/sync'
import type { IncomeSummary } from '@/server/queries/income'
import { cn } from '@/lib/cn'

export function IncomeDashboard({
  summary,
  year,
}: {
  summary: IncomeSummary
  year: string | null
}) {
  const router = useRouter()
  const [result, setResult] = useState<IncomeResult | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSync() {
    setResult(null)
    startTransition(async () => {
      setResult(await syncIncomeNow())
      router.refresh()
    })
  }

  function selecionarAno(valor: string | null) {
    router.push(valor ? `/proventos?ano=${valor}` : '/proventos')
  }

  const vazio = summary.recent.length === 0

  return (
    <div className="flex flex-col gap-8">
      <FadeIn>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-caption uppercase text-fg-subtle">
              {year ? `Recebido em ${year}` : 'Recebido no total'}
            </p>
            <p className="sensitive numeric mt-1 text-[2.25rem] font-semibold leading-none text-fg">
              {summary.totalText}
            </p>
            {summary.yieldOnCostText ? (
              <p className="mt-2 text-[0.8125rem] text-fg-muted">
                <span className="font-medium text-accent">{summary.yieldOnCostText}</span> sobre o
                que você pagou pelos ativos
              </p>
            ) : null}
          </div>

          <Button variant="secondary" onClick={handleSync} disabled={pending}>
            <Download size={15} strokeWidth={2} className={cn(pending && 'animate-pulse')} />
            {pending ? 'Buscando…' : 'Buscar proventos'}
          </Button>
        </div>
      </FadeIn>

      {result ? <SyncFeedback result={result} /> : null}

      {vazio ? (
        <EmptyState
          icon={<Coins size={22} strokeWidth={1.8} />}
          title="Nenhum provento ainda"
          description="Clique em Buscar proventos. Os dividendos e JCP das suas ações e FIIs são apurados pela quantidade que você tinha na data-com — você nunca cadastra provento na mão."
        />
      ) : (
        <>
          <FadeIn delay={0.04}>
            <div className="grid gap-5 sm:grid-cols-3">
              <Metric label="Últimos 12 meses" value={summary.last12MonthsText} />
              <Metric
                label="Média mensal"
                value={summary.monthlyAverageText}
                hint="Total dos 12 meses dividido por 12"
              />
              <Metric
                label="Ativos pagadores"
                value={String(summary.byAsset.length)}
                hint="Quantos renderam no período"
              />
            </div>
          </FadeIn>

          <FadeIn delay={0.08}>
            <Card>
              <CardHeader>
                <CardTitle>Fluxo mensal</CardTitle>
                <YearPicker years={summary.years} current={year} onSelect={selecionarAno} />
              </CardHeader>
              <MonthlyChart monthly={summary.monthly} />
            </Card>
          </FadeIn>

          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <FadeIn delay={0.12}>
              <Card>
                <CardHeader>
                  <CardTitle>De onde veio</CardTitle>
                </CardHeader>
                <AssetList assets={summary.byAsset} />
              </Card>
            </FadeIn>

            <FadeIn delay={0.16}>
              <Card>
                <CardHeader>
                  <CardTitle>Por ano</CardTitle>
                </CardHeader>
                <YearList yearly={summary.yearly} />
              </Card>
            </FadeIn>
          </div>

          <FadeIn delay={0.2}>
            <Card>
              <CardHeader>
                <CardTitle>Últimos recebimentos</CardTitle>
              </CardHeader>
              <EntryList entries={summary.recent} />
            </Card>
          </FadeIn>
        </>
      )}
    </div>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="text-caption uppercase text-fg-subtle">{label}</p>
      <p className="sensitive numeric mt-2 text-[1.375rem] font-semibold text-fg">{value}</p>
      {hint ? <p className="mt-1 text-caption normal-case text-fg-subtle">{hint}</p> : null}
    </Card>
  )
}

function YearPicker({
  years,
  current,
  onSelect,
}: {
  years: string[]
  current: string | null
  onSelect: (year: string | null) => void
}) {
  if (years.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      <PickerButton active={current === null} onClick={() => onSelect(null)}>
        Tudo
      </PickerButton>
      {years.map((year) => (
        <PickerButton key={year} active={current === year} onClick={() => onSelect(year)}>
          {year}
        </PickerButton>
      ))}
    </div>
  )
}

function PickerButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-md px-2.5 py-1 text-[0.8125rem] transition-colors duration-[180ms]',
        active ? 'bg-accent/15 font-medium text-accent' : 'text-fg-subtle hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Barras em CSS puro, sem biblioteca.
 *
 * A altura sai de `transform: scaleY`, não de `height`: só `transform` e
 * `opacity` animam neste produto, porque são as únicas propriedades que a GPU
 * resolve sem recalcular o layout (CLAUDE.md §2.6).
 */
function MonthlyChart({ monthly }: { monthly: IncomeSummary['monthly'] }) {
  if (monthly.length === 0) {
    return <p className="py-8 text-center text-[0.8125rem] text-fg-subtle">Sem movimento.</p>
  }

  const maior = Math.max(...monthly.map((m) => m.total), 0.01)

  return (
    <div className="mt-2">
      <div className="flex h-40 items-end gap-1.5">
        {monthly.map((mes) => (
          <div key={mes.month} className="group relative flex flex-1 flex-col justify-end">
            <span
              className="w-full origin-bottom rounded-t-[3px] bg-accent/35 transition-colors duration-[180ms] group-hover:bg-accent"
              style={{ height: '100%', transform: `scaleY(${Math.max(mes.total / maior, 0.01)})` }}
            />
            <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-raised px-2 py-1 text-caption normal-case tracking-normal text-fg opacity-0 transition-opacity duration-[180ms] group-hover:opacity-100">
              {mes.totalText}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-1.5">
        {monthly.map((mes) => (
          <span
            key={mes.month}
            className="flex-1 truncate text-center text-caption normal-case tracking-normal text-fg-subtle"
          >
            {mes.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function AssetList({ assets }: { assets: IncomeSummary['byAsset'] }) {
  return (
    <div className="mt-2 divide-y divide-line">
      {assets.map((asset) => (
        <div key={asset.symbol} className="flex items-center gap-3 py-3">
          <AssetAvatar
            symbol={asset.symbol}
            name={asset.name}
            logoUrl={asset.logoUrl}
            classSlug={asset.classSlug}
            size={28}
          />

          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8125rem] font-medium text-fg">{asset.symbol}</p>
            <p className="truncate text-caption normal-case tracking-normal text-fg-subtle">
              {asset.className}
              {asset.yieldOnCost ? ` · ${asset.yieldOnCost} sobre o custo` : ''}
            </p>
          </div>

          <div className="text-right">
            <p className="sensitive numeric text-[0.8125rem] font-medium text-fg">
              {asset.totalText}
            </p>
            <p className="numeric text-caption normal-case tracking-normal text-fg-subtle">
              {asset.shareText}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function YearList({ yearly }: { yearly: IncomeSummary['yearly'] }) {
  return (
    <div className="mt-2 divide-y divide-line">
      {[...yearly].reverse().map((ano) => (
        <div key={ano.year} className="flex items-center justify-between py-3">
          <span className="numeric text-[0.8125rem] text-fg-muted">{ano.year}</span>
          <span className="flex items-baseline gap-2">
            <span className="sensitive numeric text-[0.8125rem] font-medium text-fg">
              {ano.totalText}
            </span>
            {ano.changePct ? (
              <span
                className={cn(
                  'numeric text-caption normal-case tracking-normal',
                  ano.positive ? 'text-positive' : 'text-negative',
                )}
              >
                {ano.positive ? '+' : ''}
                {ano.changePct}
              </span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  )
}

function EntryList({ entries }: { entries: IncomeSummary['recent'] }) {
  return (
    <div className="mt-2 divide-y divide-line">
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-center gap-3 py-2.5">
          <AssetAvatar
            symbol={entry.symbol}
            name={entry.symbol}
            logoUrl={entry.logoUrl}
            classSlug="acoes-br"
            size={22}
          />

          <span className="w-20 shrink-0 text-[0.8125rem] font-medium text-fg">{entry.symbol}</span>

          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-caption normal-case tracking-normal text-fg-subtle">
              {entry.typeLabel}
            </span>
            {/* O ícone distingue o que o sistema apurou do que foi digitado —
                sem isso não dá para saber se um valor estranho veio da API ou
                de um lançamento manual antigo. */}
            {entry.automatic ? (
              <Sparkles size={11} strokeWidth={2} className="shrink-0 text-accent" />
            ) : null}
          </span>

          <span className="numeric hidden text-caption normal-case tracking-normal text-fg-subtle sm:block">
            {entry.dateLabel}
          </span>

          <span className="w-28 text-right">
            <span className="sensitive numeric block text-[0.8125rem] font-medium text-positive">
              {entry.amountText}
            </span>
            {entry.taxesText ? (
              <span className="numeric block text-caption normal-case tracking-normal text-fg-subtle">
                IR {entry.taxesText}
              </span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  )
}

function SyncFeedback({ result }: { result: IncomeResult }) {
  if (result.error) {
    return (
      <p className="rounded-md border border-negative/25 bg-negative/10 px-3 py-2 text-[0.8125rem] text-negative">
        {result.error}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-[0.8125rem] text-positive">
        <Check size={14} strokeWidth={2.2} />
        {result.created === 0 && result.updated === 0
          ? `Nenhum provento novo — ${result.actions} eventos conferidos.`
          : `${result.created} ${result.created === 1 ? 'provento novo' : 'proventos novos'}` +
            (result.updated > 0 ? ` · ${result.updated} corrigidos` : '')}
      </p>

      {result.unresolved.length > 0 ? (
        <p className="text-[0.8125rem] text-fg-subtle">
          Sem proventos encontrados: {result.unresolved.join(', ')}
        </p>
      ) : null}

      {result.warnings.map((warning) => (
        <p
          key={warning}
          className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-warning"
        >
          <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
          {warning}
        </p>
      ))}
    </div>
  )
}
