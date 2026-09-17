# 026 — Plano: cache grava state:failed para arquivo sem check() que passou

Plano do sprint 026 (feature 2.4).

## Objetivo

[ISSUES/014](../ISSUES/014-console-assert-cru-falso-vermelho-em-lote.md): um `.t.js`
"cru" (sem `test()`/`check()`, só `console.assert`/`console.log` soltos) passa quando
rodado isolado, mas dentro de `utest .` (agregado) aparece como falha — mesmo com o
sub-ledger local do arquivo só tendo `passed` em todas as entradas.

Investigado via Explore: a causa raiz mora em `src/cache.js`, não no sub-ledger (que usa
`suite.state` direto e por isso nunca erra). `src/cache.js` tem duas gravações que tratam
`!result.checks` (zero checks) como sinônimo de falha:

1. `src/cache.js` (`write`, ramo do sidecar) — `result.failed || !result.checks` decide se
   grava um sidecar "vermelho".
2. `src/cache.js` (record de `results.json`) —
   `(result.exception || result.failed || !result.checks) ? 'failed' : 'passed'`.

Um arquivo cru sem `check()` tem `checks:0` legitimamente quando passa — isso é
diferente de `result.failed`, que já é o veredito correto
(`suite.state !== 'passed'`, calculado em `utest.js` antes do `cache.write`). O cache
(fonte que `utest .` agregado lê) divergia do sub-ledger por causa desse `!checks`
extra nas duas condições.

Sintoma 2 do mesmo ISSUES/014 (colisão `typed.t.js`/`typedtree.t.js` quando passados
juntos na mesma chamada) é um bug DIFERENTE — `utest.js` só promove o primeiro path
existente a `rawTarget`, o segundo vira filtro de nome; comportamento deliberado de
ISSUES/008, mas que aqui descarta o segundo arquivo real. **Fora deste sprint.**

## Passos

1. `src/cache.js` — remover `!result.checks` das duas condições (`write`/sidecar e o
   record de `results.json`), deixando `result.failed`/`result.exception` como única
   fonte de verdade.
2. `plans/2-cache/2.4.eval.js` (novo — 2.4 nunca teve um eval de feature, só
   `src/cache.t.js` unitário) — 2 passos `t.sandbox` (regra dos 3: 2 arquivos bastam)
   provando isolado-vs-agregado e a leitura de cache quente.
3. `ISSUES.md` — mover ISSUES/014 pra DONE, com o mecanismo exato do fix.

## Verificação

- Fixture de 2 arquivos (`cru.t.js` sem `check()`, `normal.t.js` normal): isolado
  `✔1`, agregado `✔2`, `results.json` gravando `"checks":0,"state":"passed"`
  corretamente para o arquivo cru.
- `utest .`/`utest . --force` no repo próprio: `✔630`, zero vermelho, quente e frio.
- `sprint eval 2.4 --yes`: 2/2 passos verdes, 2.4 promovida 🟡 → 🟢.

## Critério de pronto

`sprint test` verde para 2.4; fixture cru-vs-normal com veredito idêntico isolado e
agregado; suite própria inalterada (`✔630`).
