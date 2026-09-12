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
- [utest] `ledger.t.js` e `state.t.js` falham (7 checks, 2 excecoes) — `ENOENT` em
  `.utest/ledger.dash` e `runId` vindo `object` em vez de `string`; anterior ao sprint 022,
  confirmado com `git stash` — [ISSUES/005](ISSUES/005-ledger-state-testes-vermelhos.md)

## DOING

_(vazio)_

## BLOCKED

_(vazio)_

## DONE

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
