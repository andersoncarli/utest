---
sprint: 30
date: 2026-09-18
features: [1.2]
thread: null
---
# 030 — eval-de-check

Escreveu `plans/1-core/1.2.eval.js` — 9 passos que demonstram check()/checkFail/checkException pelo veredito real do binario, levando 1.2 de 🟡 a 🟢.

## Objetivo

Dar a 1.2 a evidencia que o degrau 🟢 exige: uma demonstracao que RODA, cobrindo
os 6 requisitos da feature contra o `utest` de verdade, nao contra o retorno da
funcao.

## O que entregou

- `plans/1-core/1.2.eval.js` — 9 passos `t.sandbox`, cada um montando um projeto
  minimo e rodando o binario:
  - check(a) booleano puro (passa) e check(false) (reprova o arquivo)
  - check(a, b) por repr, com funcao avaliada dos dois lados
  - check(undefined) so passa contra a string 'undefined'
  - checkFail invertendo o veredito nos dois sentidos
  - checkException com fn que lanca e fn que nao lanca
  - Error como `a` virando 💥 exception, nao falha comum
  - received/expected no -v:2 do par nao-trivial, e sua omissao no par trivial

## Nota

`check(undefined, undefined)` FALHA — so passa contra a string 'undefined'. E
contraintuitivo em JS, e o requisito pede, e agora esta travado por evidencia.
