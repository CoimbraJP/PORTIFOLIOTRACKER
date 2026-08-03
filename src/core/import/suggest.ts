import type { ImportedRow } from './map-rows'

/** Preço de mercado de hoje, por símbolo, na mesma moeda do arquivo. */
export type Ancoras = Record<string, string>

/**
 * Propõe o preço certo para a linha que veio multiplicada.
 *
 * O defeito é do exportador e tem assinatura própria. Quando um negócio é
 * lançado no CoinMarketCap DENOMINADO em outra cripto — comprar ETH pagando em
 * BTC —, o CSV sai com o preço multiplicado pela cotação daquela cripto em vez
 * de dividido. Duas linhas do mesmo arquivo:
 *
 *     ETH  5,5     a 146.750.446,05   ->  correto 2.341,69
 *     BTC  0,4568  a 2.727.503.020,45 ->  correto 43.522,74
 *
 * As duas divididas pelo MESMO número, 62.668, que era o preço do bitcoin. E o
 * número anda: exportar de novo no dia seguinte muda os dois valores na mesma
 * proporção. É isso que identifica o padrão com segurança — não é um dígito a
 * mais, é uma multiplicação por um preço de mercado.
 *
 * Por isso a coluna "Fee Currency" importa aqui: ela nomeia a cripto em que o
 * negócio foi denominado, e é o divisor.
 *
 * SUGERE, não corrige. O divisor é a cotação de HOJE, e a do dia da exportação
 * era outra — a conta chega perto, não exata. Custo de aquisição aproximado é
 * exatamente o tipo de número que este sistema se recusa a gravar sozinho
 * (CLAUDE.md §2.2): fica plausível e ninguém confere depois. Quem confirma é o
 * dono do dinheiro, no campo de correção.
 */
export function sugerirCorrecoes(rows: ImportedRow[], ancoras: Ancoras): ImportedRow[] {
  const normal = faixaNormal(rows)
  if (!normal) return rows

  return rows.map((row) => {
    if (row.erro || !row.aviso || row.corrigido) return row

    const ancora = ancoras[row.denominacao]
    if (!ancora) return row

    const divisor = Number(ancora)
    if (!Number.isFinite(divisor) || divisor <= 0) return row

    const proposto = Number(row.unitPrice) / divisor
    if (!Number.isFinite(proposto) || proposto <= 0) return row

    // Só sugere se a divisão realmente resolver. Uma linha que continua fora de
    // escala depois da conta não era este defeito, e oferecer um número quase
    // certo para um problema que não entendemos é pior que não oferecer nada.
    const total = proposto * Number(row.quantity)
    if (total > normal) return row

    return {
      ...row,
      sugestao: {
        unitPrice: proposto.toFixed(casas(proposto)),
        motivo: `O arquivo multiplicou este preço pela cotação do ${row.denominacao}`,
      },
    }
  })
}

/**
 * Até quanto o total de uma linha é normal neste arquivo.
 *
 * Mesma mediana que marca a linha absurda, com folga maior: aqui a pergunta não
 * é "isto é estranho?", é "a correção deixou de ser estranha?".
 */
function faixaNormal(rows: ImportedRow[]): number | null {
  const totais = rows
    .filter((r) => !r.erro && !r.aviso)
    .map((r) => Number(r.quantity) * Number(r.unitPrice))
    .filter((v) => v > 0)
    .sort((a, b) => a - b)

  if (totais.length < 3) return null

  return totais[Math.floor(totais.length / 2)]! * 1000
}

/** Cripto barata precisa de mais casas; preço de bitcoin, de duas. */
function casas(valor: number): number {
  if (valor >= 1) return 2
  if (valor >= 0.01) return 4
  return 8
}
