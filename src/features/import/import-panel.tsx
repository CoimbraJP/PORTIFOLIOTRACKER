'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, FileUp, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Select } from '@/components/ui/input'
import { ASSET_CLASSES } from '@/config/asset-classes'
import type { ImportedRow } from '@/core/import'
import { commitImport, previewImport, type PreviewResult } from '@/server/actions/import'
import type { ImportReport } from '@/server/import/commit'
import { PreviewTable } from './preview-table'

/**
 * Importação de planilha.
 *
 * O fluxo tem três passos e o do meio é o que importa: nada é gravado antes de
 * o usuário ver, linha por linha, o que o sistema entendeu do arquivo dele.
 * Depois de gravado, descobrir que a coluna errada virou preço custa desfazer
 * lançamento por lançamento.
 */
export function ImportPanel() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [csv, setCsv] = useState('')
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [classSlug, setClassSlug] = useState('acoes-br')
  const [currency, setCurrency] = useState<'BRL' | 'USD'>('BRL')
  const [wallet, setWallet] = useState('')

  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function payload() {
    return { csv, classSlug, wallet: wallet.trim() || undefined, currency }
  }

  async function aoEscolherArquivo(file: File) {
    const texto = await file.text()
    setCsv(texto)
    setNomeArquivo(file.name)
    setPreview(null)
    setReport(null)
    setErro(null)

    // O nome do arquivo costuma ser o nome da carteira — é assim que o
    // CoinMarketCap e a maioria das corretoras exportam, um arquivo por conta.
    // Sugestão, não decisão: o campo continua editável.
    if (!wallet.trim()) setWallet(file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').trim())
  }

  function conferir() {
    setErro(null)
    setReport(null)

    startTransition(async () => {
      const resultado = await previewImport(payload())
      if (resultado.ok) setPreview(resultado)
      else {
        setPreview(null)
        setErro(resultado.error ?? 'Não consegui ler o arquivo.')
      }
    })
  }

  function importar() {
    setErro(null)

    startTransition(async () => {
      const resultado = await commitImport(payload())

      if (resultado.ok && resultado.report) {
        setReport(resultado.report)
        setPreview(null)
        setCsv('')
        setNomeArquivo('')
        if (inputRef.current) inputRef.current.value = ''
        router.refresh()
      } else {
        setErro(resultado.error ?? 'Não foi possível importar.')
      }
    })
  }

  const linhas = preview?.rows ?? []
  const boas = linhas.filter((l) => !l.erro)
  const ruins = linhas.filter((l) => l.erro)
  const avisos = boas.filter((l) => l.aviso)

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-[0.9375rem] font-semibold text-fg">1. Escolha o arquivo</h2>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
          CSV exportado da corretora, do CoinMarketCap ou da sua própria planilha. Aceita ponto e
          vírgula ou vírgula, número em português ou em inglês — o formato é detectado sozinho.
        </p>

        <div className="mt-5 flex flex-wrap items-end gap-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-elevated px-4 py-2.5 text-sm text-fg transition-colors duration-[180ms] hover:border-line-strong">
            <FileUp className="size-4 text-fg-subtle" aria-hidden />
            {nomeArquivo || 'Selecionar arquivo'}
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.txt,text/csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void aoEscolherArquivo(file)
              }}
            />
          </label>

          <Field label="Classe dos ativos" className="w-56">
            <Select value={classSlug} onChange={(e) => setClassSlug(e.target.value)}>
              {ASSET_CLASSES.map((classe) => (
                <option key={classe.slug} value={classe.slug}>
                  {classe.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Carteira"
            hint="Usada nas linhas que não trazem a coluna"
            className="w-56"
          >
            <input
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="XP, Binance, Ledger…"
              className="h-10 w-full rounded-md border border-line bg-elevated px-3 text-sm text-fg placeholder:text-fg-subtle transition-colors duration-[180ms] hover:border-line-strong focus:border-accent/60 focus:outline-none focus:shadow-[var(--glow-control)]"
            />
          </Field>

          <Field label="Moeda dos preços" className="w-40">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as 'BRL' | 'USD')}>
              <option value="BRL">Real (R$)</option>
              <option value="USD">Dólar (US$)</option>
            </Select>
          </Field>

          <Button onClick={conferir} disabled={!csv || pending}>
            {pending && !preview ? 'Lendo…' : 'Conferir'}
          </Button>
        </div>

        {currency === 'USD' ? (
          <p className="mt-4 text-[0.8125rem] leading-relaxed text-fg-subtle">
            O câmbio de cada data é buscado automaticamente. Um ativo comprado em 2024 custou o
            dólar de 2024 — converter pelo de hoje reescreveria o custo e, com ele, todo o lucro.
          </p>
        ) : null}
      </Card>

      {erro ? (
        <Card className="border-negative/25">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden />
            <p className="text-[0.8125rem] leading-relaxed text-fg">{erro}</p>
          </div>
        </Card>
      ) : null}

      {report ? (
        <Card className="border-positive/25">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
            <div className="text-[0.8125rem] leading-relaxed text-fg">
              <p className="font-medium">
                {report.importados} {report.importados === 1 ? 'lançamento' : 'lançamentos'}{' '}
                {report.importados === 1 ? 'importado' : 'importados'}
                {report.carteiras.length > 0 ? ` em ${report.carteiras.join(', ')}` : ''}.
              </p>
              {report.repetidos > 0 ? (
                <p className="mt-1 text-fg-subtle">
                  {report.repetidos} já {report.repetidos === 1 ? 'estava' : 'estavam'} no sistema e{' '}
                  {report.repetidos === 1 ? 'foi ignorado' : 'foram ignorados'}.
                </p>
              ) : null}
              {report.comErro > 0 ? (
                <p className="mt-1 text-fg-subtle">
                  {report.comErro} {report.comErro === 1 ? 'linha ficou' : 'linhas ficaram'} de fora
                  por erro no arquivo.
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {preview ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[0.9375rem] font-semibold text-fg">2. Confira</h2>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
                {boas.length} {boas.length === 1 ? 'linha pronta' : 'linhas prontas'}
                {ruins.length > 0 ? `, ${ruins.length} com problema` : ''}
                {avisos.length > 0 ? `, ${avisos.length} para conferir` : ''}. Nada foi gravado
                ainda.
              </p>
            </div>

            <Button onClick={importar} disabled={boas.length === 0 || pending}>
              <Upload className="size-4" aria-hidden />
              {pending ? 'Importando…' : `Importar ${boas.length}`}
            </Button>
          </div>

          {preview.reconhecido && preview.reconhecido.length > 0 ? (
            <div className="mt-5 rounded-lg border border-line bg-elevated/50 p-4">
              <p className="text-label uppercase text-fg-subtle">Colunas reconhecidas</p>
              <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5 text-[0.8125rem] text-fg">
                {preview.reconhecido.map((r) => (
                  <li key={r.campo}>
                    <span className="text-fg-subtle">{r.campo}</span> ← {r.coluna}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <PreviewTable rows={linhas} />
        </Card>
      ) : null}
    </div>
  )
}

