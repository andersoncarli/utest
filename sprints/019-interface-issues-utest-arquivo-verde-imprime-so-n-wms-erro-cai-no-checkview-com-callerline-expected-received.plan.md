# 019 — Plano: interface-issues — `utest <arquivo>` verde imprime só `✔N (Wms)`; erro cai no checkView

Plano do sprint 019 (feature 4.1). Sprint guarda-chuva de quirks de interface —
reaberto quantas vezes for preciso até a interface consolidar.

## Objetivo

`utest check.t.js` (um arquivo, verde) hoje imprime DUAS linhas:

```
check ✔20 ------------------------------------------------------ (1ms)
unit:  ✔20                                                       (0s)
```

A entryLine do arquivo E a phaseLine da fase, redundantes quando o escopo é UM arquivo. O
esperado é UMA linha, seca:

```
✔20 (5ms)
```

- sem nome de arquivo, sem `unit:`, sem dotfill até a borda
- `(Wms)` = o **wall-clock do runner** nesta invocação (não `Σ lastMs` do storage). Escopo
  de arquivo re-executa por design (feature 4.3); o tempo vivo é o que interessa ali.

E quando há **erro ou exceção**, cai no `checkView` já existente — `✘ <lineCode> .... <addr>`
com `callerLine`, `expected:` e `received:` embaixo, **omitindo `received: false` quando
`expected: true`** (o `trivialTruthy` de `viewer.js:124` já faz isso).

## Diagnóstico

`utest.js`, no bloco de render (~L840+), o escopo de arquivo força `verbosity` a 3
(`utest.js:327`). Aí:

- **verde, cache-hit** → cai no ramo `verbosity >= 3 && nada rodou fresh` (L850): imprime
  `fullView(v:2)` = phaseLine + rio de passados.
- **verde, rodou fresh** → ramo `verbosity >= 3` (L860): a árvore por-teste já streamou em
  `runPhase`, e aqui sai a linha-resumo `phase: ✔ N (Ns)`. Combinado com a entryLine que o
  streaming imprimiu, dá as duas linhas.

Nenhum ramo trata "escopo é um arquivo só, verde" como caso especial.

## Passos

1. **`utest.js`** — no início do bloco de render, um curto-circuito: se `_isFile` E
   `rendered.length === 1` E `main.state === 'passed'` (sem vermelho, sem exceção) E não é
   `--hogs`/`--json`/`--trace` → imprimir uma linha só, `✔<Σchecks> (<wallMs>ms)`, e sair
   do bloco de render (pular phaseLine, coverage, tip). `wallMs` vem do tempo de parede do
   runner já medido (o `performance.now()` de abertura; ver `T.install` em L349 e o
   `main.duration`/relógio da rodada).
   - O streaming por-teste do `-v:3` durante `runPhase` NÃO pode ter impresso a entryLine
     nesse caso — ou suprimir o stream quando `_isFile` (deixar o render final falar), ou
     garantir que o único output seja a linha seca. Decidir na implementação olhando
     `runPhase`/`view`.

2. **`utest.js`** — o caso com **vermelho** num arquivo só: JÁ funciona via o ramo `else`
   (→ `fullView` → `failLines` → `checkView`). Conferido: `✘ <lineCode> .... <addr>` com
   `received:`/`expected:` embaixo, e `received: false` omitido quando o esperado era `true`
   (o `trivialTruthy` de `viewer.js:124`). Nada a mudar aqui.

3. **`viewer.t.js`** — testes novos:
   - escopo de arquivo verde → a saída é UMA linha, casa `/^✔\d+ \(\d+ms\)$/`, sem `unit:`
     nem o nome do arquivo
   - escopo de arquivo com um `check(1,2)` → `checkView`: tem o `lineCode`, `received: 2`,
     `expected: 1`
   - escopo de arquivo com `check(x, true)` falho → tem o `lineCode` e NÃO tem
     `received: false`

## Critério de pronto

- `bun utest.js check.t.js` (com as demos de falha comentadas) → exatamente `✔N (Wms)`,
  uma linha
- `bun utest.js check.t.js` (com as demos ativas) → frame + `checkView` com
  callerLine/expected/received, `received: false` omitido no caso `expected: true`
- `bun utest.js viewer.t.js` — verde
- `bun utest.js .` — verde, sem regressão nas outras formas de saída (v0/v1/v2/v3 largo,
  emoldurado, `--hogs`)
- `sprint eval --sweep` — verde
