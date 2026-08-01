'use client'

import { AlertTriangle } from 'lucide-react'
import { AssetAvatar } from '@/components/data/asset-avatar'
import type { AssetClassSlug } from '@/core/types/portfolio'
import { parseDecimalInput } from '@/core/money/parse'

export interface PositionDraft {
  symbol: string
  name: string
  walletLabel: string
  walletTerm: string
  quantity: string
  quantityLabel: string | null
  unitCost: string
  unitCostLabel: string
  entryCurrency: 'BRL' | 'USD'
  entryRate: string
  classSlug: AssetClassSlug
  /** Ticker que o catálogo não conhece. Vira aviso, não bloqueio. */
  unknownTicker: boolean
}

/**
 * Confirmação antes de gravar.
 *
 * Existe por causa de um prejuízo concreto: um câmbio lido como 50.800 em vez
 * de 5,08 multiplicou um aporte por dez mil, e nada na tela deu chance de
 * perceber antes. Um resumo com os números POR EXTENSO — quantidade, preço
 * unitário, câmbio e o total que vai ser gravado — transforma um erro invisível
 * num erro óbvio.
 *
 * Só mostra o que foi interpretado, nunca o que foi digitado: se o parser
 * entendeu diferente do que a pessoa quis dizer, é aqui que a diferença
 * aparece.
 */
export function PositionSummary({ draft }: { draft: PositionDraft }) {
  const moeda = draft.entryCurrency === 'USD' ? 'US$' : 'R$'
  const quantidade = Number(parseDecimalInput(draft.quantity)) || 1
  const custo = Number(parseDecimalInput(draft.unitCost)) || 0
  const taxa = draft.entryCurrency === 'USD' ? Number(parseDecimalInput(draft.entryRate)) || 0 : 1

  const totalNaMoeda = quantidade * custo
  const totalEmReais = totalNaMoeda * taxa

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-line bg-raised/40 px-4 py-3">
        <AssetAvatar
          symbol={draft.symbol}
          name={draft.name || draft.symbol}
          logoUrl={null}
          classSlug={draft.classSlug}
          size={34}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{draft.symbol}</p>
          <p className="truncate text-caption normal-case tracking-normal text-fg-subtle">
            {draft.name || 'Sem nome'} · {draft.walletTerm}: {draft.walletLabel}
          </p>
        </div>
      </div>

      <dl className="divide-y divide-line">
        {draft.quantityLabel ? (
          <Linha rotulo={draft.quantityLabel} valor={formatarNumero(quantidade)} />
        ) : null}

        <Linha
          rotulo={draft.unitCostLabel}
          valor={`${moeda} ${formatarDinheiro(custo)}`}
          destaque
        />

        {draft.entryCurrency === 'USD' ? (
          <Linha rotulo="Dólar na data da compra" valor={`R$ ${formatarDinheiro(taxa, 4)}`} />
        ) : null}

        {draft.quantityLabel && draft.entryCurrency === 'USD' ? (
          <Linha rotulo="Total em dólar" valor={`US$ ${formatarDinheiro(totalNaMoeda)}`} />
        ) : null}

        {/* O total em reais é o número que vai para o patrimônio. É ele que
            precisa fazer sentido para quem está confirmando. */}
        <Linha
          rotulo="Vai ser gravado como"
          valor={`R$ ${formatarDinheiro(totalEmReais)}`}
          destaque
        />
      </dl>

      {draft.unknownTicker ? (
        <p className="flex items-start gap-2.5 rounded-md border border-warning/25 bg-warning/10 px-3 py-2.5 text-[0.8125rem] leading-relaxed text-warning">
          <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-medium">{draft.symbol}</strong> não está no catálogo. Confira o
            código — se estiver certo, pode confirmar; o ativo será cadastrado só na sua conta e
            ficará sem cotação automática.
          </span>
        </p>
      ) : null}
    </div>
  )
}

function Linha({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: string
  destaque?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-[0.8125rem] text-fg-subtle">{rotulo}</dt>
      <dd
        className={
          destaque
            ? 'numeric text-[0.9375rem] font-semibold text-fg'
            : 'numeric text-[0.8125rem] text-fg-muted'
        }
      >
        {valor}
      </dd>
    </div>
  )
}

function formatarDinheiro(valor: number, casas = 2): string {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

function formatarNumero(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 10 })
}
