# Sprint 006 — report compacto, probe-grafo, results.json

> Sprint retroativo, reconstruído em 2026-09-03.

## Janela

`e7f1b66` … `40368b6` (2026-09-02 … 2026-09-03). 3 commits.

## Context

O relatório antigo (`═══`, `checkView` por check, `received: false`/`expected: true`) dava
~240 linhas com 45 vermelhos. Cache quente e frio divergiam (o `(Nms)` dos vermelhos só
aparecia quando o arquivo re-rodava). `probe` só tinha a vista flat — não respondia "de
ONDE `mergeProps` é chamado".

## Objetivo

1. **`probe` grafo** — `probe.tree()` / `callers(name)` / `edges()`: mantém a identidade
   do caller. Responde "4000× de `factoryDefaultsFor`, 700× de `mergeComputedProps`".
2. **Report compacto** — `phaseLine` (`(Σs 🐢N)`, `🐢` = segundos sempre), `compactFails`
   (vermelhos por inteiro + 5 hogs numa linha), `deltaTag` (só em hog que re-rodou). Um
   kind = MESMO render.
3. **`results.json`** — o histórico hierárquico por fase; o render lê SEMPRE daqui →
   quente == frio byte a byte. E o ÍNDICE: `utest 3.2` sem scan.
4. **Verbosidade derivada do escopo** — largo → v1; frente → v2 (re-executa, erro +
   endereço); arquivo → v3 (+ `log()`). `-v:N` explícito manda. `--force` largo proibido.

## Frentes tocadas

- **5 profiling** — `probe.js` (a vista de grafo).
- **4 report** — `viewer.js` (+378 nos dois commits), `utest.js` (o render, a verbosidade).
- **2 cache** — `cache.js` `results` (`get`/`record`/`flush`/`fresh`/`list`).

## Requisitos verificáveis

- `probe.t.js` verde incluindo §grafo (aresta separa contexto, ciclo com ↻).
- `viewer.t.js` verde: `phaseLine`, `compactFails`, "o kind não muda o formato".
- `bun utest.js .` duas vezes → mesmo número.
- `utest cache` re-executa em v2; `utest .` -v:3 emite o aviso.
