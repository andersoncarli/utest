---
sprint: "007"
slug: "trace-a-arvore-de-para-onde-foi-a-parede"
title: "Sprint 007 — report"
features: ["5.2", "5.3", "5.4", "5.5", "1.3", "3.3", "2.3"]
budget: null
state: "closed"
opened: "2026-09-03"
closed: "2026-09-03"
migrated: "0.2"
---

# 007 — Sprint 007 — report

> Primeiro sprint FECHADO sob o ZSS. O código estava no working tree quando o ZSS foi > instalado (2026-09-03) — este par plan/report o registra retroativamente e o commit > seguinte à instalação o consolida.

# PLAN

## Por que este sprint existe agora

**Context**

`probe` (sprint 006) responde "que FUNÇÃO custou" — mas um hog de `.eval.js` gasta o tempo
num `Bun.spawnSync` que dirige Chromium, invisível a `probe` (que é in-process). E o
`utest --trace` de um passo de eval revelou um bug adjacente: `Promise.race([work,
setTimeout])` nunca limpava o timer — um `setTimeout(10000)` por passo segurava o event
loop 10s DEPOIS do relatório (o "teardown misterioso").

**Objetivo**

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

## Features que este sprint toca

- **5 profiling** — `trace.js`, `trace-preload.mjs`, `trace.t.js` (features 5.2, 5.3,
  5.4, 5.5).
- **1 core** — o `clearTimeout` (feature 1.3); `leak.t.js` +15.
- **3 scan** — `registerPhaseSetup` no default export + `kinds.t.js` (feature 3.3/3.4).

## Criterio de pronto

- `trace.t.js` verde (14 testes / 32 checks): região aninhada credita self ao pai,
  `(untracked)` = grand − Σ filhas, `wrapSpawns` restaura, `chromeTrace` em µs, enxerto de
  fragmento no tempo certo, splice sem env é no-op.
- `leak.t.js` verde: "timer do timeout é limpo quando o trabalho ganha a corrida".
- `kinds.t.js` verde: "registerPhaseSetup — um recurso que a fase monta 1×".
- `bun utest.js .` verde.

# REPORT

Primeiro sprint fechado sob o ZSS. trace.js + trace-preload.mjs + --trace: a árvore de para-onde-foi-a-parede; e o clearTimeout que fecha a fuga de 10s do event loop.

## O que aconteceu

- **`trace.js`** (novo, ~250 linhas) — `install`/`mark`/`end`/`region`, `wrapSpawns()`,
  `buildTree` (remonta o aninhamento de `ts/dur/depth`), `tree()` (ms alinhados à direita,
  `(untracked)` explícito), `chromeTrace()`/`writeChromeTrace()` (Chrome Trace Event, µs),
  `finalize()` (o `(runtime teardown)` do bun no `process.on('exit')`).
- **`trace-preload.mjs`** (novo, 35 linhas) — `globalThis.__uTrace` (region/mark), despeja
  `<UTEST_TRACE_OUT>.<pid>` JSON no exit, inerte sem o env.
- **`trace.t.js`** (novo, 14 testes / 32 checks) — cobre `trace.js` de ponta a ponta,
  incluindo um subprocesso real escrevendo o fragmento.
- **`utest.js`** (+114 linhas) — `--trace`/`--trace=<path>`, o roteamento probe-vs-trace
  por fase, os `T.mark`/`T.end` nas regiões (`boot`, `provider`, `phaseSetup`,
  `sweepFeature`, `entry`), o apêndice de trace depois do relatório, `probe` instalado
  sobre `pixel._registry` + `soml.__internals` para hog de motor.
- **`clearTimeout` no `finally`** — `utest.js` (linha ~194) e `runner.js` (linhas ~27,
  ~90). `leak.t.js` +15 trava a mecânica.
- **`registerPhaseSetup`** no `default` export de `kinds.js` + teste em `kinds.t.js`.
- **Sidecar de falha no lugar certo** (`cache.js:278`) — `selfFile()` gravava em
  `.bot/.utest/` (nome legado de quando o utest vivia em `~/bot`), enquanto todo o resto
  do cache usa `.utest/`. Dois diretórios de cache no mesmo repo, um deles com um
  `times.json` de formato morto que ninguém mais escreve. Unificado em `.utest/`; `.bot/`
  apagado; a ref no `fs.watch` de `utest.js` e o `.bot/` do `.gitignore` limpos.
  `leak.t.js` (o único `.t.js` sem alvo pareado, o que exercita esse caminho) agora
  cacheia junto do `results.json`.

## Onde o PLAN errou

- **`trace.js` entrou com o melhor `.t.js` do repo** — 14 testes para um módulo novo, com
  a conta fechando (`Σ === grand`) verificada. É o padrão que as frentes 6 e 7 deveriam
  seguir.
- **O consumo no `utest.js` NÃO tem teste** (feature 5.5, 🟠). O `if (provider) → trace,
  senão → probe`, o teto de 60s, o "só se algum arquivo rodou" — tudo só exercitado
  rodando o soml. `trace.js` está coberto; a cola que o liga ao CLI não.
- **O bug do `clearTimeout` era antigo e sério** — 10s de event loop preso por passo de
  eval, por meses, mascarado como "teardown do bun". Foi o `--trace` deste próprio sprint
  que o denunciou: a ferramenta encontrou o bug que motivava a ferramenta.
- **`trace-preload.mjs` depende de o `.eval.js` do soml splicar `bun --import` na string
  de bash à mão** — contrato por convenção de env, não tipado (feature 5.3, 🟡 mas com
  essa ressalva).

## Frentes / features tocadas

| feature | efeito |
|---|---|
| 5.2 trace | ✅ implementada + `trace.t.js` verde → 🟡 |
| 5.3 trace de subprocesso | ✅ `trace-preload.mjs` + enxerto, coberto → 🟡 |
| 5.4 trace.json | ✅ `chromeTrace`/`writeChromeTrace` cobertos → 🟡 |
| 5.5 roteamento --trace | ⚠️ implementado, sem `.t.js` do consumo → 🟠 |
| 1.3 sealed / clearTimeout | ✅ o `clearTimeout` fechado, `leak.t.js` cobre → 🟡 |
| 3.3 kinds | ✅ `registerPhaseSetup` no default + teste → 🟡 |
| 2.3 cacheFailure (sidecar) | ✅ sidecar movido de `.bot/.utest/` para `.utest/` — mesma pasta do `results.json` |
