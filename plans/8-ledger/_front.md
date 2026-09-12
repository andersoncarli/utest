---
front: 8
keyword: ledger
title: memoria permanente — o ledger criptografico sobre iodb
state: active
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

## O que ele virou — memoria do PROJETO, nao do runner

Esta frente comecou como "o utest com memoria". O que foi construido e maior que isso, e vale
nomear porque muda quem pode usar.

Olhe as propriedades do `ledger.js` sem olhar o nome: log **append-only**; cadeia
criptografica (`sha64(payload) XOR sha64(prevKey)`, sem back-pointers); `verify()` que nao so
detecta adulteracao mas **localiza** (`failedAt`); ancoragem no **conteudo** (`sha256` por
arquivo, a cada rodada); **projecao que converge** — o estado presente e derivado do
historico, nunca mantido em paralelo a ele; e escrita **aberta a qualquer processo** (lock
atomico por `renameSync`, com notificacao emitida depois de soltar o lock, para que um
handler possa escrever sem deadlock).

Nenhuma dessas propriedades menciona teste. Sao propriedades de **memoria de projeto**. O
ledger grava `test:result` porque foi ali que a necessidade apareceu — nao porque seja o
limite do que ele guarda.

**Como chegou aqui, e a ordem importa.** Nao foi abstracao procurando aplicacao. Foi o
oposto: a feature 4.1 do `~/tui` precisou auditar **clique humano** — evento de mouse,
assincrono, sem lugar onde ficar registrado. Foi essa necessidade concreta que trouxe de
volta as ideias do `~/bot/cmds/testio`, stalled por falta de contexto. Um problema pequeno
puxou de volta a solucao que ja esperava.

**Por que isso e a saida do beco.** O ZSS proibe derivar estado de `git log`, `ls`, `grep` —
sao formatos de APRESENTACAO, e ler estado deles envelhece calado e erra. A sessao de
2026-09-06 pagou esse preco duas vezes: um output ANSI-escapado gerou um diagnostico errado
(um bug inexistente descrito, uma correcao proposta para codigo sao), e um motor de eval
legado discordou de si mesmo entre duas invocacoes. O antidoto e sempre o mesmo — evidencia
estruturada, na fonte, no instante em que acontece. O ledger e isso, generalizado.

O efeito pratico na garantia: "validada 12 vezes" vira "12 vezes, das quais 9 sobre
exatamente este codigo". A diferenca entre contagem e evidencia.

## Quem consome

O `~/tui` (feature 3.2, "o ato E a memoria pertencem ao TESTE") e o primeiro consumidor: o
overlay do `eval` apenda o `ok` humano aqui, e o `sprint` deixa de lembrar por conta propria
— vira leitor. O ledger e o pre-requisito daquela feature.

Depois dele, e ja fora de teste: o `~/tui` 4.2 (o terminal vivo) apenda os eventos da sessao
humana — `cmd:exit`, `error`, `input` — na MESMA stream que guarda o `.t.js` que rodou antes.
E o `sprint` (`~/sprint-cli` 10.80) passa a derivar a garantia daqui em vez do proprio
`.sprint/eval-log.jsonl`.

Tres produtores, uma stream: teste sincrono, eval headless, humano assincrono. E dai que vem
o conhecimento auto-reflexivo do projeto — quando ele para de reconstruir o proprio passado
por inferencia e passa a **le-lo**.
