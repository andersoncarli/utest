---
sprint: 24
date: 2026-09-16
features: [7.2]
thread: null
---
# 024 — fechar 006, 007, 008, 012 — vazamento cross-arquivo e CLI posicional/trace

Fechou 4 issues do `utest` (006, 007, 008, 012) atrás de duas causas raiz: o global
`check.test` vazando entre execuções, e o `--watch` trocando de processo filho sem esperar
o antigo terminar.

## Objetivo

Resolver o TODO do `utest` em `ISSUES.md`: 006 (`--trace` recusa arquivo fora de fase),
007 (contagem de checks vazando entre arquivos concorrentes), 008 (segundo caminho
posicional descartado em silêncio), 012 (watch/cache mostrando resultado desencontrado).
013 fica registrada como dependente — não fecha por código, só quando 007+012 fecharem
(fecharam).

## O que mudou

- **007** — `check.test` (fallback global usado pelo shim `expect()` de `shims.js`) só é
  restaurado ao valor salvo em `runTest`/`finally` se ainda apontar para o `t` que está
  selando; um straggler tardio (setTimeout, promise solta, ou o `Promise.race` do timeout
  vencendo) que dispare depois encontra `null` em vez do `check.test` de outro arquivo.
  Aplicado em `utest.js` (o `runTest` real, usado pela CLI) e `runner.js` (a variante de
  biblioteca). `leak.t.js` já documentava a mecânica; segue verde.
- **012** — `rerun()` do modo `--watch` agora aguarda `child.exited` depois do `kill()`
  antes de disparar o próximo `Bun.spawn`, com uma trava (`rerunning`) contra dois reruns
  sobrepostos quando um arquivo muda no meio da espera. Testado manualmente: edição durante
  o watch gera relatório limpo, sem saída intercalada entre processo velho/novo.
- **006** — `runPhase` recebe `forceFileEntry`: quando um arquivo apontado explicitamente
  (`_isFile`) não casa nenhuma fase declarada em `TEST.yaml`, a ÚLTIMA fase do loop cria
  uma entry sintética pra ele mesmo assim. Verificado com um `TEST.yaml` de teste
  (`unit: **/*.t.js`) apontando `--trace` para um `.eval.js` fora do include — traçou.
- **008** — o segundo (e demais) caminho(s) existente(s) na linha de comando não somem
  mais: viram filtro de nome sobre o `rawTarget`, com aviso no stderr. Um filtro que
  parece caminho (`/` ou termina em `.js`) mas não existe no disco também avisa, em vez de
  produzir um filtro mudo.
- **`--json` `state` obsoleto (achado escrevendo o eval de 7.2, mesma família de 007)** —
  `suite.state` é um snapshot gravado uma vez, logo após o loop de `runTest` do arquivo
  (`main.tests.push(suite)`); um straggler que reabre o veredito de um teste filho DEPOIS
  desse ponto (o próprio cenário que prova 7.2) não atualizava esse snapshot — o `--json`
  reportava `state:"passed"` com `failCount:1` no mesmo objeto, uma contradição visível.
  O exit code (`grand`, recomputado ao vivo no fim) já acertava; só a linha por-arquivo do
  `--json` estava presa no passado. Corrigido: `state` de uma entry não-cacheada é
  recomputado via `summary(t)` na hora de serializar, igual o `failCount` já fazia —
  `utest.js` (bloco `asJson`).

## Verificação

- `utest . --force` — 630 checks verdes, estável em 5 rodadas consecutivas
  (`--json`, soma de `checks` idêntica todas as vezes, todo `state` `passed`).
- `sprint eval 7.2 --yes` — roteiro escrito em `plans/7-isolation/7.2.eval.js`, os 3 passos
  passaram; feature promovida 🟡 → 🟢. Um dos passos reproduziu exatamente o cenário de
  straggler+`state` obsoleto acima antes da correção, e confirmou depois.
- `sprint test` das features tocadas com `verify_tests` declarados (1.3, 2.6, 2.7, 3.2,
  5.4, 7.2) — todas verdes.
- Watch mode smoke-testado manualmente (edição durante `--watch`, sem saída misturada).
- `--trace` num arquivo fora de fase, testado num projeto sintético em `/tmp`.
- `utest cache.t.js check.t.js` avisa sobre o caminho extra em vez de descartá-lo em
  silêncio.

## Fora do escopo

- fswatch (config POJO, `bun:sqlite` estático, `exports`, README, `hash`/`content_changed`)
  e sprint-cli (009, 010, 011) ficam fora — outro repositório, outro ciclo, por decisão do
  usuário.
- 4.4/4.5/5.5 não têm `verify_tests:` declarados no frontmatter — gap pré-existente, não
  criado nem fechado por este sprint.
- A opção 3 de ISSUES/008 (unir múltiplos targets de verdade, não só filtrar por nome)
  ficou fora — a correção aplicada (opção 2) já resolve o "verde mentiroso", uma unificação
  completa de scan multi-raiz é escopo maior.
