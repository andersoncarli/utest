---
front: 5
keyword: profiling
title: Profiling — que função custou, que região custou
state: active
updated: 2026-09-03
---
# [5] profiling — dissecar UM hog

Duas ferramentas complementares, ligadas pelo `--trace` conforme a fase:

- **`probe.js`** responde *"que FUNÇÃO custou"* — grafo caller▸callee, self-time por
  chamada. Duas vistas: flat (`report()` — "quem custa") e grafo (`tree()`/`callers()`/
  `edges()` — "de ONDE, e quanto pesa cada contexto"). É para MEDIR; `spyOn` é para
  ASSERTAR.
- **`trace.js`** + **`trace-preload.mjs`** respondem *"que REGIÃO de tempo custou"* —
  boot, entry, o `Bun.spawnSync` do check, e o `(untracked)` (sempre explícito, a soma
  bate com o relógio real). Um modelo, duas saídas: árvore textual + `trace.json` (Chrome
  Trace Event).

`utest --trace` liga `probe.tree()` para um hog de motor in-process, a árvore de regiões
para um hog de `.eval.js` cujo custo mora num subprocesso. Só escopo filtrado.

Coberto por `probe.t.js` (15/39) e `trace.t.js` (14/32). Suite verde 2026-09-03.
