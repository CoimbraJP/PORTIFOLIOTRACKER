import { describe, expect, it } from 'vitest'
import { parseCsv } from '../parse-csv'
import { diagnosticar, guessMapping } from '../guess-mapping'
import { detectNumberFormat, parseNumber } from '../parse-number'
import { importKey, mapRows } from '../map-rows'
import { ordenarParaLedger } from '../order-rows'

/** Tradutor de classe de mentira: aceita o slug direto e mais nada. */
const classes = (v: string) => (v.trim() ? v.trim().toLowerCase() : null)

describe('leitura do CSV', () => {
  it('detecta ponto e vírgula, que é o que o Excel brasileiro salva', () => {
    const tabela = parseCsv('Data;Ativo;Qtd\n01/02/2025;PETR4;100')

    expect(tabela.delimiter).toBe(';')
    expect(tabela.headers).toEqual(['Data', 'Ativo', 'Qtd'])
    expect(tabela.rows[0]).toEqual(['01/02/2025', 'PETR4', '100'])
  })

  it('não confunde a vírgula decimal com separador de coluna', () => {
    // Contar vírgulas cru elegeria a vírgula aqui, e cada linha viraria
    // colunas demais.
    const tabela = parseCsv('Data;Preço\n01/02/2025;"1.234,56"')

    expect(tabela.delimiter).toBe(';')
    expect(tabela.rows[0]).toEqual(['01/02/2025', '1.234,56'])
  })

  it('remove o BOM, que contamina o primeiro cabeçalho', () => {
    const tabela = parseCsv('﻿Data,Ativo\n01/02/2025,PETR4')

    // Sem isto o cabeçalho vira "﻿Data" e nenhum mapeamento encontra.
    expect(tabela.headers[0]).toBe('Data')
  })

  it('entende aspas escapadas e campo com quebra', () => {
    const tabela = parseCsv('A,B\n"diz ""oi""",2')

    expect(tabela.rows[0]).toEqual(['diz "oi"', '2'])
  })
})

describe('mapeamento automático', () => {
  it('reconhece os cabeçalhos do extrato da B3', () => {
    const mapa = guessMapping([
      'Data do Negócio',
      'Tipo de Movimentação',
      'Código de Negociação',
      'Quantidade',
      'Preço',
    ])

    expect(mapa.date).toBe(0)
    expect(mapa.side).toBe(1)
    expect(mapa.symbol).toBe(2)
    expect(mapa.quantity).toBe(3)
    expect(mapa.unitPrice).toBe(4)
  })

  it('prefere a coluna de nome exato à que só começa igual', () => {
    // "Data de Liquidação" começa com "data" e não pode ganhar de "Data".
    const mapa = guessMapping(['Data de Liquidação', 'Data', 'Ativo'])

    expect(mapa.date).toBe(1)
  })
})

describe('formato numérico', () => {
  it('decide pelo arquivo inteiro, não pela célula', () => {
    // "100,000.00" é cem mil; lido como português vira cem. Mil vezes menos,
    // sem nenhum sinal de erro.
    const formato = detectNumberFormat(['1,859.85', '100,000.00', '0.0346'])

    expect(formato).toBe('us')
    expect(parseNumber('100,000.00', formato)).toBe('100000.00')
  })

  it('lê o formato brasileiro quando é ele que manda no arquivo', () => {
    const formato = detectNumberFormat(['1.234,56', '65.000', '33,50'])

    expect(formato).toBe('br')
    expect(parseNumber('1.234,56', formato)).toBe('1234.56')
  })

  it('trata ausência como ausência, não como zero', () => {
    // Quem chama decide se "--" é zero. Devolver 0 daqui esconderia a diferença
    // entre "não houve taxa" e "não sabemos a taxa".
    expect(parseNumber('--', 'us')).toBeNull()
    expect(parseNumber('', 'us')).toBeNull()
    // "0." é como o CoinMarketCap escreve valor ausente de verdade zerado.
    expect(parseNumber('0.', 'us')).toBe('0')
  })
})

describe('cabeçalhos em inglês', () => {
  const headers = [
    'Date (UTC-3:00)',
    'Token',
    'Type',
    'Price (USD)',
    'Amount',
    'Total value (USD)',
    'Fee',
    'Fee Currency',
    'Notes',
  ]

  it('reconhece o export do CoinMarketCap', () => {
    const mapa = guessMapping(headers)

    expect(mapa.date).toBe(0)
    expect(mapa.symbol).toBe(1)
    expect(mapa.side).toBe(2)
    expect(mapa.unitPrice).toBe(3)
    expect(mapa.quantity).toBe(4)
    expect(mapa.fees).toBe(6)
  })

  it('não confunde a moeda da taxa com a moeda do negócio', () => {
    // "Fee Currency" pode dizer BTC numa compra precificada em dólar. Ler uma
    // como a outra converteria o preço inteiro pela moeda errada.
    expect(guessMapping(headers).currency).toBeUndefined()
  })

  it('não deixa o valor total entrar como preço unitário', () => {
    // Seria multiplicar o custo pela quantidade duas vezes.
    expect(guessMapping(headers).unitPrice).not.toBe(5)
  })
})

describe('extrato de posição da B3', () => {
  // O arquivo de "Carteira de Ativos": o que a pessoa TEM hoje, não o que ela
  // negociou. Não tem data nem preço pago, e nenhum mapeamento inventaria isso.
  const headers = [
    'Produto',
    'Instituição',
    'Conta',
    'Código de Negociação',
    'CNPJ da Empresa',
    'Código ISIN / Distribuição',
    'Tipo',
    'Escriturador',
    'Quantidade',
    'Quantidade Disponível',
    'Quantidade Indisponível',
    'Motivo',
    'Preço de Fechamento',
    'Valor Atualizado',
  ]

  it('não lê "Tipo" como compra ou venda', () => {
    // Ali "Tipo" é ON, PN, UNIT ou CI. E `CI` começa com "c", o que faria toda
    // cota de fundo virar uma compra sem ninguém notar.
    expect(guessMapping(headers).side).toBeUndefined()
  })

  it('não aceita o preço de fechamento como preço de compra', () => {
    // É o preço de HOJE. Como custo de aquisição, a carteira nasceria com lucro
    // zero e assim ficaria — plausível na tela e errado no fato.
    expect(guessMapping(headers).unitPrice).toBeUndefined()
  })

  it('explica que o arquivo é de saldo em vez de reclamar de cada linha', () => {
    const aviso = diagnosticar(headers, guessMapping(headers))

    expect(aviso).toContain('POSIÇÃO')
    expect(aviso).toContain('NEGOCIAÇÃO')
  })

  it('deixa passar o extrato de negociação, que é o certo', () => {
    const negociacao = [
      'Data do Negócio',
      'Tipo de Movimentação',
      'Mercado',
      'Instituição',
      'Código de Negociação',
      'Quantidade',
      'Preço',
      'Valor',
    ]

    expect(diagnosticar(negociacao, guessMapping(negociacao))).toBeNull()
  })
})

describe('conversão das linhas', () => {
  const mapa = { date: 0, side: 1, symbol: 2, quantity: 3, unitPrice: 4, classSlug: 5, wallet: 6 }

  it('converte data brasileira e número com vírgula', () => {
    const [row] = mapRows([['15/02/2024', 'Compra', 'PETR4', '100', '33,50', 'acoes-br', 'XP']], mapa, classes)

    expect(row?.date).toBe('2024-02-15')
    expect(row?.unitPrice).toBe('33.50')
    expect(row?.side).toBe('BUY')
    expect(row?.erro).toBeUndefined()
  })

  it('entende compra e venda em vários vocabulários', () => {
    const linhas = [
      ['15/02/2024', 'C', 'PETR4', '1', '1', 'acoes-br', 'XP'],
      ['15/02/2024', 'Venda', 'PETR4', '1', '1', 'acoes-br', 'XP'],
      ['15/02/2024', 'sell', 'PETR4', '1', '1', 'acoes-br', 'XP'],
    ]

    expect(mapRows(linhas, mapa, classes).map((r) => r.side)).toEqual(['BUY', 'SELL', 'SELL'])
  })

  it('marca a linha ruim em vez de descartá-la', () => {
    // Importar 2 de 3 sem dizer qual ficou de fora é como se perde um aporte.
    const [row] = mapRows([['30/02/x', 'Compra', 'PETR4', '100', '33,50', 'acoes-br', 'XP']], mapa, classes)

    expect(row?.erro).toContain('Data inválida')
  })

  it('recusa lado ambíguo em vez de chutar', () => {
    const [row] = mapRows([['15/02/2024', 'Transferência', 'PETR4', '1', '1', 'acoes-br', 'XP']], mapa, classes)

    // Gravar venda como compra inverte o preço médio, e o erro só aparece
    // meses depois.
    expect(row?.erro).toContain('compra ou venda')
  })
})

describe('classe e carteira vindas de fora do arquivo', () => {
  const mapa = { date: 0, side: 1, symbol: 2, quantity: 3, unitPrice: 4 }
  const linha = [['15/02/2024', 'buy', 'BTC', '0,5', '200000']]

  it('usa o padrão do arquivo quando não existe a coluna', () => {
    // Export de corretora não traz classe nem carteira: o arquivo inteiro é de
    // uma carteira só, e o nome dela está no título.
    const [row] = mapRows(linha, mapa, classes, { classSlug: 'cripto', wallet: 'Binance' })

    expect(row?.erro).toBeUndefined()
    expect(row?.classSlug).toBe('cripto')
    expect(row?.wallet).toBe('Binance')
  })

  it('deixa a coluna vencer o padrão', () => {
    const comColuna = { ...mapa, classSlug: 5 }
    const [row] = mapRows(
      [['15/02/2024', 'buy', 'PETR4', '100', '33', 'acoes-br']],
      comColuna,
      classes,
      { classSlug: 'cripto', wallet: 'XP' },
    )

    expect(row?.classSlug).toBe('acoes-br')
  })

  it('recusa dólar sem câmbio, mesmo com padrão de moeda', () => {
    const [row] = mapRows(linha, mapa, classes, {
      classSlug: 'cripto',
      wallet: 'Binance',
      currency: 'USD',
    })

    expect(row?.erro).toContain('sem câmbio')
  })

  it('aceita dólar quando o câmbio da data é conhecido', () => {
    const [row] = mapRows(linha, mapa, classes, {
      classSlug: 'cripto',
      wallet: 'Binance',
      currency: 'USD',
      rates: { '2024-02-15': '4.97' },
    })

    expect(row?.erro).toBeUndefined()
    expect(row?.rate).toBe('4.97')
  })
})

describe('dados que passam em toda validação e ainda estão errados', () => {
  const mapa = { date: 0, side: 1, symbol: 2, quantity: 3, unitPrice: 4 }
  const padrao = { classSlug: 'cripto', wallet: 'Ledger' }

  it('aceita preço zero, que é airdrop', () => {
    // Recusar faria a quantidade sumir da carteira. O ativo existe; foi de graça.
    const [row] = mapRows([['05/10/2024', 'buy', 'EIGEN', '52', '0.']], mapa, classes, padrao)

    expect(row?.erro).toBeUndefined()
    expect(row?.unitPrice).toBe('0')
  })

  it('sinaliza a linha cujo valor destoa do arquivo inteiro', () => {
    // Preço em outra denominação passa em toda regra de formato — é número
    // válido — e sozinho multiplica o patrimônio por milhões.
    const linhas = [
      ['01/03/2024', 'buy', 'ETH', '1', '3000'],
      ['02/03/2024', 'buy', 'ETH', '1', '3100'],
      ['03/03/2024', 'buy', 'ETH', '1', '2900'],
      ['04/03/2024', 'buy', 'ETH', '5,5', '146750446,05'],
      ['05/03/2024', 'buy', 'ETH', '1', '3050'],
    ]

    const rows = mapRows(linhas, mapa, classes, padrao)

    expect(rows.filter((r) => r.aviso)).toHaveLength(1)
    expect(rows[3]?.aviso).toContain('acima do resto do arquivo')
    // Sinaliza, não bloqueia: quem sabe se o aporte foi grande é o dono.
    expect(rows[3]?.erro).toBeUndefined()
  })
})

describe('ordem em que o ledger consome as linhas', () => {
  const mapa = { date: 0, side: 1, symbol: 2, quantity: 3, unitPrice: 4 }
  const padrao = { classSlug: 'cripto', wallet: 'Binance' }

  it('inverte o arquivo que vem do mais novo para o mais antigo', () => {
    const linhas = [
      ['10/03/2025', 'sell', 'BTC', '1', '90000'],
      ['05/01/2025', 'buy', 'BTC', '1', '80000'],
    ]

    const ordenadas = ordenarParaLedger(mapRows(linhas, mapa, classes, padrao))

    expect(ordenadas.map((r) => r.date)).toEqual(['2025-01-05', '2025-03-10'])
  })

  it('coloca a compra antes da venda quando a hora é a mesma', () => {
    // Caso real de uma carteira do CoinMarketCap: as duas pernas do mesmo
    // negócio saíram com carimbo idêntico, e a venda veio primeiro no arquivo.
    // Na ordem do arquivo a venda era descartada por falta de posição e
    // sobravam 207 HYPE que a pessoa não tinha — uns dez mil dólares de
    // patrimônio inventado, num ativo que de fato existiu.
    const linhas = [
      ['21/05/2026 08:05:00', 'sell', 'HYPE', '207', '57,48'],
      ['21/05/2026 08:05:00', 'buy', 'HYPE', '207', '20,00'],
    ]

    const ordenadas = ordenarParaLedger(mapRows(linhas, mapa, classes, padrao))

    expect(ordenadas.map((r) => r.side)).toEqual(['BUY', 'SELL'])
  })
})

describe('idempotência', () => {
  it('a mesma linha produz a mesma chave', () => {
    const linha = ['15/02/2024', 'Compra', 'PETR4', '100', '33,50', 'acoes-br', 'XP']
    const m = { date: 0, side: 1, symbol: 2, quantity: 3, unitPrice: 4, classSlug: 5, wallet: 6 }
    const [a] = mapRows([linha], m, classes)
    const [b] = mapRows([linha], m, classes)

    expect(importKey(a!)).toBe(importKey(b!))
  })

  it('a taxa não entra na chave', () => {
    // Corretora que corrige a corretagem de um negócio não criou outro negócio.
    const mapa = { date: 0, side: 1, symbol: 2, quantity: 3, unitPrice: 4, fees: 5, classSlug: 6, wallet: 7 }
    const [a] = mapRows([['15/02/2024', 'C', 'PETR4', '100', '33,50', '2,50', 'acoes-br', 'XP']], mapa, classes)
    const [b] = mapRows([['15/02/2024', 'C', 'PETR4', '100', '33,50', '4,10', 'acoes-br', 'XP']], mapa, classes)

    expect(importKey(a!)).toBe(importKey(b!))
  })

  it('não confunde dois negócios idênticos no mesmo dia com uma duplicata', () => {
    // Acontece de verdade em cripto. Se as duas linhas dividissem a chave, a
    // segunda sumiria — e perder um aporte é pior que duplicar um, porque
    // duplicata a pessoa vê.
    const mapa = { date: 0, side: 1, symbol: 2, quantity: 3, unitPrice: 4 }
    const iguais = [
      ['17/11/2025', 'sell', 'ETH', '1,0000', '3149,53'],
      ['17/11/2025', 'sell', 'ETH', '1,0000', '3149,53'],
    ]

    const chaves = mapRows(iguais, mapa, classes, { classSlug: 'cripto', wallet: 'Ledger' }).map(
      importKey,
    )

    expect(new Set(chaves).size).toBe(2)
  })

  it('reimportar o arquivo maior mantém as chaves das linhas antigas', () => {
    // O exportador coloca o negócio novo em cima. Se a chave dependesse da
    // posição na planilha, todo o histórico duplicaria a cada importação.
    const mapa = { date: 0, side: 1, symbol: 2, quantity: 3, unitPrice: 4 }
    const padrao = { classSlug: 'cripto', wallet: 'Ledger' }
    const antigas = [
      ['17/11/2025', 'sell', 'ETH', '1,0000', '3149,53'],
      ['17/11/2025', 'sell', 'ETH', '1,0000', '3149,53'],
    ]
    const comNovaEmCima = [['02/12/2025', 'buy', 'ETH', '2', '2800'], ...antigas]

    const antes = mapRows(antigas, mapa, classes, padrao).map(importKey)
    const depois = mapRows(comNovaEmCima, mapa, classes, padrao).map(importKey)

    expect(depois).toContain(antes[0])
    expect(depois).toContain(antes[1])
    expect(new Set(depois).size).toBe(3)
  })
})
