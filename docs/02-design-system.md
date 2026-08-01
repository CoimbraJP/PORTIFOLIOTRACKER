# 02 — Design System e Identidade Visual

> Referências: Linear, Raycast, Arc, Stripe Dashboard, CoinMarketCap, Apple, Framer.
> Filosofia: **poucos efeitos, extremamente bem executados.**

---

## 1. Princípios

1. **O número é o herói.** Tudo na tela existe para destacar um valor. Ornamento
   que compete com o número é ornamento errado.
2. **Silêncio visual.** Se um elemento não ajuda a decidir, ele sai.
3. **Movimento com propósito.** Cada animação comunica estado, hierarquia ou
   causalidade. Animação decorativa é ruído.
4. **Neon é tempero, não prato.** O glow aparece em resposta ao usuário — no
   hover, no foco, no dado ativo. Nunca em repouso, nunca em tudo ao mesmo tempo.
5. **Contraste a serviço da leitura.** Fundo profundo, texto claro, cor de
   destaque escassa. Cor gasta em excesso perde o poder de dirigir o olhar.

---

## 2. Paleta

### Fundos — cinzas frios, quase pretos
Fundo puro `#000` é evitado: mata a profundidade e faz as sombras sumirem.

| Token | Hex | Uso |
|---|---|---|
| `--bg-base` | `#08090C` | fundo da aplicação |
| `--bg-surface` | `#0D0F14` | cards, painéis |
| `--bg-elevated` | `#13161D` | modais, popovers, dropdowns |
| `--bg-hover` | `#181C25` | estado hover de linhas e itens |
| `--border-subtle` | `#1D212B` | divisórias, bordas em repouso |
| `--border-strong` | `#2A2F3D` | bordas em foco |

### Texto
| Token | Hex | Uso |
|---|---|---|
| `--text-primary` | `#F2F4F8` | números grandes, títulos |
| `--text-secondary` | `#9BA3B4` | rótulos, descrições |
| `--text-muted` | `#5C6478` | metadados, timestamps |

### Cor de destaque — **Ciano elétrico**

Escolha: **ciano**. Motivo — o verde e o vermelho já estão semanticamente
ocupados por alta e baixa (é o vocabulário universal do mercado financeiro).
O ciano não conflita com nenhum dos dois, tem a assinatura tecnológica pedida, e
mantém legibilidade sobre fundo escuro melhor que roxo. O azul puro cairia perto
demais do azul institucional de banco — justamente o que este produto não é.

| Token | Hex | Uso |
|---|---|---|
| `--accent` | `#22D3EE` | ação primária, foco, dado ativo |
| `--accent-hover` | `#67E8F9` | hover |
| `--accent-dim` | `#0E7490` | linhas de gráfico secundárias |
| `--accent-glow` | `rgba(34,211,238,0.35)` | halo de hover e foco |

### Cores semânticas
| Token | Hex | Uso |
|---|---|---|
| `--positive` | `#34D399` | lucro, alta |
| `--negative` | `#F87171` | prejuízo, baixa |
| `--warning` | `#FBBF24` | dado desatualizado, atenção |

Verde e vermelho são **funcionais**. Nunca decorativos, nunca em botões ou fundos.

### Cores por classe de ativo
Cada classe recebe uma cor fixa, usada no donut de distribuição e no indicador
lateral do card. Todas na mesma faixa de saturação para não brigarem entre si.

```
Ações Brasil #22D3EE   Stocks #818CF8    FIIs #2DD4BF
ETFs #38BDF8           ETFs Int. #A78BFA Criptomoedas #FBBF24
Renda Fixa #34D399     Imóveis #FB923C   Empréstimos #F472B6
Alternativos #C084FC   Empresas #60A5FA  Outros #94A3B8
```

---

## 3. Tipografia

| Papel | Fonte | Nota |
|---|---|---|
| Interface | **Geist Sans** (fallback: Inter) | moderna, neutra, ótima em pesos baixos |
| Números | **Geist Mono** com `tabular-nums` | **obrigatório** — dígitos de largura fixa impedem o número de "dançar" ao atualizar |

```css
.numeric { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
```

### Escala
| Token | Tamanho / altura | Peso | Uso |
|---|---|---|---|
| `display` | 48 / 52 | 600 | patrimônio total |
| `h1` | 30 / 36 | 600 | título de página |
| `h2` | 22 / 28 | 600 | título de seção |
| `metric` | 28 / 34 | 600 | número de card |
| `body` | 14 / 22 | 400 | padrão |
| `label` | 12 / 16 | 500 | rótulo, `letter-spacing: 0.02em` |
| `caption` | 11 / 14 | 500 | metadado, uppercase |

Títulos usam `letter-spacing: -0.02em`. Texto corrido, `0`.

---

## 4. Espaçamento, raio e elevação

**Grid de 4px.** Escala: `4 8 12 16 24 32 48 64 96`.

Respiro generoso, conforme pedido:
- padding interno de card: **24px** (32px nos cards principais do dashboard)
- espaço entre cards: **20px**
- espaço entre seções: **48px**
- margem lateral da página: **32px** (24px no mobile)

**Raio:** `sm 8` · `md 12` · `lg 16` · `xl 20` (cards) · `full` (pills).

**Elevação** — sombras difusas e baixas, nunca duras:
```css
--shadow-sm:   0 1px 2px rgba(0,0,0,.4);
--shadow-md:   0 4px 16px rgba(0,0,0,.45);
--shadow-lg:   0 12px 32px rgba(0,0,0,.55);
--shadow-glow: 0 0 0 1px rgba(34,211,238,.28), 0 8px 28px rgba(34,211,238,.14);
```

---

## 5. Movimento

### Durações e curvas
| Token | Valor | Uso |
|---|---|---|
| `--dur-instant` | 120ms | feedback de clique |
| `--dur-fast` | 180ms | hover |
| `--dur-base` | 260ms | expansão, troca de aba |
| `--dur-slow` | 420ms | entrada de página |

```css
--ease-out:   cubic-bezier(0.16, 1, 0.3, 1);    /* padrão — saída suave */
--ease-inout: cubic-bezier(0.65, 0, 0.35, 1);   /* movimento contínuo */
--spring:     { stiffness: 300, damping: 30 }   /* Motion — cards e layout */
```

**Regra rígida de performance:** só `transform` e `opacity` animam. Nunca
`width`, `height`, `top`, `left`, `box-shadow` em keyframes. Altura variável usa
Motion layout animation, não transição de `height`.

### Catálogo de interações

**Card em hover**
```
translateY: 0 → -4px
shadow: md → lg
border: --border-subtle → rgba(34,211,238,.28)
+ halo: 0 0 24px rgba(34,211,238,.10)
duração 180ms, ease-out
```

**Botão primário em hover** — borda ilumina, glow externo cresce de 0 para 12px,
brilho interno sutil percorre a superfície. Sem mudança de escala.

**Clique (qualquer elemento acionável)** — `scale: 0.97` em 120ms, retorno em
spring. Confirma o toque sem parecer brinquedo.

**Entrada de página** — `opacity 0→1` + `translateY 8px→0`, 420ms, com
stagger de 40ms entre os cards. Nunca ultrapassar 6 elementos no stagger.

**Troca de aba** — indicador desliza com `layoutId` do Motion; conteúdo faz
cross-fade de 180ms.

**Expansão de linha (tabela por classe)** — Motion layout animation, altura
automática, 260ms `ease-out`. Chevron gira 180°.

**Atualização de valor** — contador anima do valor anterior ao novo em 800ms
`ease-out`, com um flash de cor semântica (verde/vermelho) de 400ms que decai.
Usa `useSpring` do Motion sobre um valor numérico, não re-render por frame.

**Linha de tabela em hover** — fundo vai a `--bg-hover`, e uma barra de 2px em
`--accent` aparece à esquerda com `scaleY 0→1` a partir do centro.

**Skeleton** — shimmer sutil, `opacity` pulsando entre .4 e .7. Nunca spinner.

### Acessibilidade
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
  }
}
```
Obrigatório. Movimento é preferência, não imposição.

---

## 6. Uso do neon — as três regras

1. **Só em resposta.** Glow aparece no hover, no foco ou no dado ativo. Nunca em
   estado de repouso.
2. **No máximo um elemento brilhando por vez** dentro de uma mesma região visual.
3. **Opacidade máxima de 0.35** no halo. Acima disso vira videogame.

Onde o neon é permitido: botão primário (hover/foco), card em hover, aba ativa,
linha do gráfico (gradiente descendente até transparente), anel de foco de input,
ponto ativo do tooltip.

Onde é **proibido**: textos, ícones em repouso, bordas de tabela, fundos, e
qualquer elemento que apareça mais de três vezes na mesma tela.

---

## 7. Gráficos

**Linha (evolução patrimonial)**
- `strokeWidth: 2`, `type="monotone"` (curva suave, sem overshoot)
- Gradiente vertical sob a linha: `--accent` a 18% → transparente
- Glow: uma cópia da linha com `filter: blur(6px)` e `opacity .35` por baixo
- Grid: só horizontais, `--border-subtle`, `strokeDasharray: 3 3`
- Eixos sem linha, rótulos em `--text-muted`, `caption`
- Animação de entrada: `strokeDashoffset` desenhando a linha em 900ms
- Hover: ponto com anel de glow + linha vertical tracejada

**Tooltip** — fundo `--bg-elevated`, `backdrop-filter: blur(12px)`, borda
`--border-subtle`, raio `md`, sombra `lg`, padding 12px. Aparece com fade +
`translateY 4px` em 140ms. Números em `tabular-nums`.

**Donut (distribuição)** — anel fino (`innerRadius 72%`), gap de 2px entre
fatias, cor por classe, centro com o patrimônio total. Fatia em hover cresce 4px
para fora; as demais caem para `opacity .5`.

**Barras (renda passiva mensal)** — cantos superiores arredondados 4px, cor
`--accent-dim`, barra em hover vira `--accent` com glow. Entrada com `scaleY`
a partir da base, stagger de 30ms.

---

## 8. Glassmorphism — onde é permitido

Apenas em superfícies que **flutuam sobre conteúdo**: header fixo, command
palette, modais, tooltips, dropdowns.

```css
background: rgba(19,22,29,.72);
backdrop-filter: blur(16px) saturate(1.3);
border: 1px solid rgba(255,255,255,.06);
```

Cards do dashboard **não** usam glass — eles são a base, não a camada de cima.
Glass sobre glass vira sopa visual.

---

## 9. Catálogo de componentes base

**Primitivos** — `Button` (primary/secondary/ghost/danger), `Input`, `Select`,
`Combobox`, `DatePicker`, `MoneyInput` (máscara + moeda), `Switch`, `Checkbox`,
`Tabs`, `Tooltip`, `Dialog`, `Sheet`, `DropdownMenu`, `Badge`, `Skeleton`,
`EmptyState`.

**Dados** — `DataTable` (sort, filtro, linha expansível, virtualização),
`MetricCard`, `AnimatedNumber`, `TrendIndicator` (seta + %, cor semântica),
`Sparkline`, `AllocationBar`, `AssetAvatar` (logo com fallback para inicial),
`CurrencyValue` (respeita moeda base e modo privacidade).

**Gráficos** — `AreaChartGlow`, `DonutAllocation`, `MonthlyIncomeBars`.

**Layout** — `AppShell`, `Sidebar` (colapsável), `PageHeader`, `Section`,
`CardGrid`, `ViewSwitcher` (Classes ⇄ Carteiras).

**Domínio** — `ClassRow` (expansível, estilo Investidor10), `WalletCard`,
`PositionRow`, `TransactionForm`, `DynamicFieldForm` (a partir do `field_schema`),
`PrivacyToggle`.

---

## 10. Layout do dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  Sidebar  │  Header: busca · moeda · privacidade · perfil   │
│  (240px)  ├─────────────────────────────────────────────────┤
│           │  ┌───────────────────────────────────────────┐  │
│  Visão    │  │  PATRIMÔNIO TOTAL      R$ 1.284.930,00    │  │
│  Classes  │  │  ▲ 12,4% no mês        + R$ 141.820       │  │
│  Carteiras│  └───────────────────────────────────────────┘  │
│  Histórico│  ┌────────┬────────┬────────┐                   │
│  Proventos│  │Investido│ Lucro │Variação│  ← 3 MetricCards  │
│  Ativos   │  └────────┴────────┴────────┘                   │
│           │  ┌──────────────────────┬────────────────────┐  │
│           │  │  Evolução patrimonial│   Distribuição     │  │
│           │  │  (área com glow)     │   (donut)          │  │
│           │  └──────────────────────┴────────────────────┘  │
│           │  ┌───────────────────────────────────────────┐  │
│           │  │  Por classe — linhas expansíveis          │  │
│           │  │  ▸ Criptomoedas   4 ativos  R$ 480k  37%  │  │
│           │  │  ▾ Ações Brasil   7 ativos  R$ 312k  24%  │  │
│           │  │      BBAS3 · VALE3 · PETR4 ...            │  │
│           │  └───────────────────────────────────────────┘  │
└───────────┴─────────────────────────────────────────────────┘
```

O `ViewSwitcher` no topo alterna entre **Classes** e **Carteiras** com transição
de layout compartilhado — a mesma tabela se reorganiza, não recarrega.

---

## 11. Tokens em código

Tudo vive em `styles/tokens.css` dentro do `@theme` do Tailwind v4. Nenhum valor
hexadecimal literal no código de componente — **regra de lint**. Se uma cor não
está nos tokens, ela não existe no produto.
