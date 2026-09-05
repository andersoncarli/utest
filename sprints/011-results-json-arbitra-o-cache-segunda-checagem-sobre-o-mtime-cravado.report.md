---
sprint: 11
date: 2026-09-04
features: [2.6]
thread: null
---
# 011 — results.json arbitra o cache — segunda checagem sobre o mtime cravado

Intro: o mtime cravado continua decidindo sozinho, mas agora `results.json` confere o
veredito nos dois sentidos — rebaixa um HIT que na verdade mudou, e promove um MISS
causado só por dessincronia de relógio quando confirma que nada mudou de verdade.

## Objetivo

Investigando por que o cache "parecia" não funcionar em ~/soml e ~/sprint-cli, a causa
raiz do sintoma reportado (loading em teste supostamente cacheado) era outra: duas
features do sprint-cli (`40.110`, `40.30`) rodam passos `real`/`linear` vermelhos que
nunca cacheiam por design (só sandbox puro é elegível a `cacheFailure`), custando ~56s
somados a cada rodada — já rastreado como feature aberta no próprio sprint-cli (40.110).

No caminho, apareceu um caso real de fragilidade: um par teste/alvo no sprint-cli tinha
o mtime do alvo (`.md`) e do teste (`.eval.js`) em segundos diferentes sem edição
aparente — o protocolo de "segundo cravado" não tem como distinguir essa dessincronia
de uma edição de verdade.

## O que mudou

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

## Verificação

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
