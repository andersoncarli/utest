---
front: 7
keyword: isolation
title: Isolation — o alvo arquitetural que ainda não chegou
state: active
updated: 2026-09-03
---
# [7] isolation — worker por arquivo

A doc antiga (`TEST-MASTER-PLAN.md`, `HANDOFF.md`, `STATUS.md`) prometeu **workers por
arquivo, isolamento total, streaming persistente**. O `utest.js` de hoje é
**majoritariamente in-process** — útil para compatibilidade e diagnóstico, mas não é o
modelo final.

O sintoma que só o isolamento fecha está documentado (evidência 2026-08-21, `STATUS.md`):
rodando a suíte inteira in-process, o arquivo que aparece como 💥 muda entre execuções e a
contagem total varia — uma exceção assíncrona tardia (provável `process.exit()` de um
subprocesso) é atribuída ao arquivo errado. `sealed` ([[1.3]]) tapa o caso do `check`
tardio; a exceção tardia continua aberta.

`worker.js` + `runner.js` + `index.js` são a base do caminho de subprocesso; hoje só
`index.js`/`worker.js` o usam, e a fase `eval` do soml roda sobre o `runTest` de
`runner.js`.
