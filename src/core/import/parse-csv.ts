/**
 * Leitor de CSV.
 *
 * Escrito à mão, sem dependência. Não é economia de bytes: as bibliotecas de
 * planilha resolvem o `.xlsx` inteiro — fórmulas, estilos, abas — e nada disso
 * importa aqui. O que importa é o que costuma quebrar de verdade num arquivo
 * brasileiro, e isso cabe em poucas linhas:
 *
 * - o Excel em português salva com PONTO E VÍRGULA, não vírgula;
 * - campos com vírgula decimal vêm entre aspas;
 * - o arquivo pode ter BOM, e o BOM entra na primeira coluna como caractere
 *   invisível — o cabeçalho "Data" vira "﻿Data" e nenhum mapeamento acha.
 */

export interface CsvTable {
  headers: string[]
  rows: string[][]
  /** O separador que foi detectado. A tela mostra, para o usuário conferir. */
  delimiter: string
}

/** Separadores possíveis, na ordem em que fazem sentido tentar. */
const DELIMITERS = [';', ',', '\t', '|'] as const

/**
 * Descobre o separador contando ocorrências FORA de aspas.
 *
 * Contar cru elegeria a vírgula em "1.234,56" mesmo num arquivo separado por
 * ponto e vírgula — e aí toda linha viraria colunas demais.
 */
function detectDelimiter(sample: string): string {
  let melhor = ','
  let maior = 0

  for (const candidato of DELIMITERS) {
    let contagem = 0
    let aspas = false

    for (const char of sample) {
      if (char === '"') aspas = !aspas
      else if (char === candidato && !aspas) contagem += 1
    }

    if (contagem > maior) {
      maior = contagem
      melhor = candidato
    }
  }

  return melhor
}

export function parseCsv(texto: string): CsvTable {
  // O BOM some aqui e não em outro lugar: depois de virar célula, ele já
  // contaminou o nome da coluna.
  const limpo = texto.replace(/^﻿/, '')
  const primeiraLinha = limpo.slice(0, limpo.indexOf('\n') + 1 || limpo.length)
  const delimiter = detectDelimiter(primeiraLinha || limpo.slice(0, 2000))

  const linhas: string[][] = []
  let campo = ''
  let linha: string[] = []
  let aspas = false

  for (let i = 0; i < limpo.length; i += 1) {
    const char = limpo[i]!

    if (aspas) {
      // Duas aspas seguidas dentro de um campo são uma aspa literal.
      if (char === '"' && limpo[i + 1] === '"') {
        campo += '"'
        i += 1
      } else if (char === '"') {
        aspas = false
      } else {
        campo += char
      }
      continue
    }

    if (char === '"') {
      aspas = true
    } else if (char === delimiter) {
      linha.push(campo.trim())
      campo = ''
    } else if (char === '\n') {
      linha.push(campo.trim())
      linhas.push(linha)
      linha = []
      campo = ''
    } else if (char !== '\r') {
      campo += char
    }
  }

  // A última linha costuma vir sem quebra no fim.
  if (campo !== '' || linha.length > 0) {
    linha.push(campo.trim())
    linhas.push(linha)
  }

  // Linhas totalmente vazias aparecem no fim de quase todo arquivo exportado.
  const uteis = linhas.filter((l) => l.some((c) => c !== ''))
  const [headers = [], ...rows] = uteis

  return { headers, rows, delimiter }
}
