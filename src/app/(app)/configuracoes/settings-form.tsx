'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { features } from '@/config/features'

interface Setting {
  key: string
  title: string
  description: string
  initial: boolean
  disabled?: boolean
  note?: string
}

const SETTINGS: Setting[] = [
  {
    key: 'advancedReturns',
    title: 'Rentabilidade real (TWR / XIRR)',
    description:
      'Exibe a rentabilidade imune ao efeito dos aportes, ao lado da variação simples. É a métrica correta para comparar com CDI e IBOV.',
    initial: features.advancedReturns,
    note: 'Chega na Fase 7',
    disabled: true,
  },
]

export function SettingsForm() {
  const [values, setValues] = useState<Record<string, boolean>>(
    Object.fromEntries(SETTINGS.map((s) => [s.key, s.initial])),
  )

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-[0.9375rem] font-semibold text-fg">Métricas</h2>
        <p className="mt-1 text-[0.8125rem] text-fg-subtle">
          Escolha o nível de detalhe dos indicadores de desempenho.
        </p>

        <div className="mt-6 space-y-5">
          {SETTINGS.map((setting) => (
            <div key={setting.key} className="flex items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-fg">{setting.title}</p>
                  {setting.note ? (
                    <span className="rounded-full border border-line px-2 py-0.5 text-caption uppercase text-fg-subtle">
                      {setting.note}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 max-w-xl text-[0.8125rem] leading-relaxed text-fg-subtle">
                  {setting.description}
                </p>
              </div>

              <Switch
                checked={values[setting.key] ?? false}
                disabled={setting.disabled}
                label={setting.title}
                onCheckedChange={(checked) =>
                  setValues((prev) => ({ ...prev, [setting.key]: checked }))
                }
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-[0.9375rem] font-semibold text-fg">Moeda base</h2>
        <p className="mt-1 text-[0.8125rem] text-fg-subtle">
          Todos os agregados são convertidos para esta moeda usando o câmbio da data de cada
          transação.
        </p>
        <p className="numeric mt-5 text-sm text-fg">Real brasileiro (BRL)</p>
      </Card>
    </div>
  )
}
