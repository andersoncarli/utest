# Sprint 004 — preparação do `.eval.js`: executor, entries, phaseSetup

> Sprint retroativo, reconstruído em 2026-09-03.

## Janela

`dbb49ed` … `b1586c7` (2026-09-02). 2 commits.

## Context

O soml queria rodar `sprint eval --sweep` reusando este runner para executar `.eval.js`
em milissegundos em vez de minutos. Isso exigia três ganchos que o `kinds.js` de 003 não
tinha: um executor (`.eval.js` não é módulo ESM chamando `test()`, exporta `(t) => {}`),
um provedor de entries (`.eval.js` vive em `plans/**`, fora do walk), e um setup de fase
(subir o Chromium uma vez, não por arquivo).

## Objetivo

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

## Frentes tocadas

- **3 scan** — os três ganchos em `kinds.js`.
- **6 compat** — `tuit.js`.
- **2 cache** — `cacheFailure` + `extraDeps` em `cache.js`.
- **5 profiling** — `probe.js` nasce.
- **1 core** — `console-capture.js`.

## Requisitos verificáveis

- `kinds.t.js` verde incluindo `registerPhaseSetup`.
- `cache.t.js` verde incluindo `cacheFailure` e `extraDeps`.
- `probe.t.js` verde.
