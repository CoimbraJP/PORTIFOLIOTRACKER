/**
 * Reconstrução de histórico a partir de fotos anuais.
 *
 * O relatório consolidado da B3 diz o que a pessoa TINHA em 31/12 e por quanto
 * aquilo fechou naquele dia. Não diz quando comprou nem por quanto. Comparar o
 * relatório de um ano com o do anterior revela o que mudou — e só isso.
 *
 * Este módulo produz PROPOSTAS, nunca lançamentos prontos. A diferença importa:
 * um custo de aquisição deduzido de um preço de fechamento é uma estimativa, e
 * estimativa que entra no ledger sem alguém confirmar vira patrimônio inventado
 * (CLAUDE.md §2.2).
 */

/** O que uma linha do relatório anual diz sobre um ativo. */
export interface SnapshotItem {
  symbol: string
  name: string
  /**
   * CNPJ da empresa ou do fundo, como o relatório traz.
   *
   * É a chave que identifica o EMISSOR, e ela não muda quando o ticker muda.
   * VVAR3, VIIA3 e BHIA3 são o mesmo CNPJ: uma empresa que trocou de nome duas
   * vezes e fez um grupamento. Sem isso, a única pista de troca de código é a
   * quantidade coincidir — e coincidência acontece: numa carteira real, VIIA3
   * saiu com 1000 no mesmo ano em que WIZC3 entrou com 1000, e são empresas
   * sem nenhuma relação.
   *
   * Vazio em BDR, que o relatório não identifica por CNPJ.
   */
  issuer: string
  quantity: string
  /** Fechamento de 31/12 daquele ano. É o único preço que o arquivo tem. */
  closingPrice: string
  /** Ação, FII ou o que a aba disser. */
  kind: 'ACAO' | 'FUNDO'
}

/** Uma foto anual inteira. */
export interface YearSnapshot {
  year: number
  items: SnapshotItem[]
}

/**
 * O que o sistema achou que aconteceu entre duas fotos.
 *
 * `ENTRADA` e `SAIDA` são o diff cru. Os outros são leituras de um par de
 * mudanças que, juntas, contam outra história — e cada um deles existe porque
 * tratá-lo como compra ou venda destruiria o custo de aquisição.
 */
export type MovementKind =
  | 'ENTRADA'
  | 'AUMENTO'
  | 'REDUCAO'
  | 'SAIDA'
  /** Mesma quantidade sai de um ticker e entra em outro: trocou de nome. */
  | 'RENOMEACAO'
  /** Quantidade cresce sem dinheiro novo — Itaúsa e Alupar fazem todo ano. */
  | 'BONIFICACAO'
  /** Quantidade muda por fator redondo no mesmo ticker. */
  | 'DESDOBRAMENTO'
  | 'GRUPAMENTO'
  /** Um ticker vira outro em proporção diferente de 1:1. */
  | 'INCORPORACAO'

export interface Movement {
  year: number
  kind: MovementKind
  symbol: string
  name: string
  /** Quantidade que mudou. Sempre positiva. */
  quantity: string
  /** Fechamento de 31/12 do ano, quando serve de referência de preço. */
  referencePrice: string
  /** No caso de troca de ticker, de onde veio. */
  fromSymbol?: string
  /** Razão do desdobramento, grupamento ou incorporação. */
  ratio?: string
  /**
   * Por que o sistema acha que é isto, em português.
   *
   * Vai para a tela ao lado da proposta. Sem o motivo, aceitar ou recusar vira
   * chute — e quem conhece a carteira é a única pessoa capaz de decidir.
   */
  motivo: string
  /**
   * `true` quando a leitura é um palpite que muda o custo se estiver errada.
   *
   * Bonificação lida como compra infla o custo; troca de nome lida como
   * venda + compra cria lucro realizado que nunca houve. Estes vêm marcados.
   */
  confirmar: boolean
}
