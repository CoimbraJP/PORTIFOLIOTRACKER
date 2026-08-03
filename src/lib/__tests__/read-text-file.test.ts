import { describe, expect, it } from 'vitest'
import { readTextFile } from '../read-text-file'

/** Monta um File com bytes crus, como o navegador entrega. */
function arquivo(bytes: Uint8Array): File {
  return new File([bytes as BlobPart], 'relatorio.csv', { type: 'text/csv' })
}

describe('codificação do arquivo', () => {
  it('lê o CSV que o Excel do Windows salva', async () => {
    // `Código de Negociação` em windows-1252: um byte por acento.
    const bytes = new Uint8Array([
      0x43, 0xf3, 0x64, 0x69, 0x67, 0x6f, 0x20, 0x64, 0x65, 0x20, 0x4e, 0x65, 0x67, 0x6f, 0x63,
      0x69, 0x61, 0xe7, 0xe3, 0x6f,
    ])

    expect(await readTextFile(arquivo(bytes))).toBe('Código de Negociação')
  })

  it('lê UTF-8 sem estragar', async () => {
    const bytes = new TextEncoder().encode('Código de Negociação')

    expect(await readTextFile(arquivo(bytes))).toBe('Código de Negociação')
  })

  it('não confunde os dois', async () => {
    // O mesmo texto nas duas codificações precisa chegar igual. Sem a detecção,
    // o de página única vira `C�digo` e nenhuma coluna é reconhecida — o
    // arquivo inteiro é recusado por um motivo que não tem nada a ver.
    const latin = new Uint8Array([0x50, 0x72, 0x65, 0xe7, 0x6f]) // "Preço"
    const utf8 = new TextEncoder().encode('Preço')

    expect(await readTextFile(arquivo(latin))).toBe(await readTextFile(arquivo(utf8)))
  })
})
