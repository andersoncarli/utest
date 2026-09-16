---
sprint: 27
date: 2026-09-16
features: [9.2]
thread: null
---
# 027 — ISSUES.md limpo: DONE em arquivo proprio, issues de outros projetos migradas

Intro: `ISSUES.md` do `utest` agora so lista defeitos do proprio `utest` — DONE saiu
para arquivo proprio, e 9 itens sobre `sprint-cli`/`iodb`/`fswatch` foram migrados
pros repos donos.

## Objetivo

Dois pedidos do usuario: (1) DONE do `ISSUES.md` em arquivo separado
(`ISSUES/DONE/_DONE.md`), nao inline; (2) issues sobre outros projetos fora do
`ISSUES.md` do `utest`.

## O que mudou

- **`ISSUES.md`**: secao DONE (10 entradas) movida inteira para
  [`ISSUES/DONE/_DONE.md`](../ISSUES/DONE/_DONE.md) — arquivo novo. `ISSUES.md`
  ficou so com TODO/DOING/BLOCKED e um pointer pro DONE. Nota do topo reescrita:
  "defeito de ferramenta vizinha mora no `ISSUES.md` dela" (mesma regra que o
  `iodb/ISSUES.md` ja tinha).
- **`sprint-cli/ISSUES/`**: 3 arquivos migrados com renumeracao sequencial (proximo
  livre era 006) — `006-report-021-sem-frontmatter.md` (era utest/ISSUES/009),
  `007-arvore-requests-open-divergem.md` (era utest/ISSUES/011),
  `008-utest-deveria-ser-a-autoridade-do-degrau-do-sprint.md` (era
  utest/ISSUES/013, com a secao de status atualizada — as 3 precondicoes que
  bloqueavam ja fecharam do lado do `utest`). 3 entradas novas no TODO de
  `sprint-cli/ISSUES.md`.
- **`iodb/ISSUES/`**: 2 arquivos migrados/criados (proximo livre era 008) —
  `008-iodb-flush-o-store.md` (era utest/ISSUES/002, com os links internos
  corrigidos pra nao referenciar um ISSUES/001 que so existe no `utest`) e
  `009-fswatch-config-contrato-e-doc.md` (novo — consolida os 5 achados
  `[fswatch]` que eram so linhas soltas no TODO do `utest`, sem forense propria:
  config POJO sem nome de dominio, import estatico de `bun:sqlite`, `private` sem
  `exports`, README/`baselineFirst` divergentes, `hash`/`content_changed` nunca
  emitidos). 2 entradas novas no TODO de `iodb/ISSUES.md`.
- **`utest/ISSUES.md`**: removidos os 4 itens migrados (009/011/013/002 + as 5
  linhas fswatch) e as 2 entradas que ja estavam duplicadas no `sprint-cli` (achado
  durante o levantamento — "sprint test/utest intercambiaveis" e "utest <N.F>
  resolve por numero" ja tinham copia identica la, so precisavam sumir daqui).
- **Links quebrados corrigidos** (autorizado pelo usuario a editar historico ja
  commitado — "a correcao e mais importante"): `plans/8-ledger/8.3-consumir-fswatch.md`
  e `plans/2-cache/2.8-*.md` (docs de feature vivos) tiveram a referencia a
  `ISSUES/002` trocada por `~/iodb/ISSUES/008-iodb-flush-o-store.md`;
  `plans/7-isolation/7.2-*.md` (frontmatter `files:` de sprint ja confirmado) teve
  as entradas `ISSUES/013-*.md`/`ISSUES/014-*.md` trocadas por `ISSUES/DONE/_DONE.md`
  (014 mudou de pasta, nao foi migrado; 013 saiu do repo); `sprints/020-fswatch.md`,
  `sprints/021-utest-sobre-iodb-fswatch.md` e `sprints/023-migrar-sprints-para-arquivo-unico.md`
  (historico de sprint, ja commitados) tiveram as referencias a `ISSUES/002` e
  `ISSUES/011` corrigidas para os novos locais.

## Verificacao

- `grep` por `ISSUES/002-iodb`, `ISSUES/009-report`, `ISSUES/011-arvore`,
  `ISSUES/013-utest` no repo inteiro: zero ocorrencias.
- `sprint-cli/ISSUES.md` e `iodb/ISSUES.md`: entradas novas presentes, arquivos
  fisicos no lugar certo, numeracao sequencial sem colisao.
- `utest .` / `utest . --force`: `✔630`, zero vermelho — reorganizacao de
  documentacao, nenhum codigo de producao tocado.
