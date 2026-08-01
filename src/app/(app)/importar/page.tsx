import { Download } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { ImportPanel } from '@/features/import/import-panel'
import { requireTenant } from '@/server/auth/session'

export default async function ImportarPage() {
  await requireTenant()

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Importar"
        description="Traga seu histórico de uma planilha ou do extrato da corretora."
      />

      <div className="space-y-5">
        <ImportPanel />

        <Card>
          <h2 className="text-[0.9375rem] font-semibold text-fg">Não tem um arquivo pronto?</h2>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
            Baixe o modelo, preencha na sua planilha e salve como CSV. Ele já vem com exemplos de
            ação, FII, ativo em dólar, cripto fracionada e venda parcial.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href="/modelo-importacao.csv"
              download
              className="inline-flex items-center gap-2 rounded-md border border-line bg-elevated px-4 py-2.5 text-sm text-fg transition-colors duration-[180ms] hover:border-line-strong"
            >
              <Download className="size-4 text-fg-subtle" aria-hidden />
              Modelo em CSV
            </a>
            <a
              href="/COMO-PREENCHER.md"
              download
              className="inline-flex items-center gap-2 rounded-md border border-line bg-elevated px-4 py-2.5 text-sm text-fg transition-colors duration-[180ms] hover:border-line-strong"
            >
              <Download className="size-4 text-fg-subtle" aria-hidden />
              Instruções
            </a>
          </div>

          <div className="mt-6 border-t border-line pt-5">
            <p className="text-label uppercase text-fg-subtle">Extrato da B3</p>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-fg-subtle">
              Na Área do Investidor, exporte <strong className="text-fg">Negociação</strong> — a
              lista de compras e vendas com data e preço. O extrato de{' '}
              <strong className="text-fg">Posição</strong> (Carteira de Ativos) não serve: ele
              mostra o que você tem hoje, sem a data nem o preço pago, e o preço de fechamento que
              ele traz é o de hoje, não o do dia da compra.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
