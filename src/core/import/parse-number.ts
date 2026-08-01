/**
 * Leitura de número em planilha, com detecção de formato.
 *
 * Este arquivo existe por causa de uma armadilha que não avisa quando dispara.
 * `100,000.00` é cem mil em inglês e é lixo em português; `1.234,56` é mil
 * duzentos e trinta e quatro em português e é lixo em inglês. As duas grafias
 * são NÚMEROS VÁLIDOS na convenção errada — nada estoura, nada reclama, e o
 * patrimônio sai mil vezes maior ou mil vezes menor.
 *
 * A decisão é tomada UMA VEZ para o arquivo inteiro, não célula a célula.
 * Célula a célula, `1,500` é indecidível: mil e quinhentos ou um e meio? No
 * conjunto do arquivo quase sempre existe uma célula que só faz sentido de um
 * jeito — e ela decide por todas.
 */

export type NumberFormat = 'br' | 'us'

/** Célula que tem os dois separadores: o ÚLTIMO é o decimal. Decide sozinha. */
const AMBOS = /[.,]/g

/**
 * Descobre se o arquivo escreve números em português ou em inglês.
 *
 * Vota célula por célula e devolve a maioria. Empate ou silêncio total cai em
 * `br`, que é o formato do modelo que o próprio sistema distribui.
 */
export function detectNumberFormat(cells: Iterable<string>): NumberFormat {
  let br = 0
  let us = 0

  for (const bruto of cells) {
    const texto = bruto.trim()
    if (!/\d/.test(texto)) continue

    const separadores = texto.match(AMBOS)
    if (!separadores) continue

    if (separadores.includes('.') && separadores.includes(',')) {
      // Prova direta: o que vem por último separa os centavos.
      const ultimo = texto.lastIndexOf('.') > texto.lastIndexOf(',') ? 'us' : 'br'
      if (ultimo === 'us') us += 1
      else br += 1
      continue
    }

    // Só um separador, e exatamente três dígitos depois dele até o fim: é
    // separador de milhar. Ninguém escreve preço com três casas decimais
    // redondas, e quem escreve perde para o resto do arquivo na votação.
    if (/^\d{1,3}(,\d{3})+$/.test(texto)) us += 1
    else if (/^\d{1,3}(\.\d{3})+$/.test(texto)) br += 1
  }

  return us > br ? 'us' : 'br'
}

/**
 * Converte a célula em número de máquina, ou devolve nulo.
 *
 * Nulo é resposta legítima e frequente: exportadores escrevem `--`, `n/a` ou
 * deixam vazio quando não houve taxa. Quem chama decide se aquilo é zero ou é
 * erro — aqui não se chuta.
 */
export function parseNumber(bruto: string, formato: NumberFormat): string | null {
  let texto = bruto.trim()
  if (texto === '' || texto === '--' || texto === '-') return null

  // Símbolo de moeda, espaço fino e sinal de porcentagem grudados no número.
  texto = texto.replace(/[R$US\s %]/gi, '')
  if (texto === '') return null

  const negativo = texto.startsWith('-') || /^\(.*\)$/.test(texto)
  texto = texto.replace(/^[-(]|\)$/g, '')

  texto = formato === 'us' ? texto.replace(/,/g, '') : texto.replace(/\./g, '').replace(',', '.')

  // `0.` aparece no export do CoinMarketCap para valor ausente. Vira `0`.
  if (texto.endsWith('.')) texto = texto.slice(0, -1)

  if (!/^\d+(\.\d+)?$/.test(texto)) return null

  return negativo ? `-${texto}` : texto
}
