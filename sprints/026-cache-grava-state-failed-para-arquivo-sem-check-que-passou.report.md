---
sprint: 26
date: 2026-09-16
features: [2.4]
thread: null
---
# 026 — cache grava state:failed para arquivo sem check() que passou

Intro: um `.t.js` cru (sem `check()`) que passa isolado virava falso-vermelho dentro
de `utest .` — o cache tratava `checks:0` como falha, ignorando o veredito real.

## Objetivo

[ISSUES/014](../ISSUES/DONE/014-console-assert-cru-falso-vermelho-em-lote.md):
divergência entre o sub-ledger local de um arquivo (sempre correto, `passed`) e o
veredito agregado de `utest .` (falso `failed`) para um `.t.js` "cru" — sem
`test()`/`check()`, só `console.assert`/`console.log` soltos.

## O que mudou

- **`src/cache.js`**: duas condições que tratavam `!result.checks` (zero checks) como
  sinônimo de falha corrigidas para usar só `result.failed`/`result.exception` — o
  veredito real, já calculado corretamente em `utest.js` (`suite.state !== 'passed'`)
  antes de chegar no cache:
  - ramo do `write` que decide gravar sidecar "vermelho": `result.failed || !result.checks`
    → `result.failed`.
  - record de `results.json`: `(result.exception || result.failed || !result.checks)`
    → `(result.exception || result.failed)`.
  Um arquivo cru sem `check()` tem `checks:0` legitimamente quando passa; isso nunca
  deveria ter sido tratado como falha.
- **`plans/2-cache/2.4.eval.js`** (novo): a feature 2.4 nunca tinha um `.eval.js`
  próprio (só o `src/cache.t.js` unitário sustentava o degrau 🟡 testada) — 2 passos
  `t.sandbox` (regra dos 3, 2 arquivos bastam): (1) fixture cru+normal, compara
  isolado vs. agregado via `--json`; (2) mesma fixture, confirma que o cache QUENTE
  também lê `state:"passed"`/`checks:0` corretamente.
- **`ISSUES.md`**: ISSUES/014 movido de TODO para DONE com o mecanismo exato do fix;
  arquivo físico movido para `ISSUES/DONE/`. Aproveitado para também resolver duas
  entradas TODO que a investigação desta sessão descobriu já estarem fora de posição:
  ISSUES/010 (`HANDOFF.md` avulso) já tinha sido movido para `handoffs/260424.md` no
  commit `4ab3484` — item estava só desatualizado, movido para DONE; ISSUES/011
  (`requests()`/`open()` divergem) mora em `sprint-template.js`
  (`~/sprint-cli/v2/tools/`), fora do repo `utest` — corrigida a nota de que é escopo
  `sprint-cli`, não `utest` (mantido em TODO, mas com o dono certo anotado).

## Fora deste sprint (achados, não corrigidos)

- **Sintoma 2 do ISSUES/014** (colisão `typed.t.js`/`typedtree.t.js` quando passados
  juntos na mesma chamada — só um dos dois roda): bug diferente, em `utest.js`
  (parsing de positional) — só o primeiro path existente vira `rawTarget`, o segundo
  cai a filtro de nome em vez de rodar junto. Comportamento deliberado de ISSUES/008,
  mas que aqui descarta silenciosamente um arquivo real. Não reaberto aqui.
- **`plans/7-isolation/7.2-....md`** (frontmatter de sprint 024, já fechado) ainda
  referencia `ISSUES/014-console-assert-cru-falso-vermelho-em-lote.md` pelo path
  antigo (pré-DONE/) — `sprint files --drift` confirmou FORA do escopo declarado
  deste sprint (órfão, nenhuma feature reivindica esse arquivo); cosmético, sem
  função — não corrigido aqui.
- **`plans/7-isolation/7.2.eval.js`** tem o mesmo bug de precedência de operador
  (`await sh("utest") + " . --force --json"`) já achado no sprint 025 em outro eval
  script — presente desde antes desta sessão, não tocado (fora do escopo de 2.4).

## Verificação

- Fixture de 2 arquivos (`cru.t.js` sem `check()`, `normal.t.js` normal): isolado
  `✔1`, agregado `✔2`; `results.json` gravando `"checks":0,"state":"passed"` (ou
  `checks:1` quando o `console.assert` em si é contado — ambos `passed`, o que
  importa) corretamente para o arquivo cru, quente e frio.
- `utest .` / `utest . --force` no repo próprio: idênticos, `✔630`, zero vermelho.
- `sprint eval 2.4 --yes`: 2/2 passos verdes, 2.4 promovida 🟡 → 🟢.
