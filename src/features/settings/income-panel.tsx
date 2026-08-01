import { Info } from 'lucide-react'
import { Card } from '@/components/ui/card'

/**
 * O que é buscado automaticamente, e o que não é.
 *
 * Server Component sem estado: é informação, não ação. O botão de buscar vive
 * na tela de Renda passiva, junto do resultado — separar os dois faria o
 * usuário clicar aqui e ir procurar o efeito em outro lugar.
 */
export function IncomePanel() {
  return (
    <Card>
      <h2 className="text-[0.9375rem] font-semibold text-fg">Proventos</h2>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
        Dividendos e JCP de ações e ETFs da B3 vêm da BRAPI; dividendos de stocks e ETFs
        internacionais, da Twelve Data. O valor é apurado pela quantidade que você tinha na
        data-com de cada evento — você nunca cadastra provento na mão. A busca fica na tela de
        Renda passiva.
      </p>

      <div className="mt-4 flex items-start gap-2.5 rounded-md border border-line bg-raised/40 px-3 py-2.5">
        <Info size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-fg-subtle" />
        <p className="text-[0.8125rem] leading-relaxed text-fg-muted">
          <strong className="font-medium text-fg">Rendimentos de FII ficam de fora por ora.</strong>{' '}
          A BRAPI serve os informes mensais de fundos imobiliários por uma rota dedicada, que exige
          plano Pro. Enquanto isso, os rendimentos de FII podem ser lançados manualmente pelo botão
          de lançamento do ativo. Assinar o plano liga a busca automática sem nenhuma mudança de
          código.
        </p>
      </div>
    </Card>
  )
}
