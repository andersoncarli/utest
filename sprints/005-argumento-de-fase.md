---
sprint: "005"
slug: "argumento-de-fase"
title: "Sprint 005 — report"
features: ["4.3", "3.1"]
budget: null
state: "closed"
opened: "2026-09-03"
closed: "2026-09-03"
migrated: "0.2"
---

# 005 — Sprint 005 — report

> Sprint retroativo, reconstruído em 2026-09-03. Sprint pequeno — um commit.

# PLAN

## Por que este sprint existe agora

**Janela**

`9f84e8b` (2026-09-02).

**Context**

`TEST.yaml` podia declarar várias fases (`unit`, `eval`, `int`, `tui`), mas o CLI sempre
rodava todas. Um positional que casasse um nome de fase declarada deveria selecionar
aquela fase e sair da lista de filtros — `utest eval` roda só a fase `eval`, cacheada, em
vez de tratar `eval` como termo de nome (que furava o cache e escaneava as outras).

**Objetivo**

- Leitura rasa das chaves de topo do `TEST.yaml` de `cwd` para saber os nomes de fase
  declarados.
- Um positional que case um nome de fase → `phaseArg`; sai dos `filterTerms`.
- `phaseNames` filtrado por `phaseArg` quando presente.
- Uma fase sem `include` E sem provider registrado é ignorada (não vira fase fantasma).

## Features que este sprint toca

- **4 report** — `utest.js`, a seleção de fase no topo dos args.
- **3 scan** — `scan(root, configPath, phase)` finalmente recebe o 3º argumento (antes
  caía sempre em `'unit'` e as outras fases do YAML nunca eram varridas).

## Criterio de pronto

- `utest.js eval` roda só a fase `eval`.
- `utest.js unit` roda só `unit`.
- Uma fase declarada só com `boot:`/`exclude:` não vira fase.

# REPORT

Sprint retroativo. utest <phase> seleciona uma fase só; scan() finalmente recebe o 3º argumento e as fases do TEST.yaml passam a ser varridas.

## O que aconteceu

- **`utest.js <phase>`** (+45 linhas) — leitura rasa do `TEST.yaml` de `cwd`
  (`_declaredPhases`), `phaseArg` sai dos filtros, `phaseNames` filtrado.
- **`scan()` passa a receber `phase`** — o bug de origem: `scan(root, configPath)` sem 3º
  arg caía em `'unit'` e `.tuit`/`.integration.t.js` existiam no vocabulário e no config
  mas nenhuma chamada os alcançava.
- **Uma fase sem `include` E sem provider é ignorada** — para `boot:`/`exclude:` não
  virarem fase fantasma.

## Onde o PLAN errou

- **Consertou um bug silencioso de meses.** Fases declaradas no `TEST.yaml` que nunca
  eram varridas — nenhum erro, só ausência. É o tipo de defeito que o `sprint eval` do
  soml expôs ao precisar da fase `eval`.
- **Sem `.t.js`.** A resolução de fase (`_declaredPhases`, `phaseArg`, o filtro de
  `phaseNames`) mora no topo de `utest.js` sem nada travando — feature 4.3, 🟠.
- Commit pequeno, escopo limpo, mensagem clara (`+ argumento de phase`). Um dos poucos
  commits do repo que faz uma coisa só.

## O que fica aberto

| frente | estado |
|---|---|
| 4 report | 🟠 — seleção de fase sem teste |
| 3 scan | 🟡 — `scan()` agora respeita a fase |
