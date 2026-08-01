'use client'

import { AlertTriangle, Pencil } from 'lucide-react'
import type { ImportedRow } from '@/core/import'
import { cn } from '@/lib/cn'

const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 8 })
const DINHEIRO = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
})

export type Correcao = { unitPrice?: string; quantity?: string }

/**
 * O que o sistema entendeu de cada linha, antes de gravar.
 *
 * Mostra as linhas com problema PRIMEIRO. Elas são a razão de esta tela
 * existir, e deixá-las no fim de uma lista de duzentas linhas é o mesmo que
 * escondê-las.
 *
 * Quantidade e preço são editáveis nas linhas marcadas. O arquivo veio de um
 * exportador que erra e o usuário não vai abrir o CSV no bloco de notas para
 * consertar uma célula — sem isso, a única saída seria descartar a linha e
 * perder um negócio que existiu.
 */
export function PreviewTable({
  rows,
  correcoes,
  onCorrigir,
}: {
  rows: ImportedRow[]
  correcoes: Record<number, Correcao>
  onCorrigir: (linha: number, correcao: Correcao) => void
}) {
  if (rows.length === 0) return null

  const ordenadas = [...rows].sort((a, b) => peso(b) - peso(a))

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-[0.8125rem]">
        <thead>
          <tr className="border-b border-line text-label uppercase text-fg-subtle">
            <th className="py-2 pr-3 text-left font-medium">Linha</th>
            <th className="py-2 pr-3 text-left font-medium">Data</th>
            <th className="py-2 pr-3 text-left font-medium">Código</th>
            <th className="py-2 pr-3 text-left font-medium">Op.</th>
            <th className="py-2 pr-3 text-right font-medium">Quantidade</th>
            <th className="py-2 pr-3 text-right font-medium">Preço</th>
            <th className="py-2 text-left font-medium">Situação</th>
          </tr>
        </thead>

        <tbody>
          {ordenadas.map((row) => {
            const editavel = podeCorrigir(row)
            const correcao = correcoes[row.linha] ?? {}

            return (
              <tr
                key={`${row.linha}-${row.ocorrencia}`}
                className={cn(
                  'border-b border-line/50',
                  row.erro && 'bg-negative/[0.06]',
                  !row.erro && row.aviso && 'bg-warning/[0.06]',
                  !row.erro && !row.aviso && row.corrigido && 'bg-positive/[0.05]',
                )}
              >
                <td className="py-2 pr-3 numeric text-fg-subtle">{row.linha}</td>
                <td className="py-2 pr-3 numeric text-fg">{formatarData(row.date)}</td>
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

                <td className="py-2 pr-3 text-right">
                  {editavel ? (
                    <CampoCorrecao
                      valor={correcao.quantity ?? ''}
                      original={row.quantity ? NUMERO.format(Number(row.quantity)) : ''}
                      rotulo={`Quantidade da linha ${row.linha}`}
                      onChange={(v) => onCorrigir(row.linha, { ...correcao, quantity: v })}
                    />
                  ) : (
                    <span className="numeric text-fg">
                      {row.quantity ? NUMERO.format(Number(row.quantity)) : '—'}
                    </span>
                  )}
                </td>

                <td className="py-2 pr-3 text-right">
                  {editavel ? (
                    <CampoCorrecao
                      valor={correcao.unitPrice ?? ''}
                      original={row.unitPrice ? DINHEIRO.format(Number(row.unitPrice)) : ''}
                      prefixo={row.currency === 'USD' ? 'US$' : 'R$'}
                      rotulo={`Preço da linha ${row.linha}`}
                      onChange={(v) => onCorrigir(row.linha, { ...correcao, unitPrice: v })}
                    />
                  ) : (
                    <span className="numeric text-fg">
                      {row.unitPrice
                        ? `${row.currency === 'USD' ? 'US$' : 'R$'} ${DINHEIRO.format(Number(row.unitPrice))}`
                        : '—'}
                    </span>
                  )}
                </td>

                <td className="py-2">
                  <Situacao row={row} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Campo de correção, com o valor do arquivo como marca-d'água.
 *
 * Vazio significa "usar o que veio no arquivo". Pré-preencher com o valor lido
 * faria toda linha marcada parecer corrigida, e a nota de auditoria registraria
 * uma correção que nunca houve.
 */
function CampoCorrecao({
  valor,
  original,
  prefixo,
  rotulo,
  onChange,
}: {
  valor: string
  original: string
  prefixo?: string
  rotulo: string
  onChange: (valor: string) => void
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {prefixo ? <span className="text-fg-subtle">{prefixo}</span> : null}
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={original}
        aria-label={rotulo}
        inputMode="decimal"
        className="numeric h-8 w-36 rounded-md border border-line bg-surface px-2 text-right text-sm text-fg placeholder:text-fg-subtle transition-colors duration-[180ms] hover:border-line-strong focus:border-accent/60 focus:outline-none focus:shadow-[var(--glow-control)]"
      />
    </span>
  )
}

function Situacao({ row }: { row: ImportedRow }) {
  if (row.erro) return <span className="text-negative">{row.erro}</span>

  if (row.aviso) {
    return (
      <span className="inline-flex items-start gap-1.5 text-warning">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {row.aviso}
      </span>
    )
  }

  if (row.corrigido) {
    return (
      <span className="inline-flex items-start gap-1.5 text-positive">
        <Pencil className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Corrigida — arquivo dizia {row.corrigido.map((c) => `"${c.de}"`).join(' e ')}
      </span>
    )
  }

  return <span className="text-fg-subtle">Pronta</span>
}

/**
 * Quais linhas ganham campo de edição.
 *
 * Só as que o sistema apontou. Liberar a tabela inteira convidaria a "ajustar"
 * um extrato que está certo — e a fonte da verdade é o arquivo da corretora,
 * não a memória de quem importa.
 */
function podeCorrigir(row: ImportedRow): boolean {
  if (row.aviso || row.corrigido) return true
  return Boolean(row.erro && /^(Preço|Quantidade)/.test(row.erro))
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
