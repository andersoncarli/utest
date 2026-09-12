---
sprint: "003"
slug: "a-regra-do-cache-sem-furo"
title: "Sprint 003 — report"
features: ["2.1", "2.2", "3.3", "1.3"]
budget: null
state: "closed"
opened: "2026-09-03"
closed: "2026-09-03"
migrated: "0.2"
---

# 003 — Sprint 003 — report

> Sprint retroativo, reconstruído em 2026-09-03.

# PLAN

## Por que este sprint existe agora

**Janela**

`d9a14ad` … `b93b49e` (2026-09-01). 2 commits.

**Context**

O cache anterior usava bucket de **minuto**, sem grafo de deps. Dois furos reais:
uma edição no mesmo minuto era invisível (o teste pulava como verde); um `export` removido
em `scl/theme-params.js`, dois saltos além do alvo pareado, não invalidava nada — o crash
só aparecia com `--force`. "Um cache que serve verde sobre código quebrado é pior que não
ter cache."

**Objetivo**

Reescrever a regra do cache para **não ter furo se seguida à risca**, vivendo inteira nos
timestamps que todo inode já tem:

- ALVO cravado no **segundo** da última alteração; ms = contagem de checks (0 = verde,
  1 = falhou).
- CONJUNTO (alvo + testes) válido só quando todos no mesmo segundo E o alvo cravado.
- Grafo de deps que segue `import` — inclusive o de **efeito colateral** (`import './x'`
  sem `from`), que é como um plugin se registra.
- ms fracionário (arquivo escrito) ≠ ms inteiro (`utimesSync`) — separa carimbo de edição.
- Deps medidas contra o `atime` (precisão cheia), não o segundo cravado.

E, no mesmo movimento: `kinds.js` (o vocabulário de sufixos num lugar) e `leak.t.js`
(prender a mecânica do `check` tardio + o `clearTimeout`).

## Features que este sprint toca

- **2 cache** — a regra inteira, `cache.js` + `cache.t.js`.
- **3 scan** — `kinds.js` nasce (`register()` abre um tipo nas duas pontas); `scanner.js`
  encolhe de 89 linhas para menos (a lógica de sufixo migra para `kinds.js`).
- **1 core** — `leak.t.js` (sealed); `test.js` ganha `oncheck`/`sealed`.

## Criterio de pronto

- `cache.t.js` verde: a regra do conjunto, o que invalida, o grafo de deps.
- Quente e frio reportam o MESMO número.
- `kinds.t.js` verde: `register()` idempotente nas duas pontas.
- `leak.t.js` verde: o check tardio reabre o veredito; o timer é limpo.

# REPORT

Sprint retroativo. A regra do cache reescrita para não ter furo (bucket de segundo + grafo de deps); kinds.js nasce; leak.t.js trava o sealed.

## O que aconteceu

- **A regra do cache reescrita** (`d9a14ad` "-bug no sistema de cache +tests") — `cache.js`
  +198 linhas, `cache.t.js` +274. Bucket de segundo, grafo de deps recursivo (efeito
  colateral incluído), os dois detalhes que fecham a regra (ms inteiro vs. fracionário;
  deps contra `atime`).
- **`kinds.js` nasce** (+45 linhas) — o vocabulário de sufixos declarado uma vez;
  `scanner.js` encolhe 89→~30 (a lógica de sufixo migra). `kinds.t.js` +65.
- **`leak.t.js`** (`b93b49e`, +90 linhas) — prende a mecânica do check tardio; `test.js`
  ganha `oncheck`/`sealed`.
- **`scanner.t.js` +147** — `findTarget` e `scan` cobertos de verdade.

## Onde o PLAN errou

- **É o sprint mais sólido da história do repo.** A regra do cache é a única parte com
  cobertura à prova de regressão (`cache.t.js` = 42 testes / 75 checks) e um critério de
  aceite explícito (quente == frio). As duas regressões que a regra antiga deixava passar
  estão documentadas E cobertas.
- **`leak.t.js` tapa metade do problema de 002.** O `sealed` reabre o veredito de um
  `check` tardio — mas uma **exceção** assíncrona tardia continua atribuída ao arquivo
  seguinte. A frente 7 permanece aberta.
- **`kinds.js` foi bem desenhado** — `register()` nas duas pontas de uma vez, e um teste
  em `kinds.t.js` que prova "antes de registrar, não reconhece" (o que impede
  `register('eval')` global). Mas `registerExecutor`/`registerEntries` ficaram sem teste
  próprio (viriam no 004, e continuam sem).

## O que fica aberto

| frente | estado |
|---|---|
| 2 cache | 🟡 — a regra inteira coberta, quente == frio |
| 3 scan | 🟡 — `scanner.t.js` + `kinds.t.js` verdes |
| 1 core | 🟡 — `leak.t.js` trava o `sealed` |
