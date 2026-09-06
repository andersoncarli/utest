---
sprint: 13
date: 2026-09-06
features: [8.1]
thread: null
---
# 013 — o ledger append-only encadeado sobre iodb

`ledger.js` — memória permanente do `utest` sobre o `iodb`: um log append-only,
criptograficamente encadeado, com `run:start`/`test:result`/`run:end`, verificável via
`verify()` e com degradação no-op quando `../iodb` não está presente.

## Objetivo

Dar ao `utest` uma segunda memória, além do cache por mtime (`.utest/results.json`,
frente 2): um registro imutável do que já aconteceu, ancorado no conteúdo exercitado
(`sha256` do file set) e encadeado criptograficamente via `../iodb`. `openLedger(root,
opts)` abre `IO(.utest/ledger, {reduce: append})`, expõe `start`/`test`/`event`/`end` +
`write` (para apêndice de plugin fora da rodada) e `verify()` (delega a `io.verify()`).
Integrado em `utest.js` em três pontos: abertura + `start()` no início da fase, `test()`
por resultado, `end()` no fechamento. Sem `../iodb`, ou com `enabled:false`, degrada para
um objeto no-op — o runner nunca fica refém do próprio log.

Homologação de concorrência feita a partir daqui (rodando N processos `bun` escrevendo
no mesmo `IO()`) expôs um bug real de corrupção sob escrita concorrente no `iodb`
(`saveIndex()` usando um `.tmp` não isolado por PID) — documentado e corrigido em
`~/iodb` (feature 1.2, `verify_confirmed: true`), fora do escopo desta feature.
