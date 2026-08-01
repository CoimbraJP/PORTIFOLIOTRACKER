import type { ImportField, ColumnMap } from './map-rows'
import { normalizar } from './normalize'

/**
 * Tira o sufixo entre parênteses do cabeçalho.
 *
 * Exportador estrangeiro carimba a unidade no nome da coluna: `Date (UTC-3:00)`,
 * `Price (USD)`, `Holdings (USD)`. O miolo é o nome de verdade, e sem cortar o
 * sufixo nada casa por igualdade — sobra só o prefixo, que erra mais.
 */
function semSufixo(texto: string): string {
  return texto.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

/**
 * Nomes de coluna que reconhecemos sozinhos.
 *
 * Cobre o extrato de negociação da B3 e o vocabulário que as pessoas usam nas
 * próprias planilhas. Acerto aqui é conveniência, não correção: o usuário
 * confere e corrige o mapeamento na tela antes de qualquer coisa ser gravada.
 */
const ALIASES: Record<ImportField, string[]> = {
  date: ['data', 'data do negocio', 'data negocio', 'date', 'dt'],
  classSlug: ['classe', 'class', 'categoria', 'tipo de ativo'],
  wallet: ['carteira', 'corretora', 'instituicao', 'banco', 'conta', 'wallet', 'broker'],
  symbol: [
    'codigo',
    'codigo de negociacao',
    'ticker',
    'ativo',
    'papel',
    'symbol',
    'simbolo',
    'token',
    'asset',
    'coin',
  ],
  name: ['nome', 'nome do ativo', 'descricao', 'name'],
  // "tipo" sozinho fica de fora de propósito. No extrato de POSIÇÃO da B3 a
  // coluna "Tipo" é a espécie do papel — ON, PN, UNIT, CI — e `CI` começa com
  // "c", o que faria toda cota de fundo virar uma compra sem ninguém notar.
  side: ['operacao', 'tipo de movimentacao', 'c/v', 'compra/venda', 'side', 'type'],
  quantity: ['quantidade', 'qtd', 'qtde', 'quantity', 'amount', 'units'],
  unitPrice: ['preco unitario', 'preco', 'valor unitario', 'price', 'cotacao', 'unit price'],
  currency: ['moeda', 'currency'],
  rate: ['dolar na data', 'cambio', 'taxa de cambio', 'dolar', 'fx'],
  fees: ['taxas', 'custos', 'corretagem', 'fees', 'emolumentos', 'fee'],
}

/**
 * Cabeçalhos que NUNCA devem ser mapeados, por mais que se pareçam.
 *
 * "Fee Currency" é a moeda da TAXA, não a do negócio — a corretora cobra em BTC
 * uma compra precificada em dólar. Ler uma como a outra converteria o preço
 * inteiro pela moeda errada.
 *
 * "Total value" é preço vezes quantidade. Se ele entrasse como preço unitário,
 * o custo seria multiplicado pela quantidade duas vezes.
 */
const NUNCA: Record<string, ImportField[]> = {
  'fee currency': ['currency'],
  'total value': ['unitPrice'],
  total: ['unitPrice'],
  'valor total': ['unitPrice'],
  // Preço de HOJE, não o preço pago. Gravá-lo como custo de aquisição faria a
  // carteira nascer com lucro zero e assim permanecer — o erro mais silencioso
  // possível, porque o número exibido é plausível.
  'preco de fechamento': ['unitPrice'],
  'ultimo preco': ['unitPrice'],
  'preco atual': ['unitPrice'],
  'valor atualizado': ['unitPrice'],
  // Quantidade livre para negociar não é a quantidade que se possui.
  'quantidade disponivel': ['quantity'],
  'quantidade indisponivel': ['quantity'],
}

/** Sem estes quatro não existe lançamento: não dá para importar nada. */
export const OBRIGATORIOS: ImportField[] = ['date', 'symbol', 'quantity', 'unitPrice']

/**
 * Diz o que impede este arquivo de ser importado — antes de tentar linha a linha.
 *
 * Um extrato de POSIÇÃO da B3 devolve quinze vezes "Data inválida", o que é
 * verdade e não ajuda em nada: o problema não é a data de uma linha, é que o
 * arquivo inteiro descreve o que a pessoa TEM, não o que ela NEGOCIOU. Saldo
 * não tem data de compra nem preço pago, e nenhum ajuste de mapeamento
 * inventaria isso.
 */
export function diagnosticar(headers: string[], mapa: ColumnMap): string | null {
  const faltando = OBRIGATORIOS.filter((campo) => mapa[campo] === undefined)
  if (faltando.length === 0) return null

  const normalizados = headers.map((h) => semSufixo(normalizar(h)))
  const dePosicao = ['quantidade disponivel', 'preco de fechamento', 'valor atualizado']
  const pareceSaldo = dePosicao.filter((c) => normalizados.includes(c)).length >= 2

  if (pareceSaldo) {
    return (
      'Este arquivo é um extrato de POSIÇÃO: ele mostra o que você tem hoje, ' +
      'não os negócios que fez. Falta a data e o preço de compra de cada ' +
      'operação, e o preço de fechamento não serve — ele é de hoje, não do dia ' +
      'em que você comprou. Exporte o extrato de NEGOCIAÇÃO.'
    )
  }

  const nomes: Record<string, string> = {
    date: 'data',
    symbol: 'código do ativo',
    quantity: 'quantidade',
    unitPrice: 'preço unitário',
  }

  return `Não encontrei no arquivo: ${faltando.map((c) => nomes[c] ?? c).join(', ')}.`
}

/**
 * Adivinha o mapeamento a partir dos cabeçalhos.
 *
 * Casa por igualdade antes de casar por prefixo. "Data do Negócio" e "Data de
 * Liquidação" começam igual; sem a preferência pela igualdade exata, a segunda
 * poderia ganhar e a importação inteira sairia com a data errada.
 */
export function guessMapping(headers: string[]): ColumnMap {
  const normalizados = headers.map((h) => semSufixo(normalizar(h)))
  const mapa: ColumnMap = {}
  const proibido = (indice: number, campo: ImportField) =>
    (NUNCA[normalizados[indice] ?? ''] ?? []).includes(campo)

  for (const [campo, apelidos] of Object.entries(ALIASES) as [ImportField, string[]][]) {
    const exato = normalizados.findIndex((h, i) => apelidos.includes(h) && !proibido(i, campo))
    if (exato >= 0) {
      mapa[campo] = exato
      continue
    }

    const parcial = normalizados.findIndex(
      (h, i) => apelidos.some((a) => h.startsWith(a)) && !proibido(i, campo),
    )
    if (parcial >= 0) mapa[campo] = parcial
  }

  return mapa
}
