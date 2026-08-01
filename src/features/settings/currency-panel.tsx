'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Select } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ASSET_CLASSES } from '@/config/asset-classes'
import { icon } from '@/lib/icons'
import { savePreferences } from '@/server/actions/settings'

type Currency = 'BRL' | 'USD'

export interface CurrencyPanelProps {
  baseCurrency: Currency
  /** { cripto: 'USD' } — classe ausente segue a base. */
  classOverrides: Record<string, Currency>
  /** Câmbio em uso, para conferir a conta. */
  usdBrl: string | null
}

export function CurrencyPanel({ baseCurrency, classOverrides, usdBrl }: CurrencyPanelProps) {
  const router = useRouter()
  const [base, setBase] = useState<Currency>(baseCurrency)
  const [overrides, setOverrides] = useState<Record<string, Currency>>(classOverrides)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // A alternativa é sempre a outra moeda: com base em real, o seletor liga o
  // dólar; com base em dólar, liga o real.
  const alternate: Currency = base === 'BRL' ? 'USD' : 'BRL'

  const dirty = useMemo(() => {
    if (base !== baseCurrency) return true
    const antes = JSON.stringify(sorted(classOverrides))
    const agora = JSON.stringify(sorted(overrides))
    return antes !== agora
  }, [base, baseCurrency, overrides, classOverrides])

  const ligadas = Object.keys(overrides).length

  function toggle(slug: string, on: boolean) {
    setSaved(false)
    setOverrides((current) => {
      const next = { ...current }
      if (on) next[slug] = alternate
      else delete next[slug]
      return next
    })
  }

  function handleBase(next: Currency) {
    setSaved(false)
    setBase(next)
    // Trocar a base inverte o sentido de cada seletor ligado: quem estava em
    // dólar por exceção passaria a estar na moeda padrão. Manter o "ligado"
    // significa manter a exceção, então o alvo acompanha.
    setOverrides((current) => {
      const alvo: Currency = next === 'BRL' ? 'USD' : 'BRL'
      return Object.fromEntries(Object.keys(current).map((slug) => [slug, alvo]))
    })
  }

  function handleSave() {
    setSaved(false)
    setError(null)

    startTransition(async () => {
      const result = await savePreferences({
        baseCurrency: base,
        classDisplayCurrency: overrides,
      })

      if (result.ok) {
        setSaved(true)
        router.refresh()
      } else {
        setError(result.error ?? 'Não foi possível salvar.')
      }
    })
  }

  return (
    <Card>
      <h2 className="text-[0.9375rem] font-semibold text-fg">Moeda base</h2>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
        O patrimônio total é sempre somado na moeda base. Cada classe pode ser
        exibida na outra moeda — útil para stocks, cripto ou um imóvel no exterior,
        que você pensa em dólar mesmo morando aqui.
      </p>

      <div className="mt-6 max-w-xs">
        <Field label="Moeda do patrimônio" hint="Todos os totais somam nesta moeda">
          <Select value={base} onChange={(e) => handleBase(e.target.value as Currency)}>
            <option value="BRL">Real brasileiro (BRL)</option>
            <option value="USD">Dólar americano (USD)</option>
          </Select>
        </Field>
      </div>

      <div className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-label uppercase text-fg-subtle">Exibir em {alternate}</h3>
          <span className="text-caption normal-case tracking-normal text-fg-subtle">
            {ligadas === 0
              ? `Tudo em ${base}`
              : `${ligadas} ${ligadas === 1 ? 'classe' : 'classes'} em ${alternate}`}
          </span>
        </div>

        <div className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {ASSET_CLASSES.map((definition) => {
            const Icon = icon(definition.icon)
            const on = Boolean(overrides[definition.slug])

            return (
              <label
                key={definition.slug}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors duration-[180ms] hover:bg-raised"
              >
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-md"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${definition.colorVar} 14%, transparent)`,
                  }}
                >
                  <Icon size={14} strokeWidth={2} style={{ color: definition.colorVar }} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] text-fg">
                    {definition.name}
                  </span>
                  <span className="block text-caption normal-case tracking-normal text-fg-subtle">
                    {on ? alternate : base}
                  </span>
                </span>

                <Switch
                  tone="positive"
                  checked={on}
                  onCheckedChange={(value) => toggle(definition.slug, value)}
                  label={`Exibir ${definition.name} em ${alternate}`}
                />
              </label>
            )
          })}
        </div>
      </div>

      <p className="mt-6 text-caption normal-case leading-relaxed tracking-normal text-fg-subtle">
        {usdBrl
          ? `Câmbio em uso: US$ 1,00 = R$ ${usdBrl}.`
          : 'Câmbio ainda não sincronizado — use "Cotar agora" acima antes de ligar qualquer classe.'}
      </p>

      <div className="mt-5 flex items-center gap-3">
        <Button variant="primary" onClick={handleSave} disabled={!dirty || pending}>
          {pending ? 'Salvando…' : 'Salvar'}
        </Button>

        {saved && !dirty ? (
          <span className="flex items-center gap-1.5 text-[0.8125rem] text-positive">
            <Check size={14} strokeWidth={2.2} />
            Salvo
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-negative/25 bg-negative/10 px-3 py-2 text-[0.8125rem] text-negative">
          {error}
        </p>
      ) : null}

      <div className="mt-6 space-y-2 border-t border-line pt-5 text-caption normal-case leading-relaxed tracking-normal text-fg-subtle">
        <p>
          O ledger continua inteiro em {base}. A conversão é só de exibição, feita com o
          câmbio de hoje sobre o valor e sobre o custo — como os dois mudam na mesma
          proporção, a rentabilidade percentual não muda de moeda para moeda.
        </p>
        <p>
          Uma classe ligada aparece na outra moeda em tudo que for dela: linha do ativo,
          total da classe, carteiras e gráficos daquela página. O patrimônio geral resiste,
          porque soma classes diferentes — e somar moedas distintas daria um número sem
          significado.
        </p>
      </div>
    </Card>
  )
}

function sorted(map: Record<string, string>): [string, string][] {
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
}
