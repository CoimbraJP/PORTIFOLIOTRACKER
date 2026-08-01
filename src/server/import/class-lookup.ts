import { ASSET_CLASSES } from '@/config/asset-classes'
import { normalizar } from '@/core/import/normalize'
import type { ClassLookup } from '@/core/import'

/**
 * Traduz o que a planilha escreveu na coluna Classe para o slug do sistema.
 *
 * Aceita o slug (`acoes-br`), o nome (`Ações Brasil`) e o nome sem acento,
 * porque planilha exportada de sistema estrangeiro perde acento pelo caminho.
 *
 * Devolve nulo quando não reconhece, e é isso que faz a linha parar. A
 * alternativa — cair numa classe padrão — foi como um CDB acabou listado entre
 * as ações, e ninguém percebeu até o total da renda fixa aparecer zerado.
 */
export function buildClassLookup(): ClassLookup {
  const porTexto = new Map<string, string>()

  for (const classe of ASSET_CLASSES) {
    porTexto.set(classe.slug, classe.slug)
    porTexto.set(normalizar(classe.name), classe.slug)
    // O plural do próprio vocabulário da classe: quem escreve "Imóveis" na
    // planilha está falando da classe cujo ativo se chama imóvel.
    porTexto.set(normalizar(classe.assetTerm.many), classe.slug)
  }

  return (valor: string) => porTexto.get(normalizar(valor)) ?? porTexto.get(valor.trim()) ?? null
}
