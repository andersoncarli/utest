# 027 — Plano: ISSUES.md limpo — DONE em arquivo proprio, issues de outros projetos migradas

Plano do sprint 027 (feature 9.2).

## Objetivo

Dois pedidos do usuario sobre a organizacao do `ISSUES.md`:

1. A secao **DONE** do `ISSUES.md` deve morar em `ISSUES/DONE/_DONE.md`, nao inline
   no arquivo principal — `ISSUES.md` fica so o kanban ativo (TODO/DOING/BLOCKED).
2. Issues sobre **outros projetos** (`sprint-cli`, `iodb`/`fswatch`) que acumularam
   no `ISSUES.md` do `utest` devem ser migradas para o `ISSUES.md`/`ISSUES/` de cada
   projeto dono — o `utest/ISSUES.md` deve listar so defeitos do proprio `utest`.

## Levantamento

Mapeado o TODO do `utest/ISSUES.md` contra `sprint-cli/ISSUES.md` e `iodb/ISSUES.md`:

- 2 itens genericos (`sprint test`/`utest` intercambiaveis, `utest <N.F>` resolve por
  numero) **ja estavam duplicados** no `sprint-cli/ISSUES.md` de uma migracao
  anterior, sem terem sido removidos do `utest` — so remocao, nao migracao.
- ISSUES/009, /011, /013 (fisicos, sobre `sprint-cli`) **nao tinham equivalente** no
  destino — migrados de fato (arquivo forense + entrada no TODO do `sprint-cli`).
- ISSUES/002 (`iodb` flush O(store)) e 5 itens `[fswatch]` inline (sem arquivo
  proprio) **nao tinham equivalente** no `iodb/ISSUES.md` (que ja documenta a regra
  "defeito de ferramenta vizinha mora la, nao aqui") — migrados de fato.

## Passos

1. Migrar ISSUES/009 → `sprint-cli/ISSUES/006-*.md`, ISSUES/011 →
   `sprint-cli/ISSUES/007-*.md`, ISSUES/013 → `sprint-cli/ISSUES/008-*.md`
   (proximos numeros livres la); entrada nova no TODO do `sprint-cli/ISSUES.md`;
   apagar os 3 fisicos do lado do `utest`.
2. Migrar ISSUES/002 → `iodb/ISSUES/008-*.md`; os 5 itens `[fswatch]` inline →
   `iodb/ISSUES/009-fswatch-config-contrato-e-doc.md` (arquivo consolidado, sem
   forense propria antes); entradas novas no TODO do `iodb/ISSUES.md`; apagar o
   fisico e as 5 linhas do lado do `utest`.
3. Remover as 2 entradas ja duplicadas do `utest/ISSUES.md` (sem migrar, so limpar).
4. `ISSUES.md` — mover a secao DONE inteira para `ISSUES/DONE/_DONE.md` (arquivo
   novo); `ISSUES.md` fica so com TODO/DOING/BLOCKED e um pointer pro DONE.
5. Corrigir links quebrados pelos itens migrados (autorizado pelo usuario a editar
   historico ja commitado quando a correcao vale mais que a imutabilidade):
   `plans/8-ledger/8.3-*.md`, `plans/2-cache/2.8-*.md` (docs de feature vivos),
   `plans/7-isolation/7.2-*.md` (frontmatter `files:` de sprint confirmado),
   `sprints/020-*.md`, `sprints/021-*.md`, `sprints/023-*.md` (historico de sprint).

## Verificacao

- Nenhum link `ISSUES/002-iodb`, `ISSUES/009-report`, `ISSUES/011-arvore`,
  `ISSUES/013-utest` sobrevive no repo (`grep` limpo).
- `sprint-cli/ISSUES.md` e `iodb/ISSUES.md` com as entradas novas, arquivos fisicos
  no lugar certo.
- `utest .` / `utest . --force`: `✔630`, zero vermelho — reorganizacao de docs nao
  toca codigo de producao.

## Criterio de pronto

`ISSUES.md` do `utest` so com itens do proprio `utest` em TODO/DOING/BLOCKED, DONE
em arquivo separado; nenhum link quebrado; suite propria inalterada.
