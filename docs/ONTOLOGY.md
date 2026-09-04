# ONTOLOGY.md — o mapa de componentes do utest

Retrato do código como ele está em 2026-09-03, e a base da divisão em frentes/features do
ZSS (`plans/`). Para o ESTADO do trabalho use `sprint fronts` — este arquivo é o mapa
estático, não o board.

> **Disciplina do `sprint scan`.** `.sprint/ontology.json` (o índice tf-idf, ~435KB) é
> VERSIONADO — `sprint find <termo>` / `sprint file <path>` funcionam no clone sem rodar
> scan. Mas ele muda a cada scan de qualquer arquivo, então: **rode `sprint scan` só ao
> fechar um sprint**, não a cada edição. O churn fica em 1×/sprint em vez de 1×/commit.
> `sprint fronts`/`files`/`eval`/`test` NÃO dependem dele — só `find`/`file`/`scan` leem.

## As 7 frentes

| # | keyword | o que é | features |
|---|---|---|---|
| 1 | **core** | o par mínimo que um arquivo toca: `test()` coleta, `check()` afirma, `sealed` protege o veredito | 1.1–1.4 |
| 2 | **cache** | `TestCache(root)` — a regra do mtime sem furo, o grafo de deps, `cacheFailure`, o `results.json` (índice + cross-check) | 2.1–2.5 |
| 3 | **scan** | `scanner.js` + `kinds.js` — walk por glob, `findTarget`, vocabulário de sufixos, os ganchos de extensão | 3.1–3.5 |
| 4 | **report** | `viewer.js` + o render de `utest.js` — compacto por desenho, `🐢N` = segundos, verbosidade derivada do escopo, `--json` | 4.1–4.5 |
| 5 | **profiling** | `probe.js` (que função custou) + `trace.js`/`trace-preload.mjs` (que região custou), ligados pelo `--trace` | 5.1–5.5 |
| 6 | **compat** | `shims.js` (bun:test/jest), o plugin `onLoad`, `migrate.js` (codemod de saída), `tuit.js` (snapshot ASCII) | 6.1–6.4 |
| 7 | **isolation** | o alvo arquitetural: worker por arquivo. Hoje in-process; `runner.js`/`worker.js` são a base | 7.1–7.3 |

## O grafo de módulos

```
                       index.js ──▶ utest.js  (o CLI, ←19 dependentes)
                                       │
        ┌──────────────┬───────────────┼───────────────┬──────────────┐
        ▼              ▼               ▼               ▼              ▼
   scanner.js      viewer.js       kinds.js        test.js       check.js
        │                             │               │              │
        ▼                             │               └──── console-capture.js
    cache.js ◀────────────────────────┘
   (results.json)

   probe.js   trace.js + trace-preload.mjs        ← só sob --trace
   shims.js ◀── setup.js ◀── worker.js ── runner.js   ← caminho de subprocesso
   tuit.js    migrate.js    shimmer.js    paths.js     ← periféricos / ferramentas
```

`utest.js` faz `import { G } from '../utils/globals.d.js'; await G._ready` — **acoplamento
externo duro** ao submódulo irmão `../utils/` (`bus`, `is`, `toSource`, `callstack`,
`normalize`, `cl`, `hash53`, `forEach`, `dotfill`, `withTempDir`).

## Módulo por módulo

| arquivo | papel | teste | frente.feature |
|---|---|---|---|
| `utest.js` | CLI in-process: args → scan → import alvo → `runTest` → cache → render; orquestra as fases | — (leak) | toca 1.3, 3.4, 4.x, 5.x, 7.2 |
| `test.js` | coletor: `test()` monta a árvore; `begin/end` isola por arquivo; `oncheck`/`sealed` | `test.t.js` | 1.1, 1.3 |
| `check.js` | `check`/`checkFail`/`checkException`, comparação por `repr()` | `check.t.js` | 1.2 |
| `console-capture.js` | captura `console.*` durante um `fn` | — | 1.4 |
| `cache.js` | `TestCache(root)`: regra do mtime, grafo de deps, `cacheFailure`, `results` | `cache.t.js` | 2.1–2.5 |
| `scanner.js` | walk por glob, `findTarget`, `scan()` → `{entries, uncovered, cache}` | `scanner.t.js` | 3.1, 3.2, 3.5 |
| `kinds.js` | vocabulário de sufixos; `register`/`registerExecutor`/`registerEntries`/`registerPhaseSetup` | `kinds.t.js` | 3.3, 3.4, 6.4 |
| `viewer.js` | `phaseLine`, `compactFails`, `progressBar`, `deltaTag`, `view`/`fullView`, `hogReport` | `viewer.t.js` (parcial) | 4.1, 4.2, 4.4, 4.5 |
| `probe.js` | instrumenta chamadas p/ hogs: flat (`report`) + grafo (`tree`/`callers`/`edges`) | `probe.t.js` | 5.1 |
| `trace.js` | cronômetro de regiões de wall-time: `install/mark/end/region`, `wrapSpawns`, `chromeTrace` | `trace.t.js` | 5.2, 5.4 |
| `trace-preload.mjs` | `bun --import` que marca regiões dentro do subprocesso e despeja o fragmento | `trace.t.js` (de lado) | 5.3 |
| `shims.js` | `describe`/`it`/`expect` (~40 matchers), lifecycle hooks, `spyOn` | — | 6.1 |
| `setup.js` | instala shims + globais de `../utils/src` + plugin de load (caminho de subprocesso) | — | 6.2 |
| `shimmer.js` | shim por reescrita de string — **zero refs, candidato a DELETE** | — | 6.2 |
| `migrate.js` | codemod `expect()` → `check()` (transforms determinísticos, pula lifecycle) | — | 6.3 |
| `tuit.js` | parser + executor `.tuit` (JSON + arte ASCII, blocos acumulam via `_assign`/`soml`) | — | 6.4 |
| `runner.js` | `runTest`/`run`/`loadFile`/`serialize` — execução modular; a fase `eval` do soml usa este | — | 7.3, 1.3 |
| `worker.js` | base p/ execução isolada por arquivo (1 arquivo = 1 processo) | — | 7.1 |
| `index.js` | `import './utest.js'` (bin) — INFRA | — | — |
| `paths.js` | `ROOT`/`TEST_DIR`/`SRC_DIR` — INFRA | — | — |
| `leak.t.js` | prende a mecânica do check tardio / `clearTimeout` — não tem alvo pareado | (é teste) | 1.3, 7.2 |

## Accomplishments (o que já está sólido)

- **A regra do cache não tem furo** e o critério de aceite é duro: quente == frio, byte a
  byte (frente 2). Duas regressões reais que a regra antiga deixava passar estão
  documentadas e cobertas.
- **`sealed` + `clearTimeout`** (1.3) — o check tardio não some, e a fuga de event-loop de
  10s por passo de eval foi consertada nos dois runners. Coberto por `leak.t.js`.
- **Um relatório, todo kind igual** (4.1) — `unit`/`eval`/`int`/`tui` renderizam idêntico;
  `🐢` sempre significa segundos. Sprints 084c/084d do soml (staged) são a história.
- **Os ganchos de extensão** (3.4) — `sprint eval --sweep` do soml reusa este runner sem
  forkar nada; o Chromium sobe uma vez por fase.
- **`probe` + `trace`** (frente 5) — duas ferramentas complementares, cada uma com teste
  próprio; `probe` já denunciou o hog real de perf do soml (GOPD em `mergeProps`).

## Debts (o backlog, em ordem de peso)

1. **Cobertura: 12 features 🟠 sem `.t.js` próprio** (3.4, 3.5, 4.3–4.5, 5.5, toda a
   frente 6, 7.1, 7.3). `shims.js` (~40 matchers) e `migrate.js` (um codemod que reescreve
   arquivos) são os mais perigosos sem teste. Ver `plans/3-scan/3.5`.
2. **Isolamento por worker não está no caminho principal** (7.1) — a doc antiga
   (`TEST-MASTER-PLAN.md`, `HANDOFF.md`) descreve `orchestrator.js`/`child-worker.js` que
   **não existem neste repo**. O `utest.js` ativo é in-process, e o vazamento de exceção
   assíncrona cross-arquivo (7.2) só fecha de vez com isso.
3. **Dois `runTest`** (`utest.js` e `runner.js`) mantidos em sincronia à mão — `console-capture.js`
   existe justamente porque um fix voltou pela cópia não-consertada.
4. **Dois `plugin()` de load** (`utest.js` e `setup.js`) — divergência esperando acontecer.
5. ~~**`TEST.yaml`**: a fase `integration` vazia distorce `coverage: N%`;
   `--uncovered`/`-u` é inerte.~~ FECHADO — fase sem entries fora do denominador,
   `index.js`/`paths.js` no exclude de infra, `--uncovered` imprime a lista.
6. **Código morto**: `shimmer.js` (0 refs). Decidir DELETE.
7. **Doc velha apontando para código que mudou de casa**: `STATUS.md` diz "o destino é
   `cmds/testio/testio.js`" (fora deste repo); `HANDOFF.md`/`TEST-MASTER-PLAN.md` falam de
   `~/bot/utest`. Decidir se o utest ABSORVE o isolamento ou é a referência de contrato.

## Áreas ativamente ignoradas

`sprint files` diz **cobertura 100%** porque tudo que não é feature está em
`.sprint/config.json` `ignore` — declarado, não esquecido. `sprint files --all` lista os
padrões; a razão de cada um:

| padrão ignorado | por quê |
|---|---|
| `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `CHANGELOG.md` | gerados pelo `sprint init` — instruções de agente e ponteiro de método, não código do projeto |
| `README.md` | porta de entrada escrita à mão (o que o projeto é) — o board é o estado |
| `STATUS.md` | board GERADO (`sprint board --write`) — nunca editado à mão, nada a testar |
| `HANDOFF.md`, `MOCKUP.md` | notas de sessão / mockup de UI do relatório — prosa histórica, não spec viva |
| `TEST-MASTER-PLAN.md`, `TEST-MASTER-PLAN-2.md` | o plano de refactor de 2026 (workers, streaming) — descreve `~/bot/utest`, arquivos que mudaram de casa. O que sobrou de vivo virou a frente **7 isolation** |
| `TEST-PROBLEMS-I-FOUND.md`, `TEST-SPEC.md`, `TEST-SPEC-1.md` | achados e contrato-alvo em prosa de 2026-06 — o contrato que vale hoje está nos `requirements:` das features |
| `docs/SPRINT-EXPERIENCE.md` | log de bugs/atritos da ferramenta `sprint` em si — não afirma nada sobre o utest, não envelhece |

**Não ignorado, mas sem `.t.js` próprio** (isso é dívida de TESTE, rastreada na feature
[3.5], não "ignorado"): `utest.js`, `runner.js`, `shims.js`, `setup.js`, `tuit.js`,
`migrate.js`, `console-capture.js`, `worker.js`, `shimmer.js`,
`trace-preload.mjs`, `paths.js`, `index.js`.

**A diferença**: um arquivo *ignorado* nunca vai ter feature nem teste (é doc, é gerado, é
infra de 3 linhas). Um arquivo *sem `.t.js`* está no mapa (ligado a uma feature) e a falta
de teste é uma linha do backlog.
