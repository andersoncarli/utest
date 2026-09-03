---
front: 1
keyword: core
title: Núcleo — coletor, asserção, veredito
state: active
updated: 2026-09-03
---
# [1] core — Núcleo do runner

O par mínimo que um arquivo de teste toca: `test()` monta a árvore, `check()` afirma,
e o veredito de cada nó é selado para não ser corrompido por trabalho assíncrono solto.
Nada aqui importa de `../utils` — é o chão sobre o qual `scanner`, `viewer` e o CLI
assentam.

- **`test.js`** — `test(name, fn, op)` empilha um nó na árvore; `test.begin/end` isola as
  registrações de UM arquivo num root próprio; `oncheck`/`sealed` devolvem uma falha
  tardia para a conta de quem a soltou.
- **`check.js`** — `check`/`checkFail`/`checkException`. Comparação por `repr()`
  (`toSource`), `check(bool)` sem `b`, `check(undefined)` só passa contra `'undefined'`.
  `check.test` é o dono corrente (global de módulo — a origem do vazamento que 1.3 tapa).
- **`console-capture.js`** — `console.*` disparado dentro de um `fn` vai para
  `t.output`, não para o stdout real; só reaparece em `-v:3`.

Coberto por `test.t.js`, `check.t.js`, `leak.t.js`. Suite verde (2026-09-03).
