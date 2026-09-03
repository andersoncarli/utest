---
sprint: 3
date: 2026-09-03
features: [2.1, 2.2, 3.3, 1.3]
---
# Sprint 003 — report

Sprint retroativo. A regra do cache reescrita para não ter furo (bucket de segundo + grafo de deps); kinds.js nasce; leak.t.js trava o sealed.

## O que entregou

- **A regra do cache reescrita** (`d9a14ad` "-bug no sistema de cache +tests") — `cache.js`
  +198 linhas, `cache.t.js` +274. Bucket de segundo, grafo de deps recursivo (efeito
  colateral incluído), os dois detalhes que fecham a regra (ms inteiro vs. fracionário;
  deps contra `atime`).
- **`kinds.js` nasce** (+45 linhas) — o vocabulário de sufixos declarado uma vez;
  `scanner.js` encolhe 89→~30 (a lógica de sufixo migra). `kinds.t.js` +65.
- **`leak.t.js`** (`b93b49e`, +90 linhas) — prende a mecânica do check tardio; `test.js`
  ganha `oncheck`/`sealed`.
- **`scanner.t.js` +147** — `findTarget` e `scan` cobertos de verdade.

## Visão crítica

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

## Estado das frentes ao fim da janela

| frente | estado |
|---|---|
| 2 cache | 🟡 — a regra inteira coberta, quente == frio |
| 3 scan | 🟡 — `scanner.t.js` + `kinds.t.js` verdes |
| 1 core | 🟡 — `leak.t.js` trava o `sealed` |
