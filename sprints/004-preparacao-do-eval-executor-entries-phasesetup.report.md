---
sprint: 4
date: 2026-09-03
features: [3.4, 6.4, 2.3, 5.1, 1.4]
---
# Sprint 004 — report

Sprint retroativo. Os três ganchos de extensão (executor/entries/phaseSetup), tuit.js, console-capture, cacheFailure e probe — a preparação do .eval.js.

## O que entregou

- **Os três ganchos** (`dbb49ed`) — `kinds.js` +34: `registerExecutor`, `registerEntries`,
  `registerPhaseSetup` + os `*For(kind)` correspondentes. `utest.js` +218 para consumi-los
  em `runPhase` (o provider, o `phaseSetup`, o `executor`).
- **`tuit.js`** (`dbb49ed`, +115) — `parseTuitText` + `runTuitBlocks`; blocos acumulam via
  `_assign`/`soml`, `·` é conteúdo.
- **`console-capture.js`** (`dbb49ed`, +20) — um módulo, os dois `runTest`.
- **`cacheFailure` + `extraDeps`** (`b1586c7`) — `cache.js` +106; `cache.t.js` +130 cobre
  o vermelho reproduzível e o `extraRoots`.
- **`probe.js`** (`b1586c7` + `dbb49ed`, +155/+78) — as três formas, self-time, `report()`.
  `probe.t.js` +96.

## Visão crítica

- **Muita superfície nova, cobertura desigual.** `cacheFailure` e `probe` ganharam `.t.js`
  robusto. Mas `registerExecutor` e `registerEntries` — o coração de "o soml reusa este
  runner" — só são exercitados **de lado**, quando o soml roda. Nenhum `.t.js` no utest
  os prende (feature 3.4, 🟠 até hoje).
- **`tuit.js` entrou sem `tuit.t.js`.** Um parser com `Function(...)` (executa o objeto
  literal como código) e uma regra sutil de raiz-nova-vs-parcial, sem nada travando —
  feature 6.4, 🟠.
- **O `utest.js` cresceu 218 linhas numa janela.** O `runPhase` virou a função mais densa
  do repo (provider vs. `_isFile` vs. `scan`, `phaseSetup`, `executor`, cache, results,
  trace) — sem um `.t.js` que a cubra.

## Estado das frentes ao fim da janela

| frente | estado |
|---|---|
| 3 scan | 🟡 (3.1-3.3) / 🟠 (3.4 ganchos) |
| 6 compat | 🟠 — `tuit.js` sem teste |
| 2 cache | 🟡 — `cacheFailure` coberto |
| 5 profiling | 🟡 — `probe.t.js` verde |
| 1 core | 🟠 — `console-capture` sem teste próprio |
