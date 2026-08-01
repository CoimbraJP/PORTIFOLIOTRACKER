'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { listTransferTargets, recordTransaction } from '@/server/actions/transaction'
import type { ManualType } from '@/server/validation/transaction'
import { cn } from '@/lib/cn'

export interface TransactionTarget {
  positionId: string
  symbol: string
  name: string
  walletName: string
  /** Modo da classe: define quais tipos fazem sentido. */
  valuationMode: 'QUANTITATIVE' | 'VALUATED' | 'ACCRUAL'
  supportsDividends: boolean
  quantityLabel: string | null
  /** Nome do nível do meio: "Carteira", "Cidade", "Corretora"… */
  walletTerm: string
}

interface Option {
  type: ManualType
  label: string
}

/**
 * Um diálogo para todos os lançamentos.
 *
 * Cinco modais separados repetiriam data, observações e o fluxo de erro cinco
 * vezes. Aqui o tipo é um seletor, e só os campos dele aparecem.
 *
 * Os tipos oferecidos dependem da classe: imóvel não tem "venda parcial de
 * quantidade", cripto não paga dividendo, e só bem avaliado aceita
 * reavaliação. Mostrar opção impossível seria convidar ao erro.
 */
export function TransactionDialog({
  open,
  onClose,
  target,
}: {
  open: boolean
  onClose: () => void
  target: TransactionTarget | null
}) {
  const router = useRouter()
  const [type, setType] = useState<ManualType>('BUY')
  const [values, setValues] = useState<Record<string, string>>({})
  const [targets, setTargets] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const quantitative = target?.valuationMode === 'QUANTITATIVE'

  useEffect(() => {
    if (!open || !target) return
    setType('BUY')
    setValues({ occurredAt: new Date().toISOString().slice(0, 10) })
    setError(null)

    if (quantitative) {
      listTransferTargets(target.positionId).then(setTargets).catch(() => setTargets([]))
    } else {
      setTargets([])
    }
  }, [open, target, quantitative])

  if (!target) return null

  const options: Option[] = [
    { type: 'BUY', label: quantitative ? 'Compra' : 'Aporte' },
    { type: 'SELL', label: quantitative ? 'Venda' : 'Baixa' },
    ...(quantitative && targets.length > 1
      ? [{ type: 'TRANSFER' as const, label: 'Transferência' }]
      : []),
    ...(target.supportsDividends
      ? [
          { type: 'DIVIDEND' as const, label: 'Dividendo' },
          { type: 'JCP' as const, label: 'JCP' },
        ]
      : []),
    ...(target.valuationMode === 'VALUATED'
      ? [
          { type: 'RENT' as const, label: 'Aluguel' },
          { type: 'VALUATION' as const, label: 'Reavaliação' },
        ]
      : []),
    ...(target.valuationMode === 'ACCRUAL'
      ? [
          { type: 'INTEREST' as const, label: 'Juros recebidos' },
          { type: 'VALUATION' as const, label: 'Novo saldo' },
        ]
      : []),
    ...(target.valuationMode === 'QUANTITATIVE' && !target.supportsDividends
      ? [{ type: 'STAKING' as const, label: 'Staking' }]
      : []),
  ]

  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }))

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const payload: Record<string, unknown> = {
      type,
      positionId: target!.positionId,
      occurredAt: values.occurredAt,
      notes: values.notes || undefined,
    }

    if (type === 'BUY' || type === 'SELL') {
      // Bem único não tem quantidade: o lançamento é sempre de 1.
      payload.quantity = quantitative ? values.quantity : '1'
      payload.unitPrice = values.unitPrice
      payload.fees = values.fees ?? ''
      payload.taxes = values.taxes ?? ''
    } else if (type === 'TRANSFER') {
      payload.quantity = values.quantity
      payload.targetWalletId = values.targetWalletId
      payload.fees = values.fees ?? ''
    } else if (type === 'VALUATION') {
      payload.value = values.value
    } else {
      payload.grossAmount = values.grossAmount
      payload.taxes = values.taxes ?? ''
    }

    startTransition(async () => {
      const result = await recordTransaction(payload)
      if (result.ok) {
        onClose()
        router.refresh()
      } else {
        setError(result.error ?? 'Não foi possível lançar.')
      }
    })
  }

  const isTrade = type === 'BUY' || type === 'SELL'
  const isIncome = ['DIVIDEND', 'JCP', 'INCOME', 'RENT', 'INTEREST', 'STAKING'].includes(type)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Lançamento · ${target.symbol}`}
      description={`${target.name} · ${target.walletName}`}
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => (
            <button
              key={option.type}
              type="button"
              onClick={() => setType(option.type)}
              className={cn(
                'rounded-sm border px-3 py-1.5 text-[0.8125rem] transition-colors duration-[180ms]',
                type === option.type
                  ? 'border-accent/40 bg-accent/12 text-accent'
                  : 'border-line text-fg-subtle hover:border-line-strong hover:text-fg-muted',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {isTrade ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {quantitative ? (
              <Field label={target.quantityLabel ?? 'Quantidade'}>
                <Input
                  inputMode="decimal"
                  value={values.quantity ?? ''}
                  onChange={(e) => set('quantity', e.target.value)}
                  placeholder="0,00"
                />
              </Field>
            ) : null}

            <Field label={quantitative ? 'Preço unitário' : 'Valor'}>
              <Input
                inputMode="decimal"
                value={values.unitPrice ?? ''}
                onChange={(e) => set('unitPrice', e.target.value)}
                placeholder="0,00"
              />
            </Field>

            <Field label="Taxas" hint="Corretagem, rede — entram no custo">
              <Input
                inputMode="decimal"
                value={values.fees ?? ''}
                onChange={(e) => set('fees', e.target.value)}
                placeholder="0,00"
              />
            </Field>

            {type === 'SELL' ? (
              <Field label="Imposto retido">
                <Input
                  inputMode="decimal"
                  value={values.taxes ?? ''}
                  onChange={(e) => set('taxes', e.target.value)}
                  placeholder="0,00"
                />
              </Field>
            ) : null}
          </div>
        ) : null}

        {type === 'TRANSFER' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={target.quantityLabel ?? 'Quantidade'}>
              <Input
                inputMode="decimal"
                value={values.quantity ?? ''}
                onChange={(e) => set('quantity', e.target.value)}
                placeholder="0,00"
              />
            </Field>

            <Field
              label={`${target.walletTerm} de destino`}
              hint="O preço médio vai junto — transferir não gera lucro"
            >
              <Select
                value={values.targetWalletId ?? ''}
                onChange={(e) => set('targetWalletId', e.target.value)}
              >
                <option value="">Selecione</option>
                {targets.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}

        {isIncome ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor bruto">
              <Input
                inputMode="decimal"
                value={values.grossAmount ?? ''}
                onChange={(e) => set('grossAmount', e.target.value)}
                placeholder="0,00"
              />
            </Field>

            <Field label="Imposto retido" hint={type === 'JCP' ? 'IR de 15% no JCP' : 'Se houver'}>
              <Input
                inputMode="decimal"
                value={values.taxes ?? ''}
                onChange={(e) => set('taxes', e.target.value)}
                placeholder="0,00"
              />
            </Field>
          </div>
        ) : null}

        {type === 'VALUATION' ? (
          <Field
            label="Valor atual"
            hint="Não passa pelo ledger: é uma opinião de valor, não um fato econômico"
          >
            <Input
              inputMode="decimal"
              value={values.value ?? ''}
              onChange={(e) => set('value', e.target.value)}
              placeholder="0,00"
            />
          </Field>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data" hint="Do fato, não do cadastro">
            <Input
              type="date"
              value={values.occurredAt ?? ''}
              onChange={(e) => set('occurredAt', e.target.value)}
            />
          </Field>

          <Field label="Observações" hint="Opcional">
            <Input
              value={values.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Nota de corretagem 1234"
            />
          </Field>
        </div>

        {error ? (
          <p className="rounded-md border border-negative/25 bg-negative/10 px-3 py-2 text-[0.8125rem] text-negative">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Lançando…' : 'Lançar'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
