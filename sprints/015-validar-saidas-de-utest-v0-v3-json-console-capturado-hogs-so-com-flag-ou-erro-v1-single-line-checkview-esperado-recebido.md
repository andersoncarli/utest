---
sprint: "015"
slug: "validar-saidas-de-utest-v0-v3-json-console-capturado-hogs-so-com-flag-ou-erro-v1-single-line-checkview-esperado-recebido"
title: "validar saidas de utest: v0-v3, --json, console capturado, hogs so com flag ou erro, v1 single-line, checkView esperado/recebido"
features: ["4.1"]
budget: null
state: "closed"
opened: "2026-09-06"
closed: "2026-09-06"
migrated: "0.2"
---

# 015 — validar saidas de utest: v0-v3, --json, console capturado, hogs so com flag ou erro, v1 single-line, checkView esperado/recebido

Sprint 015 · feature 4.1 (`viewer.js` + bloco de render de `utest.js`).

# PLAN

## Por que este sprint existe agora

Duas coisas de uma vez:

1. **Cobrir com teste** todas as formas de saída do `utest`, para que qualquer regressão
   de report seja pega pela suíte e não pelo olho do usuário:
   - `fullView` em **v0, v1, v2, v3** — verde puro e com vermelho/hog/exceção
   - `--json` (`failInfo`/`failData` + a linha por arquivo)
   - **console capturado** (`log()` do teste): aparece em v3 e sob vermelho, some no verde v1/v2
   - `phaseLine`, `compactFails`, `hogReport`, `fileLine`, `failLines`, `checkView`

2. **Três correções** motivadas pelo report do usuário:
   - **A. `checkView` — `received:`/`expected:` e o `lineCode` (callerLine)**
     A regressão: um vermelho de `check(x, y)` que saiu só com a linha `check()` e sem o
     par esperado/recebido nem o endereço. Causa provável: quando o `lineCode` não é
     extraível do stack (regex `INTERNAL` mudou em 7f0f6d1 / 7d2c488 e passou a casar o
     frame errado), o `checkView` cai em `'check()'` literal e o endereço fica vazio.
     Corrigir a extração e garantir que `received:`/`expected:` sempre saem para um
     `check` de 2 args que falhou (mesmo com `undefined` — `check.js` já grava `'undefined'`
     como string, então nunca deve sumir).
   - **B. Badge de hog por arquivo só com `--hogs` ou sob erro**
     Hoje `compactFails` (v0/v1) lista `nome 🐢N` para todo arquivo hog, sem flag.
     Novo contrato: **o total de hogs no título (`phaseLine` `(Ns 🐢M)`) SEMPRE aparece
     quando há hog** (já aparece — manter). O **detalhe por arquivo** (`nome 🐢N`) só
     quando: `--hogs` passado, OU aquele arquivo também é vermelho (`nome ✘M 🐢N`).
     Um hog que deu erro É relatado (com o badge).
   - **C. `-v:1` = uma linha por fase quando não há erro**
     Sem vermelho e sem exceção, `fullView` v1 devolve só o `phaseLine` (o `compactFails`
     só entra se sobrou vermelho — ver B, hogs sozinhos não puxam bloco).

## Plano de materializacao

1. **Ler `viewer.t.js` atual** — ver o que já cobre, não duplicar.
2. **A — checkView**: corrigir `extractLineCode`/`extractAddr` (regex `INTERNAL` casa
   `ledger.t.js`? não deveria — só arquivos do framework). Teste: um `check(1, 2)` sintético
   → `checkView` devolve `✘ ... `, `received: 1`, `expected: 2`, e um endereço `*.t.js:NNN`.
   Teste com `undefined`: `check(undefined, 3)` → `received: undefined` presente.
3. **B — compactFails**: assinatura ganha `{ hogs = false }`. Sem `hogs`, o grupo de hogs
   puros (não-vermelhos) não é emitido; um vermelho que também é hog mantém o `🐢N`.
   `utest.js` passa `hogs` (já tem a var).
4. **C — fullView v1**: quando `compactFails` volta vazio (verde, ou só-hog sem flag),
   devolver só a linha do `phaseLine` — já é o comportamento se `cf` for `''`; garantir
   com B que `cf` fica `''` no caso só-hog.
5. **Cobertura ampla (objetivo 1)**: `viewer.t.js` — uma árvore-fixture com: 1 arquivo
   verde, 1 vermelho (check 2-arg), 1 exceção, 1 hog verde, 1 hog+vermelho, `output` no
   vermelho e no verde. Rodar `fullView` nos 4 níveis + `--json` (`failData`/`failInfo`) e
   afirmar linha a linha o que aparece/some.
6. `sprint test 4.1` (verify_tests da feature) verde.
7. Rodar `utest .` no próprio repo e em `~/tui` — conferir v1 single-line, hog só no
   título, `--hogs` traz o detalhe.

## Criterio de pronto

- `viewer.t.js` cobre v0–v3 + json + console capturado, todos verdes
- `utest .` (largo, sem flag, suíte verde) = uma linha por fase, `🐢N` só no título
- `utest . --hogs` = o detalhe por arquivo volta
- `utest ~/tui` com um vermelho = o vermelho traz `received:`/`expected:` e endereço
- `sprint eval 4.1 --yes` → 🟢

## Arquivos

- `viewer.js` — `checkView` (A), `compactFails` (B), `fullView` v1 (C)
- `utest.js` — o bloco de render (linhas ~795–911): passar o flag `hogs` ao `compactFails`/`fullView`
- `viewer.t.js` — cobertura nova (1) + regressão de A/B/C
- `cache.js` — só se o formato gravado (`failData`) precisar de campo novo

## O que mudou (execução)

**`viewer.js`**
- `import fs from 'fs'` novo — para a rede de `extractLineCode`/`extractAddr`.
- `parseStack`/`callerLineOf` novos: fallback de parse de `err.stack` para quando
  `callstack()` devolve pilha vazia (captura interna dele quando `globalThis.G` falta —
  subprocesso, filho do `--watch`). Sem isso o vermelho re-renderizado nesse contexto
  perdia endereço E `lineCode`, saindo só `check()`. Aceita `at fn (p:l:c)` e `at p:l:c`
  (forma Bun de frame de módulo/arrow).
- `extractLineCode`/`extractAddr`: depois do `try{callstack}` sem achar, varrem `parseStack`.
- `compactFails({ hogs = false })`: sem o flag, o grupo de hogs PUROS (verde e lento) não
  é emitido. Um vermelho que é hog mantém `✘M 🐢N` (o erro já puxa o arquivo).
- `fullView` v1: passa `op.hogs` ao `compactFails`. Sem vermelho e sem o flag, `cf` fica
  vazio → v1 é UMA linha (só o `phaseLine`, que já carrega `(Ns 🐢M)`).

**`utest.js`**
- `framed = anyRed` (era `anyRed || anyHog`): um hog verde não puxa mais a moldura. O
  `--hogs` tem formato próprio (`hogReport`) e nem passa por aqui.
- Bloco tight (v<2 verde) e linha-resumo do v3: o parén ganha ` 🐢M` (`phaseHogSecs`)
  quando a fase tem hog — o TOTAL sempre aparece, o detalhe é do `--hogs`.

**`viewer.t.js`**
- 3 testes reescritos para o novo contrato (hog verde só com `hogs:true`).
- 9 testes novos: matriz v0/v1/v1--hogs/v2/v3, `failData`/`failInfo` (--json), re-render
  frio de `checkView`, degradação sem `error`/`lineCode`/`address`.
- 163 asserts verdes em `viewer.t.js`; suíte cheia 559 ✔.

# REPORT

As quatro verbosidades de `utest` viram teste: v0-v3, `--json` e console capturado passam a ser cobertos por `viewer.t.js` em vez do olho do usuario, e com eles tres correcoes de report — `checkView` sempre com `received:`/`expected:` e endereco, badge de hog por arquivo so com `--hogs` ou sob vermelho, e `-v:1` verde de volta a uma linha por fase.

## O que aconteceu

**Objetivo**

Uma regressao de report so aparecia quando alguem olhava a tela: um `check(a, b)` vermelho
saiu sem o par `received:`/`expected:` e sem endereco, e ninguem foi avisado porque nenhuma
saida de `utest` era verificada por teste. O sprint fecha essa lacuna e, ja com a rede no
lugar, corrige o que ela expos.

**O que foi entregue**

**Cobertura das saidas** — `viewer.t.js` passa a afirmar linha a linha a matriz
v0/v1/v1--hogs/v2/v3, `--json` (`failData`/`failInfo`), o console capturado do teste
(aparece em v3 e sob vermelho, some no verde v1/v2), o re-render frio do `checkView` e a
degradacao sem `error`/`lineCode`/`address`. 163 asserts no arquivo; suite cheia 559 ✔.

**A. `checkView` volta a ter endereco e o par esperado/recebido** — a causa era pilha
vazia: quando `callstack()` roda sem `globalThis.G` (subprocesso, filho do `--watch`) ele
devolve nada, e `extractLineCode`/`extractAddr` caiam no literal `'check()'`. `parseStack`/
`callerLineOf` novos sao a rede — varrem `err.stack` aceitando `at fn (p:l:c)` e a forma Bun
`at p:l:c`.

**B. Hog verde nao puxa mais bloco nem moldura** — o TOTAL de hogs continua sempre no
titulo (`phaseLine`, `(Ns 🐢M)`); o DETALHE por arquivo (`nome 🐢N`) agora exige `--hogs`
ou que o arquivo tambem seja vermelho (`nome ✘M 🐢N`). Em `utest.js`, `framed = anyRed`
(era `anyRed || anyHog`).

**C. `-v:1` verde e uma linha por fase** — sem vermelho e sem `--hogs`, `compactFails`
devolve vazio e sobra so o `phaseLine`, que ja carrega o total.

## O que fica aberto

`sprint eval 4.1` passo a passo com o humano — a feature esta 🟡 testada e sem nenhuma
validacao registrada.

## Arquivos

- `viewer.js` — `parseStack`/`callerLineOf` (A), `compactFails({hogs})` (B), `fullView` v1 (C)
- `utest.js` — bloco de render: `framed = anyRed`, `🐢M` no paren do tight e do resumo v3
- `viewer.t.js` — 9 testes novos, 3 reescritos para o novo contrato de hog
