import { PageHeader } from '@/components/layout/page-header'
import { CatalogPanel } from '@/features/settings/catalog-panel'
import { CryptoIdPanel } from '@/features/settings/crypto-id-panel'
import { DangerPanel } from '@/features/settings/danger-panel'
import { CurrencyPanel } from '@/features/settings/currency-panel'
import { IncomePanel } from '@/features/settings/income-panel'
import { LogoPanel } from '@/features/settings/logo-panel'
import { SimulationPanel } from '@/features/settings/simulation-panel'
import { SyncPanel } from '@/features/settings/sync-panel'
import { lastQuoteAt } from '@/server/actions/sync'
import { listInstrumentLogos } from '@/server/actions/settings'
import { requireTenant } from '@/server/auth/session'
import { features } from '@/config/features'
import { isMaster } from '@/server/auth/master'
import { loadDisplaySettings } from '@/server/queries/display-settings'
import { countCatalog } from '@/server/queries/catalog'
import { loadCryptoIds } from '@/server/queries/crypto-ids'
import { SettingsForm } from './settings-form'

export default async function ConfiguracoesPage() {
  const context = await requireTenant()

  const [last, display, logos, catalogTotal, master, criptos] = await Promise.all([
    lastQuoteAt(),
    loadDisplaySettings(context.tenantId),
    listInstrumentLogos(),
    countCatalog(),
    isMaster(),
    loadCryptoIds(context.user.id, context.tenantId),
  ])

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Configurações" description="Preferências de exibição e cálculo." />

      <div className="space-y-5">
        <SyncPanel lastQuoteAt={last} />

        <CatalogPanel total={catalogTotal} />

        <IncomePanel />

        <CryptoIdPanel rows={criptos} />

        {/* Ao lado da zona de perigo de propósito: as duas mexem no patrimônio
            inteiro de uma vez, e é bom que morem no mesmo canto da tela. */}
        {features.dangerZone ? <SimulationPanel /> : null}

        {features.dangerZone ? <DangerPanel /> : null}

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

        {/* Só o operador troca logo. `listInstrumentLogos` devolve lista vazia
            para os demais, então a seção some sem mensagem de acesso negado —
            ninguém precisa saber que existe algo que não pode usar. */}
        {master ? <LogoPanel rows={logos} /> : null}

        <SettingsForm />
      </div>
    </div>
  )
}
