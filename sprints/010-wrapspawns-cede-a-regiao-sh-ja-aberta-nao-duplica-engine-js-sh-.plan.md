# 010 — Plano: wrapSpawns cede a regiao sh: ja aberta (nao duplica engine.js#sh())

Plano do sprint 010 (feature 5.5).

## Objetivo

Investigando um hog em `sprint-cli` (`degraus.test.js`/`flows.test.js`, cada teste dispara
dezenas de `Bun.spawnSync` chamando `cmds/eval.js`/`cmds/sprint.js`), descobri que
`utest.js` nunca chamava `T.wrapSpawns()` (trace.js) no fluxo padrão — a árvore `--trace`
mostrava um bloco opaco `entry <arquivo>.test.js` sem decompor os subprocessos. Instalei
`T.wrapSpawns()` logo após `T.mark('boot')`, dentro do bloco `if (doTrace && !hogs &&
!asJson)` (utest.js:333-338), e confirmei que a árvore passou a listar cada `sh:bun … eval.js
…` individualmente — o hog real (boot de Bun repetido) ficou visível.

Só que essa instalação global colide com a feature 5.3: `soml/apps/eval/engine.js#sh()` já
embrulha seu próprio `Bun.spawnSync` numa região `T.region('sh: ' + cmd…, runIt, {
fragPrefix })`, onde `fragPrefix` é o que permite ao trace enxertar o interior do subprocesso
filho (`graftFragments`, o mecanismo da 5.3). Com `wrapSpawns()` ativo, a chamada
`Bun.spawnSync(spawnOpts)` dentro do `runIt` de `engine.js` bate no patch global e abre uma
SEGUNDA região `sh:` aninhada — sem `fragPrefix`, poluindo a árvore com ruído (não corrompe
totais; o self-time ainda fecha) exatamente no caso — `.eval.js` chamado repetidamente — que
motivou a mudança.

Este sprint corrige: `wrapSpawns()` deve ceder quando já está dentro de uma região `sh:`
aberta, em vez de duplicá-la. Sem tocar em `engine.js` (vendored/externo a projetos
consumidores como `sprint-cli/node_modules/soml/...`) — o guard vive só em `trace.js`.

## Passos

1. **`trace.js`** — `wrapSpawns()` (linhas 79-95): adicionar `insideShRegion()`, que olha o
   topo de `openStack` (já módulo-local a `trace.js`) e retorna true se o nome da região mais
   recente começa com `'sh:'`. `Bun.spawnSync`/`Bun.spawn` passam a rodar o original SEM abrir
   nova região quando `insideShRegion()` é true — deixando a instrumentação externa (com
   `fragPrefix`, se houver) ser a única fonte para aquela chamada.

2. **`trace.t.js`** — teste novo ao lado do existente "wrapSpawns() rotula pelo cmd e
   restaura" (~linha 46-55): abrir uma região `sh: outer` via `region()`, instalar
   `wrapSpawns()`, chamar `Bun.spawnSync` dentro dela — a árvore/`nodes()` resultante deve
   mostrar SÓ a região externa, nenhuma `sh:` aninhada. Cobrir também o caso sem região aberta
   (comportamento anterior preservado: uma região `sh:<cmd>` é criada normalmente).

3. **`trace.js`** — comentário de cabeçalho (linhas 1-20, já explica o modelo): acrescentar
   uma frase curta notando que `wrapSpawns()` cede a uma região `sh:` externa já aberta para
   não duplicar `engine.js#sh()` (5.3). Sem novo arquivo de doc.

## Verificação

- `bun test trace.t.js` — verde, incluindo o teste novo do guard.
- Reproduzir o caso que expôs o bug: dentro do sprint-cli, rodar `utest <arquivo-que-chama-
  eval.js-via-engine> --trace` e confirmar UMA região `sh:` por subprocesso (com o fragmento
  do filho enxertado), não duas aninhadas.
- Repetir `utest degraus.test.js --trace` (sprint-cli) — o caso original, sem `engine.js` no
  caminho — e confirmar que a árvore continua decompondo os `Bun.spawnSync` diretos do teste
  em `sh:bun … eval.js …`, como já validado antes desta correção.

## Critério de pronto

`sprint test` verde (inclui `trace.t.js`), os dois cenários de verificação acima confirmados
manualmente, `sprint eval 5.5` step-by-step com humano.
