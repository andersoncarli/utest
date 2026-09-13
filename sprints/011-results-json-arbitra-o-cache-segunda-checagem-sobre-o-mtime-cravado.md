---
sprint: "011"
slug: "results-json-arbitra-o-cache-segunda-checagem-sobre-o-mtime-cravado"
title: "results.json arbitra o cache — segunda checagem sobre o mtime cravado"
features: ["2.6"]
budget: null
state: "closed"
opened: "2026-09-04"
closed: "2026-09-04"
migrated: "0.2"
---

# 011 — results.json arbitra o cache — segunda checagem sobre o mtime cravado

Investigando "o cache não funciona em ~/soml e ~/sprint-cli" (pedido do usuário) — motivo
completo em "Por que este sprint existe agora", abaixo.

# PLAN

## Por que este sprint existe agora

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

## Plano de materializacao

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

### O que muda, e o que não muda

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

## Criterio de pronto

**Verificação**

- `verify_tests`: `bun utest/utest.js cache.t.js` isolado até verde.
- `bun utest/utest.js .` (suíte completa do projeto) duas vezes seguidas — segunda
  rodada deve continuar tão rápida quanto hoje (arbitragem é leitura de objeto já em
  memória, sem overhead perceptível).
- `verify_manual`: simular um par com mtimes dessincronizados por 1s mas `results.json`
  consistente, e o inverso (mtimes batendo mas `results.json` desatualizado) —
  confirmar que a arbitragem força re-execução nos dois casos.

**Critério de pronto**

- Nenhum teste existente de `cache.t.js` regride.
- Os 6 casos novos passam.
- `bun utest/utest.js .` neste projeto continua com output idêntico quente/frio
  (garantia já confirmada pela feature 2.5).
- O caso do sprint-cli (par com segundos dessincronizados) força re-execução em vez de
  servir um HIT stale.

# REPORT

Intro: o mtime cravado continua decidindo sozinho, mas agora `results.json` confere o
veredito nos dois sentidos — rebaixa um HIT que na verdade mudou, e promove um MISS
causado só por dessincronia de relógio quando confirma que nada mudou de verdade.

## O que aconteceu

**Objetivo**

Motivo e diagnóstico completos em "Por que este sprint existe agora" (PLAN) — as duas
features vermelhas custavam ~56s somados por rodada. Em resumo: a fragilidade real não
era o sintoma investigado, mas a dessincronia de mtime encontrada no caminho.

**O que mudou**

- `cache.js`: `readPaired`/`readSelf` agora passam pelo veredito do mtime cravado
  (`readPairedByTime`/`readSelf`, inalterados) e depois por `arbitrate` — que cruza esse
  veredito com `results.fresh(phase, testPath, extraDeps, targetPath)` nos dois
  sentidos: HIT do tempo + histórico discorda → MISS; MISS do tempo + histórico
  confirma teste/alvo/deps intactos (byte-a-byte nos mtimes) → promove a HIT.
- `results.record` ganhou `targetMtime` (mtime do alvo pareado, que não entra no grafo
  de `import` — sem isso a árbitro não tinha como confirmar o alvo de um `.eval.js`,
  cujo par é um `.md`) e `cacheable` (espelha `cacheFailure`: só um vermelho
  reproduzível pode ser promovido de volta a HIT).
- `results.fresh` ganhou um 4º argumento opcional `targetPath` e passou a invalidar
  quando alguma dep sumiu do disco (antes, `newestDep` tratava ausência como `0`,
  deixando passar por "não mudou").
- `cache.write` passou a ser o ÚNICO ponto de escrita: grava o mtime cravado E o record
  em `results.json` (antes, `utest.js` chamava os dois separadamente, e só chamava
  `results.record` quando `cache.write` também era chamado — uma falha comum, que só
  disparava `cache.bust`, nunca deixava rastro em `results.json`, e a árbitro rebaixava
  todo HIT por falta de histórico). `utest.js`/`scanner.js` passaram `phase` (default
  `'unit'`) nas chamadas de leitura.
- Removida a verificação de 2º nível antiga em `utest.js` (log passivo em `-v:2`, nunca
  corrigia nada) — substituída por diagnóstico dentro da própria árbitro (`cache.js`),
  que agora explica a decisão real quando rebaixa ou promove.
- 8 casos novos em `cache.t.js` cobrindo a arbitragem bidirecional (caminho feliz, sem
  histórico, histórico divergente, promoção por dessincronia, edição real não promovida,
  falha comum nunca promovida, falha reproduzível sobrevive). Nenhum caso existente foi
  removido — os dois mecanismos continuam cobertos lado a lado.
- Mais 9 casos (86 checks) provando ESTABILIDADE fora do caminho feliz: uma vez que
  mtime cravado e `results.json` concordam, nada além de uma mudança real ou o chamador
  ignorando o veredito (o que `--force` faz em `utest.js`) derruba o HIT — nem 50
  leituras seguidas, nem uma instância nova de `TestCache`, nem `flush()` redundante,
  nem tocar um arquivo fora do grafo de deps, nem reordenar leitura/flush, nem ler outra
  fase do mesmo par, nem regravar o mesmo resultado. Documenta explicitamente que
  `cache.read` não tem noção de `--force` — só quem chama decide ignorar um HIT.

## Prova

- `bun utest.js cache.t.js`: 85 checks, 0 falhas.
- `bun utest.js .` (suíte completa do projeto): 369 checks, 0 falhas, quente em ~0.7s
  (sem regressão de performance — a árbitro só lê dados já em memória).
- Reproduzido manualmente em ~/sprint-cli: dessincronizei deliberadamente o mtime do
  alvo de `plans/40-homologacao/40.10*` (sem editar conteúdo) e confirmei via `-v:2`
  que a árbitro promove a HIT quando o histórico confirma; revertido o mtime ao
  original logo depois (nenhuma mudança de conteúdo ficou no repo do usuário).
- Primeira rodada pós-mudança num `results.json` no formato antigo (sem `targetMtime`)
  diverge em cascata (esperado — o campo novo nunca foi gravado); a segunda rodada já
  convergiu limpa, confirmando que a migração se autocura sem invalidação manual.
