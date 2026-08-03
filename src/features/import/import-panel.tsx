'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, FileUp, Pencil, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Select } from '@/components/ui/input'
import { ASSET_CLASSES } from '@/config/asset-classes'
import { commitImport, previewImport, type PreviewResult } from '@/server/actions/import'
import type { ImportReport } from '@/server/import/commit'
import { readTextFile } from '@/lib/read-text-file'
import { PreviewTable, type Correcao } from './preview-table'

interface Arquivo {
  nome: string
  csv: string
  wallet: string
  /** Valores que o usuário corrigiu à mão, por linha da planilha. */
  correcoes: Record<number, Correcao>
}

/**
 * Importação de planilha.
 *
 * O fluxo tem três passos e o do meio é o que importa: nada é gravado antes de
 * o usuário ver, linha por linha, o que o sistema entendeu dos arquivos dele.
 * Depois de gravado, descobrir que a coluna errada virou preço custa desfazer
 * lançamento por lançamento.
 *
 * Vários arquivos de uma vez porque é assim que os dados existem: exportador de
 * corretora e de cripto gera um por conta. Cada arquivo vira uma carteira.
 */
export function ImportPanel() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [arquivos, setArquivos] = useState<Arquivo[]>([])
  const [classSlug, setClassSlug] = useState('acoes-br')
  const [currency, setCurrency] = useState<'BRL' | 'USD'>('BRL')

  const [preview, setPreview] = useState<PreviewResult | null>(null)
  /**
   * A conferência na tela não corresponde mais ao que seria gravado.
   *
   * Marca em vez de apagar: apagar faria a tabela sumir a cada tecla digitada
   * numa correção. Mas o botão de importar fecha — gravar o que está na tela
   * depois de o usuário mudar um valor seria gravar o que ele viu, não o que
   * ele quis.
   */
  const [desatualizado, setDesatualizado] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function payload() {
    return {
      arquivos: arquivos.map((a) => ({
        nome: a.nome,
        csv: a.csv,
        wallet: a.wallet.trim(),
        correcoes: a.correcoes,
      })),
      classSlug,
      currency,
    }
  }

  async function aoEscolher(lista: FileList) {
    const lidos = await Promise.all(
      [...lista].map(async (file) => ({
        nome: file.name,
        csv: await readTextFile(file),
        // O nome do arquivo costuma ser o nome da carteira — é assim que o
        // CoinMarketCap e a maioria das corretoras exportam, um por conta.
        // Sugestão, não decisão: o campo continua editável.
        wallet: sugerirCarteira(file.name),
        correcoes: {},
      })),
    )

    // Acumula em vez de substituir: dá para escolher de pastas diferentes.
    setArquivos((atual) => [
      ...atual,
      ...lidos.filter((novo) => !atual.some((a) => a.nome === novo.nome)),
    ])
    setDesatualizado(true)
    setReport(null)
    setErro(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function renomear(nome: string, wallet: string) {
    setArquivos((atual) => atual.map((a) => (a.nome === nome ? { ...a, wallet } : a)))
    setDesatualizado(true)
  }

  function corrigir(arquivo: string, linha: number, correcao: Correcao) {
    setArquivos((atual) =>
      atual.map((a) =>
        a.nome === arquivo ? { ...a, correcoes: { ...a.correcoes, [linha]: correcao } } : a,
      ),
    )
    setDesatualizado(true)
  }

  function remover(nome: string) {
    setArquivos((atual) => atual.filter((a) => a.nome !== nome))
    setDesatualizado(true)
  }

  function conferir() {
    setErro(null)
    setReport(null)

    startTransition(async () => {
      const resultado = await previewImport(payload())

      if (resultado.ok) {
        setPreview(resultado)
        setDesatualizado(false)
      } else {
        setPreview(null)
        setErro(resultado.error ?? 'Não consegui ler os arquivos.')
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
        setDesatualizado(false)
        setArquivos([])
        router.refresh()
      } else {
        setErro(resultado.error ?? 'Não foi possível importar.')
      }
    })
  }

  const previstos = preview?.arquivos ?? []
  const todas = previstos.filter((a) => !a.bloqueio).flatMap((a) => a.rows)
  const prontas = todas.filter((l) => !l.erro)
  const comErro = todas.filter((l) => l.erro)
  const comAviso = prontas.filter((l) => l.aviso)

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-[0.9375rem] font-semibold text-fg">1. Escolha os arquivos</h2>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
          Um arquivo por carteira — pode selecionar vários de uma vez. CSV da corretora, do
          CoinMarketCap ou da sua própria planilha. O separador e o formato do número são detectados
          sozinhos.
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

          <Field label="Moeda dos preços" className="w-40">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as 'BRL' | 'USD')}>
              <option value="BRL">Real (R$)</option>
              <option value="USD">Dólar (US$)</option>
            </Select>
          </Field>

          <Button onClick={conferir} disabled={arquivos.length === 0 || pending}>
            {pending && !preview ? 'Lendo…' : 'Conferir'}
          </Button>
        </div>

        {arquivos.length > 0 ? (
          <div className="mt-5 space-y-2">
            <p className="text-label uppercase text-fg-subtle">
              {arquivos.length} {arquivos.length === 1 ? 'arquivo' : 'arquivos'} — cada um vira uma
              carteira
            </p>

            {arquivos.map((arquivo) => (
              <div
                key={arquivo.nome}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-elevated/50 px-4 py-3"
              >
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-fg-subtle">
                  {arquivo.nome}
                </span>
                <span className="text-[0.8125rem] text-fg-subtle" aria-hidden>
                  →
                </span>
                <input
                  value={arquivo.wallet}
                  onChange={(e) => renomear(arquivo.nome, e.target.value)}
                  placeholder="Nome da carteira"
                  aria-label={`Carteira de ${arquivo.nome}`}
                  className="h-9 w-56 rounded-md border border-line bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle transition-colors duration-[180ms] hover:border-line-strong focus:border-accent/60 focus:outline-none focus:shadow-[var(--glow-control)]"
                />
                <button
                  type="button"
                  onClick={() => remover(arquivo.nome)}
                  aria-label={`Remover ${arquivo.nome}`}
                  className="rounded-md p-1.5 text-fg-subtle transition-colors duration-[180ms] hover:text-negative"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        ) : null}

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

      {report ? <Relatorio report={report} /> : null}

      {preview ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[0.9375rem] font-semibold text-fg">2. Confira</h2>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
                {prontas.length} {prontas.length === 1 ? 'linha pronta' : 'linhas prontas'}
                {comErro.length > 0 ? `, ${comErro.length} com problema` : ''}
                {comAviso.length > 0 ? `, ${comAviso.length} para conferir` : ''}. Nada foi gravado
                ainda.
              </p>
            </div>

            {desatualizado ? (
              <Button onClick={conferir} disabled={pending}>
                {pending ? 'Lendo…' : 'Conferir de novo'}
              </Button>
            ) : (
              <Button onClick={importar} disabled={prontas.length === 0 || pending}>
                <Upload className="size-4" aria-hidden />
                {pending ? 'Importando…' : `Importar ${prontas.length}`}
              </Button>
            )}
          </div>

          {desatualizado ? (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-accent/25 bg-accent/[0.06] px-4 py-3">
              <Pencil className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              <p className="text-[0.8125rem] leading-relaxed text-fg">
                Você mudou alguma coisa. A tabela abaixo ainda mostra a leitura anterior — confira de
                novo para ver o resultado das correções antes de importar.
              </p>
            </div>
          ) : null}

          {preview.fx ? <AvisoCambio fx={preview.fx} /> : null}

          <div className="mt-6 space-y-8">
            {previstos.map((arquivo) => (
              <section key={arquivo.nome}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-[0.875rem] font-medium text-fg">{arquivo.nome}</h3>
                  {arquivo.moedaDoArquivo && arquivo.moedaDoArquivo !== currency ? (
                    <span className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-caption normal-case tracking-normal text-accent">
                      o arquivo diz {arquivo.moedaDoArquivo === 'USD' ? 'dólar' : 'real'} — foi o que
                      usei
                    </span>
                  ) : null}
                  {arquivo.bloqueio ? null : (
                    <span className="text-[0.8125rem] text-fg-subtle">
                      {arquivo.rows.filter((r) => !r.erro).length} de {arquivo.rows.length}
                    </span>
                  )}
                </div>

                {arquivo.bloqueio ? (
                  <div className="mt-3 flex items-start gap-3 rounded-lg border border-negative/25 bg-negative/[0.06] px-4 py-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden />
                    <p className="text-[0.8125rem] leading-relaxed text-fg">{arquivo.bloqueio}</p>
                  </div>
                ) : (
                  <>
                    {arquivo.reconhecido && arquivo.reconhecido.length > 0 ? (
                      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[0.8125rem] text-fg">
                        {arquivo.reconhecido.map((r) => (
                          <li key={r.campo}>
                            <span className="text-fg-subtle">{r.campo}</span> ← {r.coluna}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <PreviewTable
                      rows={arquivo.rows}
                      correcoes={arquivos.find((a) => a.nome === arquivo.nome)?.correcoes ?? {}}
                      onCorrigir={(linha, correcao) => corrigir(arquivo.nome, linha, correcao)}
                    />
                  </>
                )}
              </section>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  )
}

/**
 * O que houve com a busca de câmbio.
 *
 * Sem isto, uma queda da fonte aparece como vinte linhas dizendo "sem câmbio" —
 * e o usuário conclui que o arquivo dele está errado, quando não está.
 */
function AvisoCambio({
  fx,
}: {
  fx: { fonte: 'bcb' | 'awesomeapi' | null; faltando: number; erro?: string }
}) {
  const NOMES = { bcb: 'Banco Central (PTAX)', awesomeapi: 'AwesomeAPI' } as const

  if (fx.fonte && fx.faltando === 0) {
    return (
      <p className="mt-4 text-[0.8125rem] leading-relaxed text-fg-subtle">
        Câmbio de cada data obtido do {NOMES[fx.fonte]}.
      </p>
    )
  }

  return (
    <div className="mt-4 flex items-start gap-3 rounded-lg border border-warning/25 bg-warning/[0.06] px-4 py-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="text-[0.8125rem] leading-relaxed text-fg">
        <p>
          {fx.fonte
            ? `Faltou o câmbio de ${fx.faltando} ${fx.faltando === 1 ? 'data' : 'datas'}.`
            : 'Não consegui buscar o câmbio histórico.'}{' '}
          As linhas em dólar dessas datas ficam de fora — converter por uma taxa chutada gravaria um
          custo errado para sempre.
        </p>
        {fx.erro ? <p className="mt-1 text-fg-subtle">{fx.erro}</p> : null}
        <p className="mt-1 text-fg-subtle">
          Alternativa: acrescente uma coluna <strong className="text-fg">Dolar na Data</strong> na
          planilha, com a cotação de cada linha. Ela tem prioridade sobre a busca automática.
        </p>
      </div>
    </div>
  )
}

function Relatorio({ report }: { report: ImportReport }) {
  return (
    <Card className="border-positive/25">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
        <div className="text-[0.8125rem] leading-relaxed text-fg">
          <p className="font-medium">
            {report.importados} {report.importados === 1 ? 'lançamento importado' : 'lançamentos importados'}
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
              {report.comErro} {report.comErro === 1 ? 'linha ficou' : 'linhas ficaram'} de fora por
              erro no arquivo.
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

/** `Teste Seguro_transactions.csv` → `Teste Seguro`. */
function sugerirCarteira(nome: string): string {
  return nome
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]?(transactions|transacoes|extrato|negociacao|export)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
}
