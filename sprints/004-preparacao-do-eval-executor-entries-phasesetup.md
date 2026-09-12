---
sprint: "004"
slug: "preparacao-do-eval-executor-entries-phasesetup"
title: "Sprint 004 — report"
features: ["3.4", "6.4", "2.3", "5.1", "1.4"]
budget: null
state: "closed"
opened: "2026-09-03"
closed: "2026-09-03"
migrated: "0.2"
---

# 004 — Sprint 004 — report

> Sprint retroativo, reconstruído em 2026-09-03.

# PLAN

## Por que este sprint existe agora

**Janela**

`dbb49ed` … `b1586c7` (2026-09-02). 2 commits.

**Context**

O soml queria rodar `sprint eval --sweep` reusando este runner para executar `.eval.js`
em milissegundos em vez de minutos. Isso exigia três ganchos que o `kinds.js` de 003 não
tinha: um executor (`.eval.js` não é módulo ESM chamando `test()`, exporta `(t) => {}`),
um provedor de entries (`.eval.js` vive em `plans/**`, fora do walk), e um setup de fase
(subir o Chromium uma vez, não por arquivo).

**Objetivo**

1. **`registerExecutor(kind, fn)`** — `fn(entry, helpers)` devolve os PASSOS a registrar
   como `test()` filhos.
2. **`registerEntries(phase, fn)`** — entries diretas, sem walk.
3. **`registerPhaseSetup(phase, fn)`** — recurso montado 1× por fase, derrubado depois.
4. **`tuit.js`** — o parser+executor `.tuit` (o `kinds.js` já reconhecia o sufixo, nada
   executava).
5. **`console-capture.js`** — `console.*` não vaza de teste verde (compartilhado pelos
   dois `runTest`).
6. **`cache` para evals** — `cacheFailure` (o vermelho reproduzível de eval não re-roda),
   `extraDeps` (o `files:` do `.md` de feature como grafo).
7. **`probe.js`** — instrumentar chamadas para achar hogs (a preparação do profiling).

## Features que este sprint toca

- **3 scan** — os três ganchos em `kinds.js`.
- **6 compat** — `tuit.js`.
- **2 cache** — `cacheFailure` + `extraDeps` em `cache.js`.
- **5 profiling** — `probe.js` nasce.
- **1 core** — `console-capture.js`.

## Criterio de pronto

- `kinds.t.js` verde incluindo `registerPhaseSetup`.
- `cache.t.js` verde incluindo `cacheFailure` e `extraDeps`.
- `probe.t.js` verde.

# REPORT

Sprint retroativo. Os três ganchos de extensão (executor/entries/phaseSetup), tuit.js, console-capture, cacheFailure e probe — a preparação do .eval.js.

## O que aconteceu

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

## Onde o PLAN errou

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

## O que fica aberto

| frente | estado |
|---|---|
| 3 scan | 🟡 (3.1-3.3) / 🟠 (3.4 ganchos) |
| 6 compat | 🟠 — `tuit.js` sem teste |
| 2 cache | 🟡 — `cacheFailure` coberto |
| 5 profiling | 🟡 — `probe.t.js` verde |
| 1 core | 🟠 — `console-capture` sem teste próprio |
