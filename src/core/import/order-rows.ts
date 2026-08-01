import type { ImportedRow } from './map-rows'

/**
 * Põe as linhas na ordem em que o ledger deve consumi-las.
 *
 * Não é a ordem do arquivo. Exportador quase sempre lista do mais recente para
 * o mais antigo, e o ledger é uma máquina de estados: consumir de trás para
 * frente produz venda sem posição e compra que ressuscita o que já foi vendido.
 *
 * O caso que motivou isto veio de uma carteira real. Duas linhas com o MESMO
 * carimbo de hora:
 *
 *     HYPE  sell  207  a 57,48
 *     HYPE  buy   207  a 20,00
 *
 * Economicamente a compra veio primeiro — não se vende o que não se tem. Na
 * ordem do arquivo, a venda era descartada por falta de posição e sobravam 207
 * HYPE fantasmas, uns dez mil dólares que a pessoa não tinha. E o total ficava
 * plausível: ninguém confere um ativo que realmente existiu.
 *
 * Por isso, com data e hora iguais, COMPRA vem antes de VENDA. O ledger trabalha
 * por dia e não tem resolução intradiária para desempatar de outro jeito; entre
 * uma ordem que inventa patrimônio e outra que não, escolhemos a que não
 * inventa.
 */
export function ordenarParaLedger(rows: ImportedRow[]): ImportedRow[] {
  return [...rows].sort((a, b) => {
    const cronologia = `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
    if (cronologia !== 0) return cronologia

    if (a.side !== b.side) return a.side === 'BUY' ? -1 : 1

    // Empate real: mantém a ordem em que apareceram, para a importação ser
    // reproduzível linha a linha.
    return a.ocorrencia - b.ocorrencia
  })
}
