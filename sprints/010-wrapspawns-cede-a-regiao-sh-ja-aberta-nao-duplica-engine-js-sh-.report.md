---
sprint: 10
date: 2026-09-04
features: [5.5]
thread: null
---
# 010 — wrapSpawns cede a regiao sh: ja aberta (nao duplica engine.js#sh())

`wrapSpawns()` agora cede a uma região `sh:` já aberta em vez de duplicá-la — corrige o ruído que a instalação automática em `utest.js` (5.5) causava sobre a instrumentação própria de `engine.js#sh()` (5.3).

## Objetivo

Investigando um hog de wall-time em `sprint-cli` (`degraus.test.js`/`flows.test.js`, cada
teste dispara dezenas de `Bun.spawnSync` chamando `cmds/eval.js`/`cmds/sprint.js`),
descobri que `utest.js` nunca chamava `T.wrapSpawns()` no fluxo padrão — a árvore `--trace`
mostrava um bloco opaco `entry <arquivo>.test.js` sem decompor os subprocessos. Instalei
`T.wrapSpawns()` em `utest.js` (dentro do bloco `doTrace`) e confirmei que a árvore passou a
listar cada `sh:bun … eval.js …` individualmente — o hog real (boot de Bun repetido) ficou
visível.

Essa instalação global colidia com a feature 5.3: `engine.js#sh()` já embrulha seu próprio
`Bun.spawnSync` numa região `T.region('sh: ' + cmd…, runIt, { fragPrefix })`, e o
`fragPrefix` é o que permite ao trace enxertar o interior do subprocesso filho. Com
`wrapSpawns()` ativo sem guard, essa chamada interna batia no patch global e abria uma
segunda região `sh:` aninhada, sem `fragPrefix` — ruído, não corrupção de totais, mas
poluía a árvore exatamente no caso (`.eval.js` repetido) que motivou a mudança.

## O que mudou

- `trace.js` — `wrapSpawns()`: adicionado `insideShRegion()`, que olha o topo de
  `openStack` e cede (roda o spawn original sem abrir nova região) quando já há uma região
  `sh:` aberta. Comentário de cabeçalho da função atualizado explicando o porquê.
- `trace.t.js` — teste novo cobrindo o guard (região `sh:` externa não ganha uma `sh:`
  aninhada por dentro) e o comportamento anterior preservado (sem região aberta, uma
  `sh:<cmd>` é criada normalmente).

## Verificação

- `utest trace.t.js` — 35 checks verdes, incluindo o teste novo do guard.
- `sprint test` — suite inteira verde (📄9 🧪141 ✔359).
- `utest degraus.test.js --trace` (sprint-cli, sem `engine.js` no caminho) — árvore continua
  decompondo os `Bun.spawnSync` diretos do teste em `sh:bun … eval.js …`, sem regressão.
- Cenário com `engine.js#sh()` não re-testado ao vivo neste sprint (exigiria um `.eval.js`
  real rodando sob `--trace` fora do escopo desta investigação) — coberto pelo teste unitário
  do guard, que reproduz a mesma forma (`region('sh: …', …)` com spawn interno).
