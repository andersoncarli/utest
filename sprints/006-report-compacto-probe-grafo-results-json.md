---
sprint: "006"
slug: "report-compacto-probe-grafo-results-json"
title: "Sprint 006 — report"
features: ["5.1", "4.1", "4.2", "4.3", "2.4", "2.5"]
budget: null
state: "closed"
opened: "2026-09-03"
closed: "2026-09-03"
migrated: "0.2"
---

# 006 — Sprint 006 — report

> Sprint retroativo, reconstruído em 2026-09-03.

# PLAN

## Por que este sprint existe agora

**Janela**

`e7f1b66` … `40368b6` (2026-09-02 … 2026-09-03). 3 commits.

**Context**

O relatório antigo (`═══`, `checkView` por check, `received: false`/`expected: true`) dava
~240 linhas com 45 vermelhos. Cache quente e frio divergiam (o `(Nms)` dos vermelhos só
aparecia quando o arquivo re-rodava). `probe` só tinha a vista flat — não respondia "de
ONDE `mergeProps` é chamado".

**Objetivo**

1. **`probe` grafo** — `probe.tree()` / `callers(name)` / `edges()`: mantém a identidade
   do caller. Responde "4000× de `factoryDefaultsFor`, 700× de `mergeComputedProps`".
2. **Report compacto** — `phaseLine` (`(Σs 🐢N)`, `🐢` = segundos sempre), `compactFails`
   (vermelhos por inteiro + 5 hogs numa linha), `deltaTag` (só em hog que re-rodou). Um
   kind = MESMO render.
3. **`results.json`** — o histórico hierárquico por fase; o render lê SEMPRE daqui →
   quente == frio byte a byte. E o ÍNDICE: `utest 3.2` sem scan.
4. **Verbosidade derivada do escopo** — largo → v1; frente → v2 (re-executa, erro +
   endereço); arquivo → v3 (+ `log()`). `-v:N` explícito manda. `--force` largo proibido.

## Features que este sprint toca

- **5 profiling** — `probe.js` (a vista de grafo).
- **4 report** — `viewer.js` (+378 nos dois commits), `utest.js` (o render, a verbosidade).
- **2 cache** — `cache.js` `results` (`get`/`record`/`flush`/`fresh`/`list`).

## Criterio de pronto

- `probe.t.js` verde incluindo §grafo (aresta separa contexto, ciclo com ↻).
- `viewer.t.js` verde: `phaseLine`, `compactFails`, "o kind não muda o formato".
- `bun utest.js .` duas vezes → mesmo número.
- `utest cache` re-executa em v2; `utest .` -v:3 emite o aviso.

# REPORT

Sprint retroativo. Report compacto (phaseLine/compactFails/🐢=segundos), probe grafo (tree/callers/edges), results.json (índice + quente==frio), verbosidade derivada do escopo.

## O que aconteceu

- **`probe` grafo** (`e7f1b66`) — `probe.js` +78: `edges`/`callers`/`tree`, `callStack`
  para a aresta caller▸callee. `probe.t.js` +94 (§grafo). Denunciou o hog real de perf do
  soml: GOPD em `mergeProps`, 20% self-time.
- **Report compacto** (`9de0e22` + `40368b6`) — `viewer.js` +378: `phaseLine`,
  `compactFails`, `progressBar`, `deltaTag`, `phaseHogSecs`. `viewer.t.js` +305. `utest.js`
  +428: as três formas de render (tight / emoldurada / v3), a verbosidade derivada do
  escopo, o `narrowScope`.
- **`results.json`** (`b1586c7`→`40368b6`) — `cache.js` `results`: `get`/`record`/`flush`/
  `fresh`/`list`. O render passa a ler sempre daqui.
- **README +205 linhas** — a doc do formato do relatório e da regra do cache.

### Estado das frentes ao fim da janela (== hoje, antes do ZSS)

| frente | estado |
|---|---|
| 5 profiling | 🟡 (probe, 5.1) |
| 4 report | 🟡 (4.1-4.2) / 🟠 (4.3-4.5) |
| 2 cache | 🟡 (2.1-2.5) |

## Onde o PLAN errou

- **A parte melhor documentada do repo é o report.** O README tem ~200 linhas só sobre o
  formato (`🐢` = segundos, `Σ lastMs`, as três formas). Sprints 084c/084d do soml são a
  história do lado de lá.
- **Cobertura de `viewer.js` é parcial.** `viewer.t.js` mira `phaseLine`/`compactFails`/
  `deltaTag`/`failInfo` — o `view()` recursivo (v3), o `fullView` emoldurado e o
  `hogReport` standalone ficaram de fora. Feature 4.1 é 🟡 mas com essa ressalva.
- **A verbosidade-derivada-do-escopo (4.3) não tem `.t.js`.** É a lógica que mais confunde
  no uso (`utest . -v2` == `-v1`, de propósito), e nada a prende — só o aviso de stderr.
- **`utest.js` passou de ~600 para ~940 linhas em três janelas** (004+005+006). O arquivo
  central do repo é o menos coberto.
