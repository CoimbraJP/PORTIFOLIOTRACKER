# 03 — Estrutura do Projeto

Organização **feature-first** dentro de uma arquitetura em camadas. A regra que
governa tudo: **as dependências apontam para dentro**. `app/` conhece `core/`;
`core/` não conhece ninguém.

---

## Árvore

```
portfolio-tracker/
├── docs/                              # esta documentação de arquitetura
│
├── src/
│   ├── app/                           # Next.js App Router — só roteamento e composição
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   ├── (app)/                     # área autenticada
│   │   │   ├── layout.tsx             # AppShell + guarda de tenant
│   │   │   ├── page.tsx               # Dashboard
│   │   │   ├── carteiras/
│   │   │   │   ├── page.tsx           # visão por carteiras
│   │   │   │   └── [walletId]/page.tsx
│   │   │   ├── classes/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [classSlug]/page.tsx
│   │   │   ├── ativos/[positionId]/page.tsx
│   │   │   ├── historico/page.tsx
│   │   │   ├── proventos/page.tsx     # renda passiva
│   │   │   └── configuracoes/
│   │   │       ├── page.tsx
│   │   │       ├── classes/page.tsx   # criar/editar classes e campos
│   │   │       └── tenant/page.tsx
│   │   ├── api/
│   │   │   └── jobs/                  # endpoints dos cron jobs
│   │   │       ├── sync-quotes/route.ts
│   │   │       ├── sync-corporate-actions/route.ts
│   │   │       ├── apply-corporate-actions/route.ts
│   │   │       └── daily-snapshot/route.ts
│   │   ├── layout.tsx
│   │   └── globals.css
│   │
│   ├── core/                          # ★ DOMÍNIO — TypeScript puro, sem I/O
│   │   ├── ledger/
│   │   │   ├── compute-position.ts    # o motor de custo médio
│   │   │   ├── transaction-rules.ts   # o que cada tipo faz com a posição
│   │   │   ├── transfer.ts            # transferência de duas pernas
│   │   │   └── __tests__/
│   │   ├── valuation/
│   │   │   ├── strategy.ts            # interface
│   │   │   ├── quantitative.ts
│   │   │   ├── valuated.ts
│   │   │   ├── accrual.ts
│   │   │   └── __tests__/
│   │   ├── income/                    # proventos
│   │   │   ├── match-corporate-action.ts   # posição na data-com
│   │   │   ├── generate-income-tx.ts
│   │   │   ├── yield-on-cost.ts
│   │   │   └── __tests__/
│   │   ├── performance/
│   │   │   ├── simple-return.ts
│   │   │   ├── twr.ts
│   │   │   ├── xirr.ts
│   │   │   └── __tests__/
│   │   ├── consolidation/
│   │   │   ├── by-class.ts
│   │   │   ├── by-wallet.ts
│   │   │   └── by-instrument.ts       # BTC somado entre carteiras
│   │   ├── money/
│   │   │   ├── decimal.ts             # wrapper único — só isto toca decimal.js
│   │   │   ├── currency.ts
│   │   │   └── format.ts
│   │   └── types/                     # tipos de domínio, sem dependência de ORM
│   │
│   ├── server/                        # APLICAÇÃO — orquestra domínio + infra
│   │   ├── actions/                   # Server Actions ("use server")
│   │   │   ├── wallet.ts
│   │   │   ├── position.ts
│   │   │   ├── transaction.ts
│   │   │   ├── asset-class.ts
│   │   │   └── valuation.ts
│   │   ├── queries/                   # leituras para RSC
│   │   │   ├── dashboard.ts
│   │   │   ├── portfolio.ts
│   │   │   ├── history.ts
│   │   │   └── income.ts
│   │   ├── services/                  # casos de uso compostos
│   │   │   ├── recompute-position.ts
│   │   │   ├── snapshot.ts
│   │   │   └── corporate-action-runner.ts
│   │   ├── auth/
│   │   │   ├── session.ts
│   │   │   ├── tenant-context.ts      # tenant ativo, sempre a partir do servidor
│   │   │   └── guards.ts
│   │   └── validation/                # schemas Zod, compartilhados com o form
│   │
│   ├── db/                            # INFRA — persistência
│   │   ├── schema/
│   │   │   ├── tenant.ts
│   │   │   ├── asset-class.ts
│   │   │   ├── wallet.ts
│   │   │   ├── instrument.ts
│   │   │   ├── position.ts
│   │   │   ├── transaction.ts
│   │   │   ├── valuation.ts
│   │   │   ├── quote.ts
│   │   │   ├── corporate-action.ts
│   │   │   ├── snapshot.ts
│   │   │   ├── attachment.ts
│   │   │   └── index.ts
│   │   ├── repositories/              # acesso a dados, sempre com tenant
│   │   ├── migrations/
│   │   ├── seed/
│   │   │   └── asset-classes.ts       # as 12 classes iniciais + field_schema
│   │   ├── policies/                  # SQL de RLS, versionado
│   │   └── client.ts
│   │
│   ├── integrations/                  # INFRA — mundo externo
│   │   ├── providers/
│   │   │   ├── types.ts               # interface PriceProvider
│   │   │   ├── registry.ts            # roteamento + lote + fallback
│   │   │   ├── brapi/
│   │   │   ├── coingecko/
│   │   │   ├── yahoo/
│   │   │   └── manual/
│   │   ├── cache/
│   │   └── storage/                   # Supabase Storage (fotos, documentos)
│   │
│   ├── components/
│   │   ├── ui/                        # primitivos do design system
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── money-input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── tooltip.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── skeleton.tsx
│   │   │   └── empty-state.tsx
│   │   ├── data/
│   │   │   ├── data-table.tsx
│   │   │   ├── metric-card.tsx
│   │   │   ├── animated-number.tsx
│   │   │   ├── trend-indicator.tsx
│   │   │   ├── currency-value.tsx
│   │   │   └── allocation-bar.tsx
│   │   ├── charts/
│   │   │   ├── area-chart-glow.tsx
│   │   │   ├── donut-allocation.tsx
│   │   │   ├── monthly-income-bars.tsx
│   │   │   ├── sparkline.tsx
│   │   │   └── chart-theme.ts
│   │   ├── layout/
│   │   │   ├── app-shell.tsx
│   │   │   ├── sidebar.tsx
│   │   │   ├── page-header.tsx
│   │   │   ├── section.tsx
│   │   │   └── view-switcher.tsx
│   │   └── motion/
│   │       ├── fade-in.tsx
│   │       ├── stagger-list.tsx
│   │       ├── hover-card.tsx          # o efeito de card padrão
│   │       └── expand.tsx
│   │
│   ├── features/                      # composições por domínio de tela
│   │   ├── dashboard/
│   │   ├── portfolio/                 # visões Classes e Carteiras
│   │   ├── transactions/
│   │   ├── income/
│   │   ├── asset-classes/
│   │   │   └── dynamic-field-form.tsx  # renderiza o field_schema
│   │   └── settings/
│   │
│   ├── hooks/
│   ├── lib/                           # utilitários genéricos, sem domínio
│   ├── styles/
│   │   ├── tokens.css                 # ★ única fonte de cores/espaços/durações
│   │   └── animations.css
│   └── config/
│       ├── asset-classes.ts           # definição das 12 classes iniciais
│       ├── transaction-types.ts
│       └── navigation.ts
│
├── tests/
│   ├── unit/                          # espelha core/
│   └── e2e/
├── CLAUDE.md                          # regras permanentes do projeto
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

---

## Regras de organização

1. **`core/` não importa nada de fora.** Nem React, nem Drizzle, nem Supabase.
   Se um arquivo em `core/` precisa de `await fetch`, ele está no lugar errado.

2. **`components/ui/` não conhece o domínio.** Um `Button` não sabe o que é
   carteira. Componentes que conhecem domínio vivem em `features/`.

3. **Só `core/money/decimal.ts` importa `decimal.js`.** Um único ponto de troca.

4. **Só `db/repositories/` importa o client do Drizzle.** Server Actions falam
   com repositórios, nunca com o ORM diretamente.

5. **Um schema Zod por entidade, em `server/validation/`,** consumido pelo
   formulário (cliente) e pela Server Action (servidor). Nunca duplicar validação.

6. **Nenhum hexadecimal em componente.** Só tokens.

7. **Arquivo acima de ~200 linhas é sinal de que falta uma extração.**

---

## Roadmap

Cada fase só começa quando a anterior atende seus critérios de pronto.

### Fase 1 — Fundação, Design System e Dashboard *(primeira entrega)*
Setup Next.js 15 + Tailwind v4 + Drizzle + Supabase. Tokens de design completos.
Primitivos e componentes de dados. `AppShell`, sidebar, header. Dashboard com
todos os cards, os dois gráficos e a tabela expansível por classe, **alimentado
por dados mock** com a forma exata dos tipos de domínio.
**Pronto quando:** você navega, sente as animações, e o dashboard está visualmente
finalizado. Nenhuma decisão visual fica pendente para depois.

### Fase 2 — Banco, multitenancy e autenticação
Schema completo, migrations, policies de RLS, seed das 12 classes, Supabase Auth,
contexto de tenant, guardas.
**Pronto quando:** um teste prova que o tenant A não consegue ler dados do tenant
B, nem pela aplicação nem por SQL direto.

### Fase 3 — Ledger e CRUD
Classes, carteiras, posições, transações. `computePosition` com cobertura de
testes ampla. Transferência entre carteiras. Formulário dinâmico por
`field_schema`. Consolidação por classe, carteira e instrumento.
**Pronto quando:** o dashboard troca o mock por dados reais e os números batem
com uma planilha de conferência.

### Fase 4 — Cotações e valoração
`ProviderRegistry`, BRAPI, CoinGecko, Yahoo. Cache com TTL por classe. Câmbio.
Job de cotações. Três estratégias de valoração. Job de snapshot diário.
**Pronto quando:** o patrimônio se atualiza sozinho e o gráfico de evolução tem
dados reais.

### Fase 5 — Proventos automáticos
Sync de eventos corporativos, motor de match na data-com, geração idempotente,
tratamento de split/grupamento/bonificação com reprocessamento. Tela de Renda
Passiva com fluxo mensal, histórico anual e Yield on Cost.
**Pronto quando:** você cadastra uma compra de BBAS3 de 2 anos atrás e os
dividendos do período aparecem sozinhos, corretos.

### Fase 6 — Histórico, filtros e importação
Tela de histórico com filtros combinados. Importação CSV com mapeamento de
colunas e pré-visualização. Exportação.

### Fase 7 — Refinamento
Metas de alocação e rebalanceamento. TWR/XIRR. Comparação com CDI e IBOV. Modo
privacidade. Command palette (⌘K). Anexos de imóveis.

### Fase 8 — SaaS
Convite de membros, papéis, planos e limites, onboarding, billing.

---

## Convenções

- Componentes em `PascalCase.tsx`; utilitários em `kebab-case.ts`
- Rotas em português (é o idioma do usuário); código em inglês
- Commits: Conventional Commits
- Branch por fase: `feat/fase-1-fundacao`
- Todo PR que toca `core/` exige teste
