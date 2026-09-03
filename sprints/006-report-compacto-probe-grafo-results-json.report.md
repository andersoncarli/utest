---
sprint: 6
date: 2026-09-03
features: [5.1, 4.1, 4.2, 4.3, 2.4, 2.5]
---
# Sprint 006 — report

Sprint retroativo. Report compacto (phaseLine/compactFails/🐢=segundos), probe grafo (tree/callers/edges), results.json (índice + quente==frio), verbosidade derivada do escopo.

## O que entregou

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

## Visão crítica

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

## Estado das frentes ao fim da janela (== hoje, antes do ZSS)

| frente | estado |
|---|---|
| 5 profiling | 🟡 (probe, 5.1) |
| 4 report | 🟡 (4.1-4.2) / 🟠 (4.3-4.5) |
| 2 cache | 🟡 (2.1-2.5) |
