---
sprint: 15
date: 2026-09-06
features: [4.1]
thread: null
---
# 015 — validar saidas de utest: v0-v3, --json, console capturado, hogs so com flag ou erro, v1 single-line, checkView esperado/recebido

As quatro verbosidades de `utest` viram teste: v0-v3, `--json` e console capturado passam a ser cobertos por `viewer.t.js` em vez do olho do usuario, e com eles tres correcoes de report — `checkView` sempre com `received:`/`expected:` e endereco, badge de hog por arquivo so com `--hogs` ou sob vermelho, e `-v:1` verde de volta a uma linha por fase.

## Objetivo

Uma regressao de report so aparecia quando alguem olhava a tela: um `check(a, b)` vermelho
saiu sem o par `received:`/`expected:` e sem endereco, e ninguem foi avisado porque nenhuma
saida de `utest` era verificada por teste. O sprint fecha essa lacuna e, ja com a rede no
lugar, corrige o que ela expos.

## O que foi entregue

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

## Arquivos

- `viewer.js` — `parseStack`/`callerLineOf` (A), `compactFails({hogs})` (B), `fullView` v1 (C)
- `utest.js` — bloco de render: `framed = anyRed`, `🐢M` no paren do tight e do resumo v3
- `viewer.t.js` — 9 testes novos, 3 reescritos para o novo contrato de hog

## Proxima acao

`sprint eval 4.1` passo a passo com o humano — a feature esta 🟡 testada e sem nenhuma
validacao registrada.
