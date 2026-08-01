# 04 — Fase 2: banco, multitenancy e autenticação

**Status: concluída.** 20 testes passando, incluindo os 6 de isolamento contra
o banco real.

## ⚠️ Antes de ir para produção

A senha do banco e o Client Secret do Google foram expostos em chat durante o
desenvolvimento. Trocar os dois: Supabase → Settings → Database → Reset
database password, e Google Cloud Console → Credentials.

## Região

O projeto vive em **South America (São Paulo)**, `sa-east-1`.

A regra que levou a essa escolha: o banco fica perto do SERVIDOR DE APLICAÇÃO,
não do usuário. O navegador faz uma ida e volta até o app; o app faz várias até
o banco a cada página. Banco longe do servidor multiplica a latência por cada
consulta.

Consequência para o deploy: a região das funções da Vercel precisa ser `gru1`
(São Paulo). Deixar no padrão `iad1` recria exatamente o problema, com o app na
Virgínia e o banco em São Paulo — o pior dos arranjos.

Para medir de qualquer máquina: `node scripts/medir-latencia.mjs`.

---

## Passo a passo

### 1. Dependências e variáveis

```bash
npm install
cp .env.example .env.local
```

Preencha `.env.local`:

| Variável | Onde achar | Detalhe |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API | pública |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API | pública, começa com `sb_publishable_` |
| `DATABASE_URL` | Settings → Database → Connection pooling | **porta 6543** |
| `DIRECT_URL` | Settings → Database → Connection string | **porta 5432** |

As duas conexões não são luxo. O pooler (6543) é obrigatório em runtime
serverless, que abre e fecha conexão o tempo todo. A direta (5432) é obrigatória
para migrations e seed, porque o pgBouncer em modo transaction não aceita o DDL
que o drizzle-kit emite.

### 2. Google OAuth

No **Google Cloud Console** → APIs & Services → Credentials → OAuth client ID
(tipo *Web application*), com o redirect URI:

```
https://SEU-REF.supabase.co/auth/v1/callback
```

Um mesmo client aceita vários redirect URIs — trocar de projeto Supabase não
exige credencial nova, basta acrescentar a URI.

No **Supabase** → Authentication → Providers → Google: cole Client ID e Secret.
Em Authentication → URL Configuration, adicione `http://localhost:3000/**` às
Redirect URLs.

### 3. Banco

```bash
npm run db:setup
```

Equivale a:

```bash
npm run db:push       # cria as tabelas
npm run db:policies   # RLS, funções e trigger de signup
npm run db:seed       # 12 classes de sistema
```

### 4. Primeiro login e carteira de demonstração

```bash
npm run dev
```

Entre com o Google. O trigger `on_auth_user_created` cria seu tenant. Depois:

```bash
npm run db:seed
```

Agora ele encontra o tenant e grava a carteira de demonstração.

### 5. Provar o isolamento

```bash
npm test
```

Com `DIRECT_URL` presente, `tests/tenant-isolation.test.ts` roda de verdade: cria
dois tenants, tenta ler e escrever de um para o outro e exige que o banco recuse.

---

## As decisões que importam

### `withRls()` não é opcional

O Drizzle conecta com o papel `postgres`, que tem **BYPASSRLS**. Uma query
direta pelo `getDb()` ignora todas as policies. `src/db/rls.ts` abre transação,
injeta `request.jwt.claims` e faz `set local role authenticated` — só então o
RLS vale. A partir da Fase 3, **toda leitura de dado de tenant passa por ele**.

### `FORCE ROW LEVEL SECURITY`

Sem o `FORCE`, o dono da tabela ignora as policies. Como a aplicação conecta
como dono, o `ENABLE` sozinho seria decoração. Com `FORCE`, só papéis com
BYPASSRLS passam — que é exatamente o caso do seed e das migrations, operações
de infraestrutura sem usuário associado.

### `getUser()`, nunca `getSession()`

`getSession()` lê o cookie e acredita nele. `getUser()` valida o token contra o
servidor de auth. Cookie é dado vindo do cliente; decidir acesso com ele é o
mesmo erro de confiar num `tenant_id` enviado pelo browser.

### O tenant nasce no banco, não na aplicação

Um trigger em `auth.users` cria o tenant. Assim vale para qualquer caminho de
entrada — OAuth, convite, admin — e não existe janela em que o usuário está
autenticado mas sem tenant.

### O seed grava transações, não posições

As posições saem de `computePosition()`, o mesmo motor que a aplicação usa. Se o
motor estiver errado, os números do seed saem errados — que é o que se quer de
um dado de teste. O alternativo, escrever `position` na mão, violaria
CLAUDE.md §2.1 e esconderia bugs.

### Motor de ledger antecipado da Fase 3

`core/ledger/compute-position.ts` chegou aqui por necessidade do seed. Cobertura
em `src/core/ledger/__tests__/`: preço médio ponderado, venda parcial sem mexer
no preço médio, desdobramento, grupamento, bonificação, transferência sem lucro
fantasma, JCP líquido de IR e independência da ordem dos lançamentos.

---

## Estado atual

| Item | Situação |
|---|---|
| Schema completo (12 tabelas) | ✅ |
| RLS + trigger de signup | ✅ |
| Login com Google, middleware, guardas | ✅ |
| Contexto de tenant no servidor | ✅ |
| Motor de ledger + 14 testes | ✅ |
| Seed: classes + carteira de demonstração | ✅ |
| Teste de isolamento (6 casos) | ✅ — roda com `DIRECT_URL` |

**A interface ainda lê `src/mocks/`.** É proposital: a Fase 2 monta a fundação,
e a troca de mock por banco acontece na Fase 3, dentro de `server/queries/`, sem
tocar em nenhum componente.
