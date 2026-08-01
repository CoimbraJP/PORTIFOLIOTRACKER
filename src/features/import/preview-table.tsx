'use client'

import { AlertTriangle } from 'lucide-react'
import type { ImportedRow } from '@/core/import'
import { cn } from '@/lib/cn'

const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 8 })
const DINHEIRO = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
})

/**
 * O que o sistema entendeu de cada linha, antes de gravar.
 *
 * Mostra as linhas com problema PRIMEIRO. Elas são a razão de esta tela
 * existir, e deixá-las no fim de uma lista de duzentas linhas é o mesmo que
 * escondê-las.
 */
export function PreviewTable({ rows }: { rows: ImportedRow[] }) {
  if (rows.length === 0) return null

  const ordenadas = [...rows].sort((a, b) => peso(b) - peso(a))

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full border-collapse text-[0.8125rem]">
        <thead>
          <tr className="border-b border-line text-label uppercase text-fg-subtle">
            <th className="py-2 pr-3 text-left font-medium">Linha</th>
            <th className="py-2 pr-3 text-left font-medium">Data</th>
            <th className="py-2 pr-3 text-left font-medium">Carteira</th>
            <th className="py-2 pr-3 text-left font-medium">Código</th>
            <th className="py-2 pr-3 text-left font-medium">Op.</th>
            <th className="py-2 pr-3 text-right font-medium">Quantidade</th>
            <th className="py-2 pr-3 text-right font-medium">Preço</th>
            <th className="py-2 text-left font-medium">Situação</th>
          </tr>
        </thead>

        <tbody>
          {ordenadas.map((row) => (
            <tr
              key={`${row.linha}-${row.ocorrencia}`}
              className={cn(
                'border-b border-line/50',
                row.erro && 'bg-negative/[0.06]',
                !row.erro && row.aviso && 'bg-warning/[0.06]',
              )}
            >
              <td className="py-2 pr-3 numeric text-fg-subtle">{row.linha}</td>
              <td className="py-2 pr-3 numeric text-fg">{formatarData(row.date)}</td>
              <td className="py-2 pr-3 text-fg">{row.wallet || '—'}</td>
              <td className="py-2 pr-3 font-medium text-fg">{row.symbol || '—'}</td>
              <td className="py-2 pr-3">
                {row.erro ? (
                  <span className="text-fg-subtle">—</span>
                ) : (
                  <span className={row.side === 'BUY' ? 'text-positive' : 'text-negative'}>
                    {row.side === 'BUY' ? 'Compra' : 'Venda'}
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 numeric text-right text-fg">
                {row.quantity ? NUMERO.format(Number(row.quantity)) : '—'}
              </td>
              <td className="py-2 pr-3 numeric text-right text-fg">
                {row.unitPrice
                  ? `${row.currency === 'USD' ? 'US$' : 'R$'} ${DINHEIRO.format(Number(row.unitPrice))}`
                  : '—'}
              </td>
              <td className="py-2">
                {row.erro ? (
                  <span className="text-negative">{row.erro}</span>
                ) : row.aviso ? (
                  <span className="inline-flex items-start gap-1.5 text-warning">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {row.aviso}
                  </span>
                ) : (
                  <span className="text-fg-subtle">Pronta</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Erro primeiro, depois aviso, depois o resto. */
function peso(row: ImportedRow): number {
  if (row.erro) return 2
  if (row.aviso) return 1
  return 0
}

function formatarData(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}
