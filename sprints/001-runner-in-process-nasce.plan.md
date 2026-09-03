# Sprint 001 — o runner in-process nasce

> Sprint retroativo, reconstruído em 2026-09-03 a partir de `git log`. Objetivo, não
> exaustivo: registra a janela e a intenção, não cada linha.

## Janela

`0757ce5` (2026-04-21) … `8105939` (2026-06-19). ~11 commits.

## Context

`utils/utest.js` era um dos três runners de teste em `~/bot` (os outros: `lib/test-runner.js`,
`utest/index.js` de ~1200 linhas). A conversa que abriu esta janela ("classify the errors")
estabeleceu a arquitetura correta e fez a primeira limpeza cirúrgica.

## Objetivo

Um runner in-process com um contrato claro: **um arquivo de teste nunca importa nada para
definir seus testes**. `test()` é global; `check`, `is`, `log` chegam como argumentos de
`fn` em tempo de execução. Três fases, três responsabilidades:

1. **scan** (`scanner.js`) — walk por `TEST.yaml`, `import()` de cada arquivo casando a
   heurística, a árvore `test.main` como POJO.
2. **run** — executa cada `fn(context)`, captura checks/exceções/output/duração.
3. **render** (`viewer.js`) — o relatório.

## Frentes tocadas

- **1 core** — `test.js` (coletor), `check.js` (asserção), o contrato "zero import".
- **3 scan** — `scanner.js` (o walk, o pareamento teste↔alvo).
- **4 report** — `viewer.js` (a primeira forma do relatório).

## Requisitos verificáveis (o que ficou de pé ao fim da janela)

- `bun utest.js .` roda a suíte e sai 0/1 conforme falha.
- `test()` empilha na árvore sem precisar de import.
- `check(a)` / `check(a, b)` com a semântica de `repr()`.
- O scanner separa teste de fonte.
