# DONE — arquivo do `ISSUES.md`

Itens resolvidos, movidos para ca no proximo "pente" depois de fechados (ver
`ISSUES.md` para as colunas TODO/DOING/BLOCKED, que ficam la). Mais recente primeiro.

---

- [utest] `.t.js` cru (sem `test()`, so `console.assert`/`console.log`) passava isolado mas
  reportava falso-vermelho dentro de `utest .` — **resolvido** (sprint 026):
  causa raiz era `src/cache.js` tratando `!result.checks` (zero checks) como sinonimo de
  falha em duas gravacoes (`write`, linha ~560, e o record de `results.json`, linha
  ~587) — um arquivo cru sem `check()` tem `checks:0` legitimamente quando passa, e
  isso e diferente de `result.failed`, que ja e o veredito correto
  (`suite.state !== 'passed'`, vindo de `utest.js`). O sub-ledger local sempre usou
  `suite.state` direto e por isso nunca teve o bug; era so o cache/`results.json`
  (fonte que `utest .` agregado le) que divergia. Fix: as duas condicoes passaram a
  usar so `result.failed`/`result.exception`, sem `!result.checks`. Confirmado com
  fixture de 2 arquivos (regra dos 3): isolado `✔1`, agregado `✔2`, `results.json`
  gravando `"checks":0,"state":"passed"` corretamente —
  [ISSUES/014](014-console-assert-cru-falso-vermelho-em-lote.md).
  Sintoma 2 do mesmo achado (colisao `typed.t.js`/`typedtree.t.js` quando passados
  juntos) e um bug DIFERENTE, nao tocado aqui — `utest.js:307` so promove o primeiro
  path existente a `rawTarget`, o segundo vira filtro de nome em vez de rodar junto;
  comportamento deliberado de ISSUES/008, mas que aqui descarta o segundo arquivo
  real. Registrado a parte se for reabrir.
- [utest] `HANDOFF.md` avulso na raiz (2026-04-24), sem sprint nem data no nome —
  **resolvido**: ja foi movido para `handoffs/260424.md` (commit `4ab3484`,
  "minor reorg docs") — item estava desatualizado, nao havia mais `HANDOFF.md` na raiz —
  [ISSUES/010](010-handoff-md-avulso-sem-dono.md)
- [utest] `check.test` (fallback global de `check()` sem bind, usado pelo shim `expect()`
  de `src/shims.js`) apontava para o `t` errado quando um `check`/exceção tardia (trabalho
  solto de `setTimeout`/promise não esperada, ou o `Promise.race` do timeout vencendo)
  disparava depois que `runTest` já tinha selado o nó e restaurado o global — a contagem
  de `checks` de um arquivo podia vazar para outro que rodasse "ao lado" na mesma
  invocação — **resolvido**: `check.test` só é restaurado ao valor salvo se
  ainda apontar para o `t` que está selando; senão zera, e um check tardio sem bind fica
  sem dono (comportamento já aceito por `src/leak.t.js`) em vez de contaminar o próximo global
  — `utest.js` (`runTest`) e `src/runner.js` (mesma regra) —
  [ISSUES/007](007-grand-failcount-cross-file.md). Mesma sessão achou uma segunda
  fresta da mesma família: o `state` de uma linha do `--json` era um snapshot gravado uma
  vez logo após o loop de `runTest` do arquivo, e não se atualizava se um straggler reabrisse
  o veredito de um filho depois — `state:"passed"` podia sair ao lado de `failCount:1` no
  mesmo objeto. Corrigido junto: `state` de entry não-cacheada é recomputado via `summary(t)`
  na hora de serializar `--json`, igual o `failCount` já fazia.
- [utest] `-w` podia mostrar um resultado misturado com o da rodada anterior: `rerun()`
  matava (`child.kill()`) o processo filho antigo e disparava o novo `Bun.spawn` no MESMO
  `stdout: 'inherit'` sem esperar o antigo terminar de fato — as duas saídas podiam
  intercalar. `--force` continuava sendo hábito defensivo porque o cache se autodesconfia e
  re-roda (comportamento correto, só verboso) — **resolvido**: `rerun` agora
  aguarda `child.exited` antes do próximo `spawn`, com trava (`rerunning`) contra dois
  reruns sobrepostos — `utest.js` (bloco `--watch`) —
  [ISSUES/012](012-watch-nao-pega-tudo-force-deveria-ser-desnecessario.md)
- [utest] `--trace` num arquivo que nenhuma fase do `TEST.yaml` inclui respondia "nenhum
  arquivo casou o escopo — nada a tracar" em vez de traçar o arquivo explícito —
  **resolvido**: quando `_isFile` e nenhuma fase casou até a última do loop,
  `runPhase` gera uma entry sintética pro arquivo mesmo assim (um alvo nomeado na linha de
  comando é instrução direta do usuário, a regra de fase é só para `utest .`) — `utest.js`
  (`runPhase`, loop de fases) — [ISSUES/006](006-trace-exige-fase-configurada.md)
- [utest] dois caminhos posicionais na CLI: `positional.find` promovia só o primeiro
  existente a target, e `positional.filter` descartava o resto por existir — o segundo
  caminho não rodava, não filtrava e não avisava; o relatório saía verde sobre metade do
  pedido. Um positional parecido com caminho mas inexistente também não avisava —
  **resolvido**: caminho(s) extra(s) viram filtro de nome sobre o
  `rawTarget`, com aviso; um filtro que parece caminho (`/` ou `.js`) mas não existe no
  disco também avisa — `utest.js` (parsing de positional) —
  [ISSUES/008](008-dois-caminhos-posicionais-segundo-ignorado.md)
- [utest] `src/ledger.t.js` e `src/state.t.js` falhavam (7 checks, 2 excecoes) — **resolvido**
  (sprint 021): o import pedia `../iodb/io-engine.js` e o modulo mora em
  `../iodb/src/io-engine.js`; o `catch` do degrade engolia o `ERR_MODULE_NOT_FOUND` em
  silencio. Caminho corrigido, degrade agora fala sob `UTEST_DEBUG`, e o falso-verde do
  `verify()` fechado com `length > 0` — suite verde, 630 checks —
  [ISSUES/005](005-ledger-state-testes-vermelhos.md)
- [fswatch] `reconcile()` gravava entry a entry com `flush` default `true`, flushando o store
  inteiro a cada arquivo — **resolvido** (`{ flush: false }` + um `store.flush()` no fim):
  300 arquivos de 4901ms para 241ms, 20x —
  [ISSUES/001](001-fswatch-reconcile-sem-buffer.md)
- [fswatch] `scan()` publico varria a arvore DUAS vezes (`scanner.scan()` e depois
  `snapshot()`) — **resolvido**: com `describe()` preenchendo `path`, o mapa que o Scanner ja
  devolve E o baseline, e a segunda travessia sumiu —
  [ISSUES/003](003-fswatch-scan-varre-duas-vezes.md)
- [fswatch] entries do `Scanner` batch nao tinham `path`, contra o contrato — **resolvido**:
  `describe()` passa a poe-lo (absoluto), entao TODO produtor o carrega e o idiom publicado
  no doc volta a funcionar — [ISSUES/004](004-fswatch-path-ausente.md)

Efeito combinado, medido (na epoca destas tres): indexar 400 arquivos caiu de ~6500ms para
**814ms**; no repo do `utest`, o `scan()` via fswatch caiu de ~13.5s para **1.5s** com
baseline quente (e agora o quente e mais barato que o frio, como deveria). A suite do
`iodb` caiu de 50s para 27s e seguia verde nos 2703 checks; a do `utest` seguia nos mesmos
7 vermelhos pre-existentes daquele momento — ja resolvidos por 005/006/007/008/012 acima.
