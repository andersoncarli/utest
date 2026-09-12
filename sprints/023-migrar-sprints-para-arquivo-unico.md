---
sprint: "023"
slug: migrar-sprints-para-arquivo-unico
title: "migrar os 22 sprints para o formato de arquivo unico"
features: ["90.1"]
budget: "40k-80k"
state: open
opened: "2026-09-12"
closed: null
---

# 023 — migrar os 22 sprints para o formato de arquivo unico

Os 21 pares `plan.md`+`report.md` do `utest` foram unidos em `NNN-slug.md`, e 146
secoes renomeadas para as ancoras canonicas. O `utest` passa a ser o **modelo zero**
do formato que o `sprint-cli` vai implementar na feature 70.80.

# PLAN

_Selado em 2026-09-12._ O REPORT contradiz, nao edita.

## O que foi pedido

- "vamos rever o sistema de storage de utest" — o pedido de origem, que derivou
  para o desenho do formato (ver [handoff](../handoffs/260912-023a-sprint-2.0.md))
- "o codmod pode comecar simples, basta unificar os aquivos em PLAN & REPORT. As
  secoes podem ficar livres ate assumir os tags esperados."
- "vamos usar esse codmod em utest. e ver o resultado."
- "deixando utest como o modelo zero do novo sprint"

## Por que este sprint existe agora

- O formato foi desenhado nesta sessao e precisa de **uma implementacao de
  referencia** antes de virar codigo no `sprint-cli`. Migrar o `utest` e o teste.
- As ferramentas (`tools/*.js` no `sprint-cli`) so se provam contra uma arvore real
  com historia. 22 sprints, 178 secoes, vocabulario inconsistente.
- A janela e boa: o `utest` nao tem sprint aberto competindo, e os pares seguem em
  disco como conferencia.

## Features que este sprint toca

- **[90.1]** — `plans/90-docs/90.1-adotar-o-formato-sprint-2-0-arquivo-unico.md` —
  dona da spec. O contrato do formato vive no `~/sprint-cli/docs/sprint-2.0/`.

## Plano de materializacao

**1. Unir os pares.** `sprint-codemod.js` gera `NNN-slug.md` com frontmatter,
abstract, `# PLAN` e `# REPORT`. Os `##` ficam com o titulo do autor.
`bun tools/sprint-codemod.js --apply`

**2. Normalizar por igualdade.** `sprint-normalize.js` renomeia so o que casa
exatamente com um sinonimo conhecido. 146 de 172.
`bun tools/sprint-normalize.js`

**3. Verificar que nada se perdeu.** Contagem de secoes do par contra o unificado,
sprint a sprint.
`for f in sprints/*.plan.md; do ...; done`

**4. Auditar.** `gaps()` contra o baseline: 40 intents, 32 linked, 8 orfas, 0 links
quebrados.
`bun tools/sprint-template.js gaps`

**5. Remover os pares.** Depois de conferir que cada `.plan.md`/`.report.md` tem seu
`NNN-slug.md` e que os 42 estao commitados — o git preserva a historia, entao a
remocao e reversivel. 42 removidos, 24 arquivos unicos restantes.
`git rm sprints/*.plan.md sprints/*.report.md`

## Riscos de execucao

- **Renomear falsifica historico.** Um mapa por sinonimo transformou "Objetivo" em
  "Por que este sprint existe agora" no 016. Igualdade renomeia sozinha; prefixo
  pede leitura.
- **`asked` nao se preenche.** Ausente em 21 de 22 — e a medida do que o formato
  antigo nunca pediu, nao lacuna a corrigir.
- **Remover os pares e irreversivel fora do git.** Conferir DUAS coisas antes: que
  todo par tem `NNN-slug.md` correspondente, e que os 42 estao commitados. Feito
  neste sprint; o `sprint-cli` mantem os seus ate a 70.80 fechar.
- **O tool nao ve o formato novo** e reservou 022 duas vezes. Contornado a mao;
  registrado em [ISSUES/011](../ISSUES/011-arvore-requests-open-divergem.md).

## Expectativa de budget

**40k-80k tokens.** Base: a migracao em si e mecanica; o custo esteve em descobrir
as armadilhas (mapa por metade, slug fora do ORDER, YAML octal).

## Criterio de pronto

- 22 sprints em `NNN-slug.md` com `migrated: "0.2"`, e nenhum `.plan.md`/`.report.md`
  restando em `sprints/`
- nenhuma secao perdida: contagem do par <= contagem do unificado
- `gaps()` com 0 links quebrados e `orphan_features` inalterado em 8
- `bun utest.js .` verde

# REPORT

_A preencher no close._

## O que aconteceu

A preencher.

## Onde o PLAN errou

A preencher.

## Budget: previsto vs real

| | tokens |
|---|---|
| previsto | 40k-80k |
| real | a preencher |

## Prova

A preencher.

## O que fica aberto

A preencher.
