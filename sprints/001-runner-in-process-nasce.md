---
sprint: "001"
slug: "runner-in-process-nasce"
title: "Sprint 001 — report"
features: ["1.1", "3.1", "4.1"]
budget: null
state: "closed"
opened: "2026-09-03"
closed: "2026-09-03"
migrated: "0.2"
---

# 001 — Sprint 001 — report

> Sprint retroativo, reconstruído em 2026-09-03 a partir de `git log`. Objetivo, não > exaustivo: registra a janela e a intenção, não cada linha.

# PLAN

## Por que este sprint existe agora

**Janela**

`0757ce5` (2026-04-21) … `8105939` (2026-06-19). ~11 commits.

**Context**

`utils/utest.js` era um dos três runners de teste em `~/bot` (os outros: `lib/test-runner.js`,
`utest/index.js` de ~1200 linhas). A conversa que abriu esta janela ("classify the errors")
estabeleceu a arquitetura correta e fez a primeira limpeza cirúrgica.

**Objetivo**

Um runner in-process com um contrato claro: **um arquivo de teste nunca importa nada para
definir seus testes**. `test()` é global; `check`, `is`, `log` chegam como argumentos de
`fn` em tempo de execução. Três fases, três responsabilidades:

1. **scan** (`scanner.js`) — walk por `TEST.yaml`, `import()` de cada arquivo casando a
   heurística, a árvore `test.main` como POJO.
2. **run** — executa cada `fn(context)`, captura checks/exceções/output/duração.
3. **render** (`viewer.js`) — o relatório.

## Features que este sprint toca

- **1 core** — `test.js` (coletor), `check.js` (asserção), o contrato "zero import".
- **3 scan** — `scanner.js` (o walk, o pareamento teste↔alvo).
- **4 report** — `viewer.js` (a primeira forma do relatório).

## Requisitos verificáveis (o que ficou de pé ao fim da janela)

- `bun utest.js .` roda a suíte e sai 0/1 conforme falha.
- `test()` empilha na árvore sem precisar de import.
- `check(a)` / `check(a, b)` com a semântica de `repr()`.
- O scanner separa teste de fonte.

# REPORT

Sprint retroativo. O runner in-process nasce: scan/run/render num processo só, contrato zero-import.

## O que aconteceu

- **`utest.js` in-process funcional** — scan → import alvo → `runTest` → render, num
  processo só. `71d6c20` marca "All green ✔ 1511 (103ms)".
- **`scanner.js` "simple scanner"** (`914cbee`) — o walk por glob + `TEST.yaml`.
- **`TEST-SPEC.md` / `TEST-PROBLEMS-I-FOUND.md`** (`ed8b175`) — o contrato-alvo e os
  achados da migração escritos em prosa.
- **`utest2.js`** (`48cb204` "utest2 optimized") — uma segunda cópia do runner, "otimizada".

## Onde o PLAN errou

- **Já nasceu com duas cópias do runner** (`utest.js` + `utest2.js`). A dívida de
  manutenção-em-dois-lugares que persiste até hoje (dois `runTest`, dois `plugin()`)
  começa aqui.
- **A doc prometeu mais do que o código fez.** `STATUS.md` (`8105939`) e
  `TEST-MASTER-PLAN.md` descrevem workers por arquivo, isolamento total, streaming
  persistente — nada disso no `utest.js` desta janela, que é in-process puro. A promessa
  vira a frente **7 isolation**, ainda aberta.
- **`scanner2.js` foi criado e apagado** (`ed8b175` remove 55 linhas) — tentativa
  abandonada, sem registro do porquê.

## O que fica aberto

| frente | estado |
|---|---|
| 1 core | 🟠 — `test.js`/`check.js` existem, sem `.t.js` próprio ainda |
| 3 scan | 🟠 — `scanner.js` funcional, `findTarget` básico |
| 4 report | 🟠 — `viewer.js` na primeira forma (`═══`, glyph por check) |
