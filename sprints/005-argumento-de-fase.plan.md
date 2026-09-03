# Sprint 005 — `utest <phase>`: rodar uma fase só

> Sprint retroativo, reconstruído em 2026-09-03. Sprint pequeno — um commit.

## Janela

`9f84e8b` (2026-09-02).

## Context

`TEST.yaml` podia declarar várias fases (`unit`, `eval`, `int`, `tui`), mas o CLI sempre
rodava todas. Um positional que casasse um nome de fase declarada deveria selecionar
aquela fase e sair da lista de filtros — `utest eval` roda só a fase `eval`, cacheada, em
vez de tratar `eval` como termo de nome (que furava o cache e escaneava as outras).

## Objetivo

- Leitura rasa das chaves de topo do `TEST.yaml` de `cwd` para saber os nomes de fase
  declarados.
- Um positional que case um nome de fase → `phaseArg`; sai dos `filterTerms`.
- `phaseNames` filtrado por `phaseArg` quando presente.
- Uma fase sem `include` E sem provider registrado é ignorada (não vira fase fantasma).

## Frentes tocadas

- **4 report** — `utest.js`, a seleção de fase no topo dos args.
- **3 scan** — `scan(root, configPath, phase)` finalmente recebe o 3º argumento (antes
  caía sempre em `'unit'` e as outras fases do YAML nunca eram varridas).

## Requisitos verificáveis

- `utest.js eval` roda só a fase `eval`.
- `utest.js unit` roda só `unit`.
- Uma fase declarada só com `boot:`/`exclude:` não vira fase.
