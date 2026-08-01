import { AlertTriangle } from 'lucide-react'

/**
 * Avisa quais ativos estão sem cotação.
 *
 * Sem preço, a posição aparece valendo o que custou — lucro zero. Isso é
 * conservador e melhor do que inventar valor, mas o usuário precisa SABER, ou
 * vai achar que o ativo não rendeu nada. Silenciar aqui seria mentir por
 * omissão sobre o número mais importante da tela.
 */
export function MissingQuotesNotice({ symbols }: { symbols: string[] }) {
  if (symbols.length === 0) return null

  const lista = symbols.slice(0, 6).join(', ')
  const resto = symbols.length - 6

  return (
    <div className="flex items-start gap-3 rounded-md border border-warning/25 bg-warning/10 px-4 py-3">
      <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-warning" />
      <div>
        <p className="text-[0.8125rem] font-medium text-warning">
          {symbols.length === 1 ? 'Um ativo sem cotação' : `${symbols.length} ativos sem cotação`}
        </p>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-muted">
          {lista}
          {resto > 0 ? ` e mais ${resto}` : ''} — estão avaliados pelo preço de compra, então
          aparecem sem lucro nem prejuízo. Ativos de mercado costumam resolver com{' '}
          <strong className="font-medium text-fg">Atualizar cotações</strong>, em Configurações.
          Imóveis, empresas e itens únicos precisam de uma reavaliação registrada — eles não têm
          cotação de mercado.
        </p>
      </div>
    </div>
  )
}
