import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  turbopack: {
    /**
     * A raiz é ESTE projeto, sempre.
     *
     * Sem isto, o Turbopack procura o `package-lock.json` mais próximo subindo
     * as pastas e encontrou um solto em `C:\DEV`, elegendo aquele diretório
     * como raiz. Enquanto só gera aviso, é inofensivo; quando passa a resolver
     * dependências a partir dali, produz erro de módulo não encontrado que não
     * tem nenhuma relação aparente com a mudança que o causou.
     */
    root: process.cwd(),
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
    serverActions: {
      /**
       * O padrão é 1 MB, e a importação manda o CSV inteiro para o servidor —
       * de propósito, para o servidor reler o arquivo em vez de confiar nos
       * números convertidos pelo navegador. Quatro extratos de uma vez passam
       * folgado de 1 MB, e o erro que aparece quando estoura não diz que o
       * corpo era grande demais: diz que a ação falhou.
       */
      bodySizeLimit: '6mb',
    },
  },
}

export default nextConfig
