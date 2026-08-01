# Portfolio Tracker

Gestor de patrimônio. Classes → Carteiras → Ativos, com consolidação automática.

> Leia `CLAUDE.md` e `docs/` antes de contribuir. As regras de escopo são
> permanentes e não negociáveis.

## Rodando

```bash
npm install
cp .env.example .env.local   # preencha antes de seguir
npm run db:setup             # tabelas + RLS + classes de sistema
npm run dev
```

Abre em http://localhost:3000. Passo a passo completo, incluindo o OAuth do
Google: `docs/04-fase-2-setup.md`.

## Telas

| Rota | O que faz |
|---|---|
| `/` | Dashboard. Classe → **ativo consolidado** → onde cada quantidade está guardada |
| `/carteiras` | Um card por classe de ativo, incluindo as ainda vazias |
| `/carteiras/[slug]` | Seletor de recorte: **Visão geral** ou uma carteira isolada. Trocar o recorte filtra gráfico, cartões e tabela |

O nível do meio muda de nome conforme a classe: **Cidades** em Imóveis,
**Corretoras** em Ações, **Carteiras e exchanges** em Cripto, **Devedores** em
Empréstimos. Mesmo modelo de dados, vocabulário adequado a cada contexto.

## Testes

```bash
npm test
```

14 testes do motor de ledger (custo médio, venda parcial, desdobramento,
bonificação, transferência sem lucro fantasma) e 6 de isolamento entre tenants.
Os de isolamento precisam de `DIRECT_URL` no `.env.local`; sem ela, são pulados
em vez de falhar.

## Status — Fase 1

Fundação, design system e dashboard. **Os dados são mock** (`src/mocks/`), com a
forma exata dos tipos de domínio em `src/core/types/`. A troca por dados reais
acontece na Fase 3 sem tocar em componente.

| Fase | Escopo | Status |
|---|---|---|
| 1 | Fundação, design system, dashboard | ✅ |
| 2 | Banco, multitenancy, autenticação | ✅ |
| 3 | Ledger e dados reais | ✅ |
| 4 | Cotações, câmbio e juros | ✅ |
| 5 | Proventos automáticos | — |
| 6 | Lançamentos completos e Histórico | ✅ |
| 7 | Metas, TWR/XIRR, benchmarks | — |
| 8 | SaaS | — |

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Motion · Recharts ·
Drizzle + Supabase (a partir da Fase 2)

## Estrutura

Ver `docs/03-estrutura-do-projeto.md`. A regra que governa tudo:
**as dependências apontam para dentro**. `core/` é TypeScript puro e não conhece
React, ORM nem rede.
