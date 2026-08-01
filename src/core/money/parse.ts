/**
 * Interpreta um número digitado por gente.
 *
 * Existe por causa de um bug real e caro: a versão anterior apagava TODO ponto
 * antes de trocar a vírgula por ponto, assumindo que ponto é sempre separador
 * de milhar. Isso está certo para "1.250,40" e catastrófico para "5.0800" — a
 * cotação do dólar, pré-preenchida pelo servidor em formato americano, virava
 * 50800, e um aporte de US$ 65 mil foi gravado como R$ 3,3 bilhões.
 *
 * A regra aqui não adivinha: só trata ponto como milhar quando ele REALMENTE
 * parece milhar, isto é, quando separa grupos de exatamente três dígitos.
 *
 * - "1.250,40"  → vírgula manda: ponto é milhar          → 1250.40
 * - "1.250"     → grupo de 3: milhar                     → 1250
 * - "5.0800"    → não é grupo de 3: ponto é decimal      → 5.08
 * - "5,0800"    → vírgula é decimal                      → 5.08
 * - "65000"     → inteiro                                → 65000
 *
 * Devolve string, não `number`: o `Decimal` converte a partir do texto sem
 * passar por ponto flutuante em momento algum.
 */
export function parseDecimalInput(raw: string): string {
  const texto = raw.trim()
  if (texto === '') return ''

  // Com vírgula presente, a intenção é inequívoca: notação brasileira. A
  // vírgula é o decimal e qualquer ponto é separador de milhar.
  if (texto.includes(',')) {
    return texto.replace(/\./g, '').replace(',', '.')
  }

  // Sem vírgula, o ponto só é milhar se separar grupos de exatamente três
  // dígitos: "1.250.000". Qualquer outro arranjo — "5.08", "5.0800" — é
  // decimal, e apagá-lo multiplicaria o valor por cem ou por mil.
  if (/^\d{1,3}(\.\d{3})+$/.test(texto)) {
    return texto.replace(/\./g, '')
  }

  return texto
}
