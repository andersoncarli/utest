---
sprint: "023"
slug: migrar-sprints-para-arquivo-unico
title: "migrar os 22 sprints para o formato de arquivo unico"
features: ["9.1"]
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

- **[9.1]** — `plans/9-docs/9.1-adotar-o-formato-sprint-2-0-arquivo-unico.md` —
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
  registrado em `~/sprint-cli/ISSUES/007-arvore-requests-open-divergem.md`.

## Expectativa de budget

**40k-80k tokens.** Base: a migracao em si e mecanica; o custo esteve em descobrir
as armadilhas (mapa por metade, slug fora do ORDER, YAML octal).

## Criterio de pronto

- 22 sprints em `NNN-slug.md` com `migrated: "0.2"`, e nenhum `.plan.md`/`.report.md`
  restando em `sprints/`
- nenhuma secao perdida: contagem do par <= contagem do unificado
- `gaps()` com 0 links quebrados e `orphan_features` inalterado em 8
- `utest .` verde

# REPORT

## O que aconteceu

Os 5 passos do plano rodaram no commit `83c7ef0`: `sprint-codemod.js --apply` uniu os
21 pares em `NNN-slug.md` (o 001 nao tinha par — sempre foi so plano, sem report
separado — o que fecha em 22 sprints unificados, nao 21), `sprint-normalize.js`
renomeou as secoes por igualdade, os pares foram removidos com `git rm` (42 arquivos,
confirmado no diff do commit), e o `023` nasceu direto em arquivo unico como o
`sprint-cli` ja pedia. `utest` ficou como o modelo zero: 23 arquivos em `sprints/`,
todos `NNN-slug.md`, nenhum par `.plan.md`/`.report.md` remanescente daquela leva.

## Onde o PLAN errou

- O passo 4 (`gaps()` do `sprint-template.js`) nao roda contra a arvore v1 do `utest`
  sem passar `{plansDir:'plans', sprintsDir:'sprints'}` — a raiz default do tool e
  `.sprint/plans`+`.sprint/sprints` (formato v2). Rodando com o override, `gaps()`
  reporta **100% das ancoras como faltando**, inclusive em sprints com as 7 secoes do
  PLAN visivelmente preenchidas — falso-positivo. Causa raiz: `anchor()` em
  `sprint-template.js` busca o titulo normalizado como CHAVE do dicionario `ANCHOR`
  (que esta montado `chave_canonica: titulo_em_prosa`, nao o inverso), entao o lookup
  nunca casa e tudo cai no slug derivado. Reportado como
  `~/sprint-cli/ISSUES/009-anchor-lookup-invertido.md` — nao consertado aqui, o
  codigo mora noutro projeto.
- `sprint-normalize.js` tambem tem uma colisao: `TITLE.budget` e uma unica entrada
  global, mas `budget` e slug tanto do PLAN ("Expectativa de budget") quanto do
  REPORT ("Budget: previsto vs real") com textos diferentes por contrato. Rodar
  `normalize({apply:true})` no `023` regravaria a secao de budget do REPORT com o
  titulo do PLAN. Descoberto em dry-run antes de aplicar; o arquivo em disco ja tinha
  os titulos corretos (normalizado a mao antes desta feature ser fechada), entao o
  `apply` nao foi executado. Reportado como
  `~/sprint-cli/ISSUES/010-normalize-budget-colide-plan-report.md`.
- O criterio de pronto fala em "nenhum `.plan.md`/`.report.md` restando em
  `sprints/`" sem qualificar "daquela leva" — hoje ha 5 pares novos (024-028),
  criados DEPOIS do 023, porque o `sprint` do `utest` ainda gera par por padrao. Isso
  nao e regressao da 9.1: e trabalho futuro (o `sprint-cli` adotar arquivo unico por
  padrao na feature 70.80, citada no plano).

## Budget: previsto vs real

| | tokens |
|---|---|
| previsto | 40k-80k |
| real | ver ledger do agente — nao medido nesta sessao de fechamento |

## Prova

- `git show 83c7ef0 --stat`: 42 arquivos `.plan.md`/`.report.md` removidos, 23
  arquivos `NNN-slug.md` presentes em `sprints/`.
- `bun sprint-normalize.js` em dry-run sobre os 23 arquivos: 137 secoes classificadas
  por igualdade exata, 0 secoes livres (`kept: []`) — nenhum titulo fora do
  vocabulario canonico.
- `sprint test`: 630 checks verdes, coverage 57% — `utest .` verde conforme o
  criterio pedia.
- `docs:check` roda e aponta 2 problemas, ambos na feature 9.2 (nao 9.1): state
  confirmed sem `verify_confirmed`/`confirmed_at`. Fora do escopo desta feature,
  nao investigado a fundo aqui.

## O que fica aberto

- Normalizar as ~26 secoes livres que sobraram fora dos 23 sprints originais (os
  pares 024-028, ainda no formato antigo) — mencionado no board como proxima acao
  apos fechar este sprint. Depende de o `sprint` do `utest` (nao o `sprint-cli`)
  gerar arquivo unico, ou de rodar o codemod manualmente sobre esses 5 pares.
- Os dois bugs de dicionario invertido/colidido no `sprint-cli`
  ([[009]]/[[010]] nas ISSUES de la) — fora do escopo de quem achou, quem mantem o
  `sprint-cli` decide quando consertar.
- 9.2 com `docs:check` vermelho (`verify_confirmed`/`confirmed_at` ausentes) — reportado
  aqui, nao consertado, por ser outra feature.
