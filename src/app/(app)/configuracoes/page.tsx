import { PageHeader } from '@/components/layout/page-header'
import { CatalogPanel } from '@/features/settings/catalog-panel'
import { CurrencyPanel } from '@/features/settings/currency-panel'
import { IncomePanel } from '@/features/settings/income-panel'
import { LogoPanel } from '@/features/settings/logo-panel'
import { SyncPanel } from '@/features/settings/sync-panel'
import { lastQuoteAt } from '@/server/actions/sync'
import { listInstrumentLogos } from '@/server/actions/settings'
import { requireTenant } from '@/server/auth/session'
import { loadDisplaySettings } from '@/server/queries/display-settings'
import { countCatalog } from '@/server/queries/catalog'
import { SettingsForm } from './settings-form'

export default async function ConfiguracoesPage() {
  const context = await requireTenant()

  const [last, display, logos, catalogTotal] = await Promise.all([
    lastQuoteAt(),
    loadDisplaySettings(context.tenantId),
    listInstrumentLogos(),
    countCatalog(),
  ])

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Configurações" description="Preferências de exibição e cálculo." />

      <div className="space-y-5">
        <SyncPanel lastQuoteAt={last} />

        <CatalogPanel total={catalogTotal} />

        <IncomePanel />

        <CurrencyPanel
          baseCurrency={display.base === 'USD' ? 'USD' : 'BRL'}
          classOverrides={
            Object.fromEntries(
              Object.entries(display.classOverrides).filter(
                ([, currency]) => currency === 'BRL' || currency === 'USD',
              ),
            ) as Record<string, 'BRL' | 'USD'>
          }
          usdBrl={display.usdBrl ? display.usdBrl.toFixed(4) : null}
        />

        <LogoPanel rows={logos} />

        <SettingsForm />
      </div>
    </div>
  )
}
