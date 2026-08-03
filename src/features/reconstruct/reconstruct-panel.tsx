'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, FileUp, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Select } from '@/components/ui/input'
import { ASSET_CLASSES } from '@/config/asset-classes'
import type { Proposal } from '@/core/reconstruct/to-proposals'
import {
  gravarRelatoriosAnuais,
  lerRelatoriosAnuais,
  type LerAnualResult,
} from '@/server/actions/reconstruct'
import type { ReconstructReport } from '@/server/reconstruct/commit'
import { ProposalRow } from './proposal-row'

interface Arquivo {
  nome: string
  csv: string
}

/**
 * Reconstrução do histórico a partir dos relatórios anuais.
 *
 * Só existe para quem não tem o extrato de negociação. O relatório anual diz o
 * que a pessoa tinha em 31/12 e por quanto aquilo fechou — não o que ela pagou.
 * Tudo aqui é dedução, e a tela inteira é construída em torno disso: cada linha
 * vem com o motivo escrito, as arriscadas vêm destacadas, e nada entra sem
 * alguém passar o olho.
 */
export function ReconstructPanel() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [arquivos, setArquivos] = useState<Arquivo[]>([])
  const [classSlug, setClassSlug] = useState('acoes-br')
  const [wallet, setWallet] = useState('')

  const [leitura, setLeitura] = useState<LerAnualResult | null>(null)
  const [propostas, setPropostas] = useState<Proposal[]>([])
  const [report, setReport] = useState<ReconstructReport | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const porAno = useMemo(() => {
    const grupos = new Map<number, Proposal[]>()
    for (const p of propostas) grupos.set(p.year, [...(grupos.get(p.year) ?? []), p])
    return [...grupos.entries()].sort((a, b) => a[0] - b[0])
  }, [propostas])

  const incluidas = propostas.filter((p) => p.incluir)
  const paraConferir = incluidas.filter((p) => p.confirmar)

  async function aoEscolher(lista: FileList) {
    const lidos = await Promise.all(
      [...lista].map(async (file) => ({ nome: file.name, csv: await file.text() })),
    )

    setArquivos((atual) => [
      ...atual,
      ...lidos.filter((novo) => !atual.some((a) => a.nome === novo.nome)),
    ])
    setLeitura(null)
    setPropostas([])
    setReport(null)
    setErro(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function ler() {
    setErro(null)
    setReport(null)

    startTransition(async () => {
      const resultado = await lerRelatoriosAnuais({ arquivos })

      if (resultado.ok) {
        setLeitura(resultado)
        setPropostas(resultado.propostas ?? [])
      } else {
        setLeitura(resultado)
        setPropostas([])
        setErro(resultado.error ?? 'Não consegui ler os relatórios.')
      }
    })
  }

  function mudar(id: string, mudanca: Partial<Proposal>) {
    setPropostas((atual) => atual.map((p) => (p.id === id ? { ...p, ...mudanca } : p)))
  }

  function gravar() {
    setErro(null)

    startTransition(async () => {
      const resultado = await gravarRelatoriosAnuais({
        classSlug,
        wallet: wallet.trim(),
        propostas: incluidas,
      })

      if (resultado.ok && resultado.report) {
        setReport(resultado.report)
        setPropostas([])
        setLeitura(null)
        setArquivos([])
        router.refresh()
      } else {
        setErro(resultado.error ?? 'Não foi possível gravar.')
      }
    })
  }

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-[0.9375rem] font-semibold text-fg">1. Suba os relatórios anuais</h2>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
          Na Área do Investidor da B3: Relatórios → Relatório Consolidado → período Anual → Excel,
          e salve cada aba como CSV. Suba um ano por vez ou todos de uma vez — o ano é lido do nome
          do arquivo.
        </p>
        <p className="mt-2 text-caption normal-case leading-relaxed tracking-normal text-fg-subtle">
          Se você tiver o extrato de <strong className="text-fg">Negociação</strong>, use ele em vez
          disto: lá estão as compras e vendas com data e preço reais. Esta tela é para quem não tem
          o histórico — ela deduz o que dá e chuta o resto, com o seu aval.
        </p>

        <div className="mt-5 flex flex-wrap items-end gap-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-elevated px-4 py-2.5 text-sm text-fg transition-colors duration-[180ms] hover:border-line-strong">
            <FileUp className="size-4 text-fg-subtle" aria-hidden />
            {arquivos.length > 0 ? 'Adicionar mais' : 'Selecionar arquivos'}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".csv,.txt,text/csv"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.length) void aoEscolher(e.target.files)
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

          <Field label="Carteira" className="w-56">
            <input
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="XP, Rico, Clear…"
              className="h-10 w-full rounded-md border border-line bg-elevated px-3 text-sm text-fg placeholder:text-fg-subtle transition-colors duration-[180ms] hover:border-line-strong focus:border-accent/60 focus:outline-none focus:shadow-[var(--glow-control)]"
            />
          </Field>

          <Button onClick={ler} disabled={arquivos.length < 2 || pending}>
            {pending && propostas.length === 0 ? 'Lendo…' : 'Analisar'}
          </Button>
        </div>

        {arquivos.length > 0 ? (
          <ul className="mt-5 flex flex-wrap gap-2">
            {arquivos.map((a) => (
              <li
                key={a.nome}
                className="inline-flex items-center gap-2 rounded-md border border-line bg-elevated/50 px-3 py-1.5 text-[0.8125rem] text-fg-subtle"
              >
                {a.nome}
                <button
                  type="button"
                  onClick={() => setArquivos((atual) => atual.filter((x) => x.nome !== a.nome))}
                  aria-label={`Remover ${a.nome}`}
                  className="text-fg-subtle transition-colors duration-[180ms] hover:text-negative"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {arquivos.length === 1 ? (
          <p className="mt-4 text-[0.8125rem] text-warning">
            Um ano só não diz o que mudou. A reconstrução vem da diferença entre dois relatórios.
          </p>
        ) : null}
      </Card>

      {erro ? (
        <Card className="border-negative/25">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden />
            <div className="text-[0.8125rem] leading-relaxed text-fg">
              <p>{erro}</p>
              {leitura?.avisos?.map((a) => (
                <p key={a} className="mt-1 text-fg-subtle">
                  {a}
                </p>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      {report ? (
        <Card className="border-positive/25">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
            <div className="text-[0.8125rem] leading-relaxed text-fg">
              <p className="font-medium">
                {report.gravados}{' '}
                {report.gravados === 1 ? 'lançamento reconstruído' : 'lançamentos reconstruídos'}.
              </p>
              {report.repetidos > 0 ? (
                <p className="mt-1 text-fg-subtle">
                  {report.repetidos} já {report.repetidos === 1 ? 'existia' : 'existiam'} e{' '}
                  {report.repetidos === 1 ? 'foi ignorado' : 'foram ignorados'}.
                </p>
              ) : null}
              {report.recusados.map((r) => (
                <p key={`${r.symbol}-${r.year}`} className="mt-1 text-warning">
                  {r.symbol} ({r.year}): {r.motivo}
                </p>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      {propostas.length > 0 ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[0.9375rem] font-semibold text-fg">2. Confira ano a ano</h2>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
                {leitura?.anos?.map((a) => `${a.year}: ${a.ativos}`).join(' · ')}
              </p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
                {incluidas.length} de {propostas.length} marcadas
                {paraConferir.length > 0 ? `, ${paraConferir.length} pedem atenção` : ''}. Nada foi
                gravado ainda.
              </p>
            </div>

            <Button onClick={gravar} disabled={incluidas.length === 0 || !wallet.trim() || pending}>
              <Upload className="size-4" aria-hidden />
              {pending ? 'Gravando…' : `Gravar ${incluidas.length}`}
            </Button>
          </div>

          <div className="mt-4 rounded-lg border border-warning/25 bg-warning/[0.06] px-4 py-3">
            <p className="text-[0.8125rem] leading-relaxed text-fg">
              O preço de cada linha é o <strong>fechamento de 31/12</strong>, não o que você pagou.
              Onde você lembrar do valor real, troque — o campo está aberto. Todo lançamento fica
              marcado como reconstituído no histórico.
            </p>
          </div>

          <div className="mt-6 space-y-8">
            {porAno.map(([year, doAno]) => (
              <section key={year}>
                <h3 className="text-[0.875rem] font-medium text-fg">
                  {year}
                  <span className="ml-2 font-normal text-fg-subtle">
                    {doAno.filter((p) => p.incluir).length} de {doAno.length}
                  </span>
                </h3>

                <div className="mt-2">
                  {doAno.map((p) => (
                    <ProposalRow
                      key={p.id}
                      proposta={p}
                      onMudar={(mudanca) => mudar(p.id, mudanca)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  )
}
