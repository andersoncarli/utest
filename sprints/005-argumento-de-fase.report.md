---
sprint: 5
date: 2026-09-03
features: [4.3, 3.1]
---
# Sprint 005 — report

Sprint retroativo. utest <phase> seleciona uma fase só; scan() finalmente recebe o 3º argumento e as fases do TEST.yaml passam a ser varridas.

## O que entregou

- **`utest.js <phase>`** (+45 linhas) — leitura rasa do `TEST.yaml` de `cwd`
  (`_declaredPhases`), `phaseArg` sai dos filtros, `phaseNames` filtrado.
- **`scan()` passa a receber `phase`** — o bug de origem: `scan(root, configPath)` sem 3º
  arg caía em `'unit'` e `.tuit`/`.integration.t.js` existiam no vocabulário e no config
  mas nenhuma chamada os alcançava.
- **Uma fase sem `include` E sem provider é ignorada** — para `boot:`/`exclude:` não
  virarem fase fantasma.

## Visão crítica

- **Consertou um bug silencioso de meses.** Fases declaradas no `TEST.yaml` que nunca
  eram varridas — nenhum erro, só ausência. É o tipo de defeito que o `sprint eval` do
  soml expôs ao precisar da fase `eval`.
- **Sem `.t.js`.** A resolução de fase (`_declaredPhases`, `phaseArg`, o filtro de
  `phaseNames`) mora no topo de `utest.js` sem nada travando — feature 4.3, 🟠.
- Commit pequeno, escopo limpo, mensagem clara (`+ argumento de phase`). Um dos poucos
  commits do repo que faz uma coisa só.

## Estado das frentes ao fim da janela

| frente | estado |
|---|---|
| 4 report | 🟠 — seleção de fase sem teste |
| 3 scan | 🟡 — `scan()` agora respeita a fase |
