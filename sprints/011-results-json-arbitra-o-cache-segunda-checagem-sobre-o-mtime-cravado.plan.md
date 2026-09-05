# 011 — Plano: results.json arbitra o cache — segunda checagem sobre o mtime cravado

## Contexto

Investigando "o cache não funciona em ~/soml e ~/sprint-cli" (pedido do usuário), medi
diretamente com um probe (`TestCache`/`scan()`) e confirmei que a regra de mtime cravado
**está funcionando** (73/78 hits no sprint-cli) — o sintoma real era outra coisa: duas
features vermelhas (`40.110`, `40.30`, no projeto sprint-cli) com passos `real`/`linear`
(não elegíveis a `cacheFailure` por design) custando 22s+34s a cada rodada, sempre,
porque falha comum nunca cacheia. Isso já está documentado como feature aberta no
próprio sprint-cli (40.110) e fica fora deste sprint.

No caminho, porém, apareceu um caso real de fragilidade: um par teste/alvo no
sprint-cli tinha o mtime do alvo (`.md`) e do teste (`.eval.js`) em **segundos
diferentes** sem edição aparente — o protocolo de "segundo cravado" (`cache.js`) exige
que os dois compartilhem o mesmo segundo truncado, e qualquer dessincronia (do
filesystem, de uma race na escrita, de uma cópia/checkout) já invalida o par
silenciosamente, sem deixar rastro do motivo.

O `results.json` (`<raiz>/.utest/results.json`) já grava, por arquivo/fase, os mesmos
dois dados que o mtime cravado usa (`mtime`, `depsNewest`) — mas hoje isso é só
diagnóstico de "2º nível" (`results.fresh()`, chamado em `utest.js:495-497`, só loga
divergência em `-v:2`, nunca corrige). Decisão do usuário: **não remover o mecanismo de
mtime** (rápido, não depende de um JSON íntegro, sua regra "não tem furo" continua
valendo na maioria dos casos) — em vez disso, promover `results.json` de diagnóstico
passivo para **árbitro ativo**. Os dois mecanismos continuam calculando o veredito de
fresh/stale como hoje; quando divergem, `results.json` vence (decisão explícita do
usuário, ver pergunta respondida na sessão: "results.json manda").

## O que muda, e o que não muda

**Não muda:** `readPaired`/`writePaired`, `readSelf`/`writeSelf`/`selfFile`,
`deps`/`newestDep`/`depsFresh`, `bust()`, `CHECKS_MAX`/`FAILED_MARK`, a assinatura
pública de `cache.read`/`cache.write` (extensão via `opts`, não quebra), e
`results.record`/`get`/`list`/`flush` na forma.

**Muda:** `results.fresh(phase, p, extraDeps)` passa a ser consultada **dentro** de
`cache.read` (tanto `readPaired` quanto `readSelf`) antes de confirmar um HIT: se o
mtime cravado diz HIT mas `results.fresh` diz `false` (ou o record não existe), o
veredito final é MISS. O caminho inverso (mtime cravado já diz MISS) continua
definitivo, sem consultar `results.json`. A mensagem de diagnóstico hoje em
`utest.js:495-497` muda de "aviso passivo" para "explica a decisão real" (só em `-v:2`).

## Passos

1. **`cache.js`** — em `readPaired` e `readSelf`, antes do `return` de sucesso,
   adicionar checagem: se `phase` foi passado em `opts` e `!results.fresh(phase,
   testPath, extraDeps)`, retornar `null` (MISS) mesmo que o mtime cravado dissesse
   HIT. `cache.read`/`cache.write` ganham `phase` como campo extra dentro do objeto de
   opções já existente (`{ extraDeps, phase }`) — sem `phase`, arbitragem é pulada
   (compat total com qualquer chamador que não a informe).
2. **`scanner.js:131`** — `cache.read(path, target)` vira `cache.read(path, target,
   { phase })` (`phase` já está no escopo de `scan()`).
3. **`utest.js`** — dois pontos de leitura (linha ~403 e ~419) passam a incluir `phase`
   no objeto de opções. `cache.write` (linha ~645) não muda — a arbitragem só afeta
   leitura.
4. **`utest.js:495-497`** — remover o bloco antigo de "cache diz HIT mas histórico está
   stale" (não faz mais sentido: se chegou a HIT em `entry.cache`, os dois mecanismos já
   concordaram por construção). Substituir por diagnóstico dentro de `cache.js`: quando
   a arbitragem descarta um HIT do mtime por divergência do `results.json`, e
   `globalThis.utestVerbosity >= 2`, logar o motivo real da re-execução.
5. **`cache.t.js`** — adicionar 6 casos novos (não remove nenhum existente):
   - mtime diz HIT, sem record em `results.json` para o path/phase → MISS.
   - mtime diz HIT, record existe mas `mtime` diverge do atual → MISS (replica o bug
     real do sprint-cli).
   - mtime diz HIT, record existe mas `depsNewest` mais antigo que uma dep atual → MISS
     (mesmo cenário do bug histórico do comment-block, `scl/theme-params.js`).
   - mtime diz HIT, `results.json` concorda (mtime e depsNewest batem) → HIT (caminho
     feliz, não pode regredir).
   - mtime diz MISS (arquivo editado) → MISS independente do `results.json` (caminho
     inverso não é arbitrado).
   - chamada sem `phase` → arbitragem pulada, comportamento idêntico ao atual (compat).
6. **Comment-block do topo de `cache.js`** — acrescentar parágrafo explicando a dupla
   checagem (a prosa existente sobre "os dois detalhes que fazem a regra fechar"
   continua válida).

## Verificação

- `verify_tests`: `bun utest/utest.js cache.t.js` isolado até verde.
- `bun utest/utest.js .` (suíte completa do projeto) duas vezes seguidas — segunda
  rodada deve continuar tão rápida quanto hoje (arbitragem é leitura de objeto já em
  memória, sem overhead perceptível).
- `verify_manual`: simular um par com mtimes dessincronizados por 1s mas `results.json`
  consistente, e o inverso (mtimes batendo mas `results.json` desatualizado) —
  confirmar que a arbitragem força re-execução nos dois casos.

## Critério de pronto

- Nenhum teste existente de `cache.t.js` regride.
- Os 6 casos novos passam.
- `bun utest/utest.js .` neste projeto continua com output idêntico quente/frio
  (garantia já confirmada pela feature 2.5).
- O caso do sprint-cli (par com segundos dessincronizados) força re-execução em vez de
  servir um HIT stale.
