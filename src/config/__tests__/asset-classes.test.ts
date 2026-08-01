import { describe, expect, it } from 'vitest'
import { ASSET_CLASSES, assetClass } from '../asset-classes'
import { isQuotable } from '@/integrations/providers/registry'

/**
 * Invariantes da definição de classe.
 *
 * Criar uma classe nova é fácil, e é aí que mora o risco: basta esquecer um
 * campo para um ativo sem cotação começar a ser mandado para a API de bolsa.
 * Estes testes falham no momento em que a classe é criada, não em produção.
 */
describe('definição das classes de ativo', () => {
  it('as 12 classes iniciais existem e são únicas', () => {
    const slugs = ASSET_CLASSES.map((c) => c.slug)
    expect(slugs).toHaveLength(12)
    expect(new Set(slugs).size).toBe(12)
  })

  it('instrumento sem ticker público é sempre privado do tenant', () => {
    // Um apartamento ou um CDB não podem ser compartilhados entre usuários como
    // se compartilha PETR4: o "símbolo" deles só faz sentido para quem os tem.
    for (const definition of ASSET_CLASSES) {
      if (definition.instrumentKind === 'CUSTOM' || definition.instrumentKind === 'FIXED_INCOME') {
        expect(definition.privateInstrument, definition.slug).toBe(true)
      }
    }
  })

  it('classe de mercado tem instrumento global e avaliação por quantidade', () => {
    for (const definition of ASSET_CLASSES) {
      if (!definition.privateInstrument) {
        expect(definition.valuationMode, definition.slug).toBe('QUANTITATIVE')
      }
    }
  })

  it('renda fixa rende juros, não é cotada em bolsa', () => {
    const rendaFixa = assetClass('renda-fixa')

    expect(rendaFixa.instrumentKind).toBe('FIXED_INCOME')
    expect(rendaFixa.valuationMode).toBe('ACCRUAL')
    expect(rendaFixa.supportsDividends).toBe(false)
  })

  it('nenhuma classe privada é enviada a um provider de cotação', () => {
    // O teste que fecha o caso do CDB: mesmo se um ativo for arquivado na
    // carteira errada, é o `kind` que decide, e nenhum provider aceita CUSTOM
    // nem FIXED_INCOME.
    for (const definition of ASSET_CLASSES) {
      if (!definition.privateInstrument) continue

      const cotavel = isQuotable({
        id: 'x',
        symbol: 'X',
        classSlug: 'acoes-br', // de propósito: a classe MAIS permissiva
        kind: definition.instrumentKind,
        externalIds: {},
      })

      expect(cotavel, definition.slug).toBe(false)
    }
  })
})
