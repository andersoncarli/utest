# Sprint 007 — `--trace`: a árvore de PARA-ONDE-FOI-A-PAREDE

> Primeiro sprint FECHADO sob o ZSS. O código estava no working tree quando o ZSS foi
> instalado (2026-09-03) — este par plan/report o registra retroativamente e o commit
> seguinte à instalação o consolida.

## Context

`probe` (sprint 006) responde "que FUNÇÃO custou" — mas um hog de `.eval.js` gasta o tempo
num `Bun.spawnSync` que dirige Chromium, invisível a `probe` (que é in-process). E o
`utest --trace` de um passo de eval revelou um bug adjacente: `Promise.race([work,
setTimeout])` nunca limpava o timer — um `setTimeout(10000)` por passo segurava o event
loop 10s DEPOIS do relatório (o "teardown misterioso").

## Objetivo

1. **`trace.js`** — cronômetro de REGIÕES de wall-time (o análogo de `probe`): `install`/
   `mark`/`end`/`region`, `wrapSpawns()`, o `(untracked)` sempre explícito (Σ === relógio
   real). Duas saídas de um modelo só: árvore textual + `trace.json` (Chrome Trace Event).
2. **`trace-preload.mjs`** — `bun --import` que um `.eval.js` splica; marca regiões DENTRO
   do subprocesso e despeja o fragmento; `graftFragments` costura na folha `sh:`.
3. **`utest.js --trace` / `--trace=<path>`** — apêndice ao relatório. Liga `probe.tree()`
   para hog de motor in-process, a árvore de regiões para hog de `.eval.js`. Só escopo
   filtrado. Sob `--trace` o teto do `sh()` sobe p/ 60s.
4. **`clearTimeout` no `finally`** das corridas de `Promise.race` — `utest.js` e
   `runner.js`. Coberto por `leak.t.js`.
5. **`registerPhaseSetup`** movido para o `default` export de `kinds.js` + teste em
   `kinds.t.js`.

## Frentes tocadas

- **5 profiling** — `trace.js`, `trace-preload.mjs`, `trace.t.js` (features 5.2, 5.3,
  5.4, 5.5).
- **1 core** — o `clearTimeout` (feature 1.3); `leak.t.js` +15.
- **3 scan** — `registerPhaseSetup` no default export + `kinds.t.js` (feature 3.3/3.4).

## Requisitos verificáveis

- `trace.t.js` verde (14 testes / 32 checks): região aninhada credita self ao pai,
  `(untracked)` = grand − Σ filhas, `wrapSpawns` restaura, `chromeTrace` em µs, enxerto de
  fragmento no tempo certo, splice sem env é no-op.
- `leak.t.js` verde: "timer do timeout é limpo quando o trabalho ganha a corrida".
- `kinds.t.js` verde: "registerPhaseSetup — um recurso que a fase monta 1×".
- `bun utest.js .` verde.
