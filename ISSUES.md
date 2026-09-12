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
- [utest] `--trace` num arquivo que nenhuma fase do `TEST.yaml` inclui responde
  "nenhum arquivo casou o escopo — nada a tracar" e sai: um `.eval.js` (ou qualquer `.js`)
  so e tracavel se houver uma fase que case o padrao. O `--trace` deveria aceitar QUALQUER
  arquivo `.js` apontado explicitamente, sem depender de config — o gate hoje e o escopo
  (`narrowScope || _isFile`, utest.js:354), mas o arquivo cai antes, na selecao de entries
  — [ISSUES/006](ISSUES/006-trace-exige-fase-configurada.md)
- [utest] agregado global `grand` (exit code) conta `failed`/`exception` vazados entre
  arquivos concorrentes — `page-cursor.t.js` + `tabular-table.t.js` juntos derrubam o exit
  code mesmo com todo `state` `passed`; migrado de `iodb` —
  [ISSUES/007](ISSUES/007-grand-failcount-cross-file.md)
- [utest] dois caminhos posicionais na CLI: `positional.find` promove so o primeiro
  existente a target, e `positional.filter` descarta o resto por existir — o segundo
  caminho nao roda, nao filtra e nao avisa; o relatorio sai verde sobre metade do pedido.
  Migrado de `iodb` — [ISSUES/008](ISSUES/008-dois-caminhos-posicionais-segundo-ignorado.md)
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

- [utest] `ledger.t.js` e `state.t.js` falhavam (7 checks, 2 excecoes) — **resolvido**
  (sprint 021): o import pedia `../iodb/io-engine.js` e o modulo mora em
  `../iodb/src/io-engine.js`; o `catch` do degrade engolia o `ERR_MODULE_NOT_FOUND` em
  silencio. Caminho corrigido, degrade agora fala sob `UTEST_DEBUG`, e o falso-verde do
  `verify()` fechado com `length > 0` — suite verde, 630 checks —
  [ISSUES/005](ISSUES/005-ledger-state-testes-vermelhos.md)
- [fswatch] `reconcile()` gravava entry a entry com `flush` default `true`, flushando o store
  inteiro a cada arquivo — **resolvido** (`{ flush: false }` + um `store.flush()` no fim):
  300 arquivos de 4901ms para 241ms, 20x —
  [ISSUES/001](ISSUES/001-fswatch-reconcile-sem-buffer.md)
- [fswatch] `scan()` publico varria a arvore DUAS vezes (`scanner.scan()` e depois
  `snapshot()`) — **resolvido**: com `describe()` preenchendo `path`, o mapa que o Scanner ja
  devolve E o baseline, e a segunda travessia sumiu —
  [ISSUES/003](ISSUES/003-fswatch-scan-varre-duas-vezes.md)
- [fswatch] entries do `Scanner` batch nao tinham `path`, contra o contrato — **resolvido**:
  `describe()` passa a poe-lo (absoluto), entao TODO produtor o carrega e o idiom publicado
  no doc volta a funcionar — [ISSUES/004](ISSUES/004-fswatch-path-ausente.md)

Efeito combinado, medido: indexar 400 arquivos caiu de ~6500ms para **814ms**; no repo do
`utest`, o `scan()` via fswatch caiu de ~13.5s para **1.5s** com baseline quente (e agora o
quente e mais barato que o frio, como deveria). A suite do `iodb` caiu de 50s para 27s e
segue verde nos 2703 checks; a do `utest` segue nos mesmos 7 vermelhos pre-existentes.
