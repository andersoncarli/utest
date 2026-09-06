---
front: 8
keyword: ledger
title: memoria permanente — o ledger criptografico sobre iodb
state: confirmed
updated: 2026-09-06
---
# [8] ledger — memoria permanente, o log encadeado sobre iodb

## O que e

O `utest` com **memoria e estado permanente**. Hoje ele lembra o suficiente para decidir se
um arquivo re-roda (`.utest/results.json`, invalidado por mtime) e nada alem disso: apagar o
`.utest/` custa uma rodada fria e nao perde nada. Esta frente da a ele a outra metade — um
**log append-only criptograficamente encadeado**, sobre o `iodb`, onde cada rodada deixa
rastro permanente e verificavel.

Duas memorias, duas perguntas, e elas nao se confundem:

| | `.utest/results.json` (frente 2-cache) | o ledger (esta frente) |
|---|---|---|
| pergunta | este teste esta fresco? | o que ja aconteceu, e da pra confiar? |
| forma | estado por arquivo, sobrescrito | append-only, encadeado |
| invalidacao | mtime do alvo/deps | **nenhuma** — e imutavel |
| perder custa | uma rodada fria | a historia inteira |

O cache continua sendo do cache. O ledger nao o substitui.

## De onde vem

De `~/bot/cmds/testio` — uma implementacao anterior que ja tinha esta tese e parou
(*stalled*) por falta do resto. Mesma linhagem: `testio` nasceu para ser um runner de testes
sobre a solidez do `iodb`, e o `utest` e o runner que de fato existe. Esta frente traz as
ideias de la para ca; `testio` nao substitui o `utest`, **evolui** ele.

O que se assimila, concretamente:

- `testio/audit.js` — `openAudit(root)`: `runId`, eventos `run:start` / `test:result` /
  `run:end`, e o **`fileSet` com `sha256` por arquivo** (a assinatura do conjunto testado);
- a doutrina do `ARCHITECTURE.md` — *"o objetivo nao e apenas rodar testes; e produzir um
  log de execucao confiavel"*, o executor devolve JSON e nao render, o renderer so formata a
  projecao sem decidir semantica;
- do `iodb` — `hash.js` (LRM: `key = sha64(payload) XOR sha64(prevKey)`, `canonical()`,
  `verify()`) e `io-engine.js` (log append-only + projecao, `io.out()` como canal reativo).

## Por que importa

**Garantia ancorada no conteudo.** Com o `sha256` do conjunto em cada `run:start`, "esta
feature foi validada 12 vezes" vira "12 vezes, das quais 9 sobre exatamente este conteudo".
Um acumulado que nao sabe se o codigo mudou entre as validacoes nao e evidencia — e
contagem.

**O evento assincrono.** O `utest` nao sabe o que e uma validacao humana, e nao precisa
saber. Ele sabe do seu ledger, e o ledger aceita escrita de plugin. Um `ok` humano vira um
teste cujo resolvedor e uma pessoa — uma stream de eventos a la rxjs. Isso desfaz a
assimetria que hoje obriga o `sprint` a manter contabilidade propria: `.t.js` sincrono,
`.eval.js` headless e `ok` humano passam a ser tres produtores do MESMO log.

**A prova de fogo do `iodb`.** O `iodb` e a rocha sobre a qual o resto deve se assentar. Um
ledger de testes — escrita concorrente por workers, verificacao de cadeia, projecao que tem
que convergir — e o teste mais duro que se pode dar a ele, e num terreno onde a falha e
barata de descobrir.

## Quem consome

O `~/tui` (feature 3.2, "o ato E a memoria pertencem ao TESTE") e o primeiro consumidor: o
overlay do `eval` apenda o `ok` humano aqui, e o `sprint` deixa de lembrar por conta propria
— vira leitor. O ledger e o pre-requisito daquela feature.
