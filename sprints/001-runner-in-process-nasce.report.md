---
sprint: 1
date: 2026-09-03
features: [1.1, 3.1, 4.1]
---
# Sprint 001 — report

Sprint retroativo. O runner in-process nasce: scan/run/render num processo só, contrato zero-import.

## O que entregou

- **`utest.js` in-process funcional** — scan → import alvo → `runTest` → render, num
  processo só. `71d6c20` marca "All green ✔ 1511 (103ms)".
- **`scanner.js` "simple scanner"** (`914cbee`) — o walk por glob + `TEST.yaml`.
- **`TEST-SPEC.md` / `TEST-PROBLEMS-I-FOUND.md`** (`ed8b175`) — o contrato-alvo e os
  achados da migração escritos em prosa.
- **`utest2.js`** (`48cb204` "utest2 optimized") — uma segunda cópia do runner, "otimizada".

## Visão crítica

- **Já nasceu com duas cópias do runner** (`utest.js` + `utest2.js`). A dívida de
  manutenção-em-dois-lugares que persiste até hoje (dois `runTest`, dois `plugin()`)
  começa aqui.
- **A doc prometeu mais do que o código fez.** `STATUS.md` (`8105939`) e
  `TEST-MASTER-PLAN.md` descrevem workers por arquivo, isolamento total, streaming
  persistente — nada disso no `utest.js` desta janela, que é in-process puro. A promessa
  vira a frente **7 isolation**, ainda aberta.
- **`scanner2.js` foi criado e apagado** (`ed8b175` remove 55 linhas) — tentativa
  abandonada, sem registro do porquê.

## Estado das frentes ao fim da janela

| frente | estado |
|---|---|
| 1 core | 🟠 — `test.js`/`check.js` existem, sem `.t.js` próprio ainda |
| 3 scan | 🟠 — `scanner.js` funcional, `findTarget` básico |
| 4 report | 🟠 — `viewer.js` na primeira forma (`═══`, glyph por check) |
