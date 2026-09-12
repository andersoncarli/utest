# 020 — Plano: consumir-fswatch

Plano do sprint 020 (feature 8.3). A arvore do projeto passa a poder vir do baseline
persistente do sibling `iodb/fswatch`, com o `readdirSync` atual como fallback e baseline
de comparacao, atras da mesma interface.

## Objetivo

`scanner.js#walk()` levanta a arvore do zero a cada `scan()`, sem estado entre execucoes.
O `iodb/fswatch` mantem esse ultimo estado conhecido, com identidade por `(dev, ino)` sobre
o mesmo ledger iodb que `ledger.js` (8.1) e `state.js` (8.2) ja consomem — por isso a
feature saiu da frente 9 e virou 8.3.

O compartilhamento e do arquivo de baseline no root de cada projeto, lido por `utest` e por
`sprint-cli` quando rodam sobre o mesmo root. Historicos de run seguem separados.

## Passos

1. `fswatchSource.js` (novo) — import dinamico do sibling em `try/catch`, degradando para
   `null`; produz `{ tests, sources }`, a mesma forma que `walk()`.
2. `scanner.js` — `scan()` vira `async`, escolhe a fonte numa linha, e `sourceFiles` ganha
   `NON_TARGET_RE` (a absorcao da 4.7).
3. `utest.js` — um `await` no unico call site de producao.
4. `scanner.t.js` — o helper `run()` acompanha o `scan()` async.
5. `fswatchSource.t.js` (novo) — a prova de equivalencia entre os dois caminhos.

## Criterio de pronto

Os dois caminhos devolvem `testFiles`/`sourceFiles` identicos para a mesma arvore fixture;
a suite segue verde pelo fallback; apagar o baseline nao quebra nada.
