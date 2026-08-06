/**
 * Gera e baixa um CSV a partir de linhas já formatadas para exibição.
 *
 * Ponto-e-vírgula, não vírgula: é o separador que o Excel brasileiro espera
 * por padrão, porque a vírgula já é o separador decimal daqui — um CSV com
 * vírgula abriria com "R$ 1" e "234,56" em colunas diferentes.
 *
 * Roda inteiro no cliente, a partir de dados que a tela já tem carregados.
 * Não existe ida ao servidor: exportar é reformatar o que está na tela, não
 * uma consulta nova — e o número no arquivo bate com o número que a pessoa
 * está olhando no momento do clique.
 */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const linhas = [headers, ...rows].map((linha) => linha.map(celula).join(';'))
  // BOM UTF-8: sem ele, o Excel do Windows lê "Preço" como "PreÃ§o".
  const conteudo = '﻿' + linhas.join('\r\n')

  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

function celula(valor: string | number): string {
  const texto = String(valor)
  // Aspas só entram quando precisam: aspas em toda célula deixariam o arquivo
  // ilegível para quem for abrir num editor de texto simples.
  if (!/[;"\r\n]/.test(texto)) return texto
  return `"${texto.replace(/"/g, '""')}"`
}
