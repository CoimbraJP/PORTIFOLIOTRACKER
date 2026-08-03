/**
 * Lê um arquivo de texto adivinhando a codificação.
 *
 * `file.text()` assume UTF-8, sempre. O Excel no Windows salva CSV em
 * **windows-1252** — e o relatório da B3 sai assim. O resultado não é um erro:
 * é `Código de Negociação` virando `C�digo de Negocia��o`, nenhuma coluna
 * sendo reconhecida, e a tela dizendo que o arquivo não parece um relatório.
 *
 * A detecção é por eliminação, e é confiável nos dois sentidos: UTF-8 tem
 * regras estritas de sequência de bytes, então texto latino quase nunca passa
 * por acidente. Se decodificar em UTF-8 sem erro, é UTF-8; se falhar, é a
 * codificação de página única que o Excel usa.
 */
export async function readTextFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    // `windows-1252` e não `iso-8859-1`: são quase idênticas, e a diferença
    // está justamente nos caracteres que o Excel usa — aspas curvas e travessão.
    return new TextDecoder('windows-1252').decode(buffer)
  }
}
