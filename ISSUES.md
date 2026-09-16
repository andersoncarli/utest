# ISSUES — kanban rapido de QA

<!-- system file -->

Registro quick-and-dirty de problemas a resolver depois — no proprio `utest` e nos sistemas
vizinhos (`iodb`/`fswatch`, `sprint`/sprint-cli). Uma linha por item. O detalhe forense,
quando existe, mora em [`ISSUES/`](ISSUES/).

Colunas: **TODO** (visto, nao comecado) · **DOING** (em conserto) · **BLOCKED** (esperando
decisao ou outra coisa) · **DONE** (resolvido — some daqui no proximo pente).

Formato de linha: `- [sistema] frase curta — <ponteiro opcional>`

---

## TODO

- [sprint-cli] **desbloqueada, prioritaria** — `utest` deveria ser a autoridade final do
  degrau no `sprint` (rebaixamento automatico por veredito). As duas pre-condicoes que
  bloqueavam isto ja fecharam (007 e 012, ver DONE); o que falta agora e so do lado do
  `sprint-cli`: decidir se/como consumir `--json` como fonte continua de degrau, em vez de
  `--sweep` manual ocasional —
  [ISSUES/013](ISSUES/013-utest-deveria-ser-a-autoridade-do-degrau-do-sprint.md)
- [sprint-cli] `021-*.report.md` sem frontmatter — o sprint fica invisivel ao vinculo
  feature↔sprint; o `close` deveria recusar sprint sem `features` —
  [ISSUES/009](ISSUES/009-report-021-sem-frontmatter.md)
- [utest] `HANDOFF.md` avulso na raiz (2026-04-24), sem sprint nem data no nome — mover
  para `handoffs/` conforme a convencao —
  [ISSUES/010](ISSUES/010-handoff-md-avulso-sem-dono.md)
- [utest] `requests()` e `open()` divergem em nos profundos da arvore de sprints — duas
  vias para o mesmo conteudo, uma delas errada —
  [ISSUES/011](ISSUES/011-arvore-requests-open-divergem.md)
- [utest] `.t.js` cru (sem `test()`, so `console.assert`/`console.log`) passa isolado mas
  reporta falso-vermelho dentro de `utest .` — o sub-ledger do arquivo so tem `passed`,
  o agregado da raiz marca `failed`; causa identificada (fix aplicado do lado do consumidor
  em `iodb`, causa raiz no utest ainda aberta) —
  [ISSUES/014](ISSUES/014-console-assert-cru-falso-vermelho-em-lote.md)

- [iodb] `flush()`/`close()` reescrevem a projecao inteira: com a escrita ja buferizada,
  `in()` x300 custa 4ms e `flush()`+`close()` custam 1150ms — o custo e O(store), nao
  O(dirty), e e o que ainda impede o `fswatch` de ser a fonte de arvore padrao de um runner
  — [ISSUES/002](ISSUES/002-iodb-flush-o-store.md)
- [fswatch] uma config POJO nao consegue nomear o dominio (`normalizeConfig` ignora o nome do
  cluster; tudo cai em `.fswatch/metadata`), entao o `.fswatch/PROJECT` que o contrato
  convenciona so sai de um arquivo YAML chamado `PROJECT.yaml`
- [fswatch] `import { Database } from 'bun:sqlite'` estatico no topo, no mesmo arquivo do
  `MetadataStore` — impede carregar o modulo fora do Bun com QUALQUER backend
- [fswatch] `private: true` sem campo `exports` — impede consumir como dependencia; hoje so
  por caminho relativo de sibling
- [fswatch] README documenta `watch({ baseline: false })` mas o codigo le `baselineFirst` — a
  opcao do README e silenciosamente ignorada
- [fswatch] `hash` e sempre `null` e `content_changed` nunca e emitido, ambos documentados
- [sprint] `sprint test`/`utest` deveriam ser intercambiaveis, nao dois verbos separados que
  o usuario precisa lembrar quando usar cada um. Achado no `iodb`: `sprint test <N.F>` roda
  os comandos de `verify_tests:` (hoje so `utest .`) e DERIVA o degrau 🟡 da feature —
  bookkeeping que o `utest` sozinho nao faz. Mas rodar `utest .` direto e mais rapido pra
  iterar e nao exige saber qual `N.F` esta em questao. Ideia a explorar: `utest --json` (ja
  existe) alimentar o `sprint` pra promover o degrau sem RE-rodar a suite via `sprint test`;
  ou `sprint test` virar um alias fino que so adiciona bookkeeping por cima de um `utest .`
  que acabou de rodar. Ganho de ergonomia, nao correcao de bug — mesmo item registrado em
  `~/sprint-cli/ISSUES.md`.
- [utest] `utest <N.F>` (ex.: `utest 5.3`) deveria resolver a feature pelo numero — ler o
  `verify_tests:` do frontmatter em `plans/**/<N.F>-*.md` (mesmo arquivo que o `sprint` ja
  le) e rodar so aquilo — em vez de cair no filtro posicional generico, que nao casa nada e
  a suite inteira roda ignorando o argumento (confirmado no `iodb`: `utest 5.3` == `utest .`
  em efeito, sem aviso de que "5.3" nao filtrou nada). Isso tornaria `N.F` um filtro NORMAL
  da CLI — natural pra quem ja usa `utest <path>` — e junto com o item anterior
  (`sprint test`/`utest` intercambiaveis) faria `utest 5.3` bastar sozinho, sem precisar do
  `sprint` no meio pra saber quais comandos rodar. Convencao a decidir: `N.F` (frontmatter)
  vs. caminho de arquivo — hoje ambos sao strings positionais indistinguiveis; talvez baste
  tentar resolver como feature primeiro, cair pro filtro de path se nao achar `N.F` valido.
  Vale tanto para `utest` (a CLI em si) quanto para o `sprint`, que e quem define o formato
  do frontmatter que a resolucao teria que ler — proposto originalmente pelo usuario do
  `iodb`.

## DOING

_(vazio)_

## BLOCKED

_(vazio)_

## DONE

- [utest] `check.test` (fallback global de `check()` sem bind, usado pelo shim `expect()`
  de `shims.js`) apontava para o `t` errado quando um `check`/exceção tardia (trabalho
  solto de `setTimeout`/promise não esperada, ou o `Promise.race` do timeout vencendo)
  disparava depois que `runTest` já tinha selado o nó e restaurado o global — a contagem
  de `checks` de um arquivo podia vazar para outro que rodasse "ao lado" na mesma
  invocação — **resolvido**: `check.test` só é restaurado ao valor salvo se
  ainda apontar para o `t` que está selando; senão zera, e um check tardio sem bind fica
  sem dono (comportamento já aceito por `leak.t.js`) em vez de contaminar o próximo global
  — `utest.js` (`runTest`) e `runner.js` (mesma regra) —
  [ISSUES/007](ISSUES/DONE/007-grand-failcount-cross-file.md). Mesma sessão achou uma segunda
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
  [ISSUES/012](ISSUES/DONE/012-watch-nao-pega-tudo-force-deveria-ser-desnecessario.md)
- [utest] `--trace` num arquivo que nenhuma fase do `TEST.yaml` inclui respondia "nenhum
  arquivo casou o escopo — nada a tracar" em vez de traçar o arquivo explícito —
  **resolvido**: quando `_isFile` e nenhuma fase casou até a última do loop,
  `runPhase` gera uma entry sintética pro arquivo mesmo assim (um alvo nomeado na linha de
  comando é instrução direta do usuário, a regra de fase é só para `utest .`) — `utest.js`
  (`runPhase`, loop de fases) — [ISSUES/006](ISSUES/DONE/006-trace-exige-fase-configurada.md)
- [utest] dois caminhos posicionais na CLI: `positional.find` promovia só o primeiro
  existente a target, e `positional.filter` descartava o resto por existir — o segundo
  caminho não rodava, não filtrava e não avisava; o relatório saía verde sobre metade do
  pedido. Um positional parecido com caminho mas inexistente também não avisava —
  **resolvido**: caminho(s) extra(s) viram filtro de nome sobre o
  `rawTarget`, com aviso; um filtro que parece caminho (`/` ou `.js`) mas não existe no
  disco também avisa — `utest.js` (parsing de positional) —
  [ISSUES/008](ISSUES/DONE/008-dois-caminhos-posicionais-segundo-ignorado.md)
- [utest] `ledger.t.js` e `state.t.js` falhavam (7 checks, 2 excecoes) — **resolvido**
  (sprint 021): o import pedia `../iodb/io-engine.js` e o modulo mora em
  `../iodb/src/io-engine.js`; o `catch` do degrade engolia o `ERR_MODULE_NOT_FOUND` em
  silencio. Caminho corrigido, degrade agora fala sob `UTEST_DEBUG`, e o falso-verde do
  `verify()` fechado com `length > 0` — suite verde, 630 checks —
  [ISSUES/005](ISSUES/DONE/005-ledger-state-testes-vermelhos.md)
- [fswatch] `reconcile()` gravava entry a entry com `flush` default `true`, flushando o store
  inteiro a cada arquivo — **resolvido** (`{ flush: false }` + um `store.flush()` no fim):
  300 arquivos de 4901ms para 241ms, 20x —
  [ISSUES/001](ISSUES/DONE/001-fswatch-reconcile-sem-buffer.md)
- [fswatch] `scan()` publico varria a arvore DUAS vezes (`scanner.scan()` e depois
  `snapshot()`) — **resolvido**: com `describe()` preenchendo `path`, o mapa que o Scanner ja
  devolve E o baseline, e a segunda travessia sumiu —
  [ISSUES/003](ISSUES/DONE/003-fswatch-scan-varre-duas-vezes.md)
- [fswatch] entries do `Scanner` batch nao tinham `path`, contra o contrato — **resolvido**:
  `describe()` passa a poe-lo (absoluto), entao TODO produtor o carrega e o idiom publicado
  no doc volta a funcionar — [ISSUES/004](ISSUES/DONE/004-fswatch-path-ausente.md)

Efeito combinado, medido (na epoca destas tres): indexar 400 arquivos caiu de ~6500ms para
**814ms**; no repo do `utest`, o `scan()` via fswatch caiu de ~13.5s para **1.5s** com
baseline quente (e agora o quente e mais barato que o frio, como deveria). A suite do
`iodb` caiu de 50s para 27s e seguia verde nos 2703 checks; a do `utest` seguia nos mesmos
7 vermelhos pre-existentes daquele momento — ja resolvidos por 005/006/007/008/012 acima.
