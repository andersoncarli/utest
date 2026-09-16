# 024 — Plano: fechar 006, 007, 008, 012 — vazamento cross-arquivo e CLI posicional/trace

Plano do sprint 024 (feature 7.2, mais 1.3, 2.6, 2.7, 4.4, 4.5).

## Objetivo

Fechar 4 issues do `utest` (006, 007, 008, 012) que ISSUES.md tinha em TODO.
013 fica registrada mas não fecha por código — depende de 007+012 fecharem.

Duas causas raiz cobrem 3 das 4 issues:

- **Causa raiz A — vazamento de estado entre arquivos concorrentes
  (in-process)**: já documentada em [[7.2]] e parcialmente coberta por
  [[1.3]] (sealed cobre check tardio, não exceção tardia nem o array de
  checks/tests). `grand` (utest.js ~1124-1129) e `summary()` (viewer.js:384)
  somam sobre um agregado que vaza entre `page-cursor.t.js` e
  `tabular-table.t.js` (ISSUES/007). O mesmo padrão explica o sintoma 3 de
  ISSUES/012 (isolado vs. agregado divergem pro mesmo arquivo sem mudança de
  código).
- **Causa raiz B — cache/watch atrasados sem `--force`**: ISSUES/012
  sintomas 1-2. Pode ser efeito colateral de A (se o ledger lê um snapshot
  pisado por outro arquivo no mesmo processo) — investigar depois de corrigir
  A, antes de mexer em [[2.5]]/[[2.6]]/[[2.7]]/[[4.4]] isoladamente.

006 e 008 são bugs de CLI independentes, sem relação com A/B.

## Passos

1. **Causa raiz A (007 + 012 sintoma 3)**
   - Ler `utest.js` em torno de `grand`/exit code (~1124-1129) e
     `viewer.js:384` (`summary()`), e o ciclo de vida por-arquivo em
     `runner.js` ([[7.1]]/[[7.2]] in-process).
   - Confirmar se `checks`/`tests` é array compartilhado por referência entre
     arquivos rodando no mesmo processo (hipótese já registrada em [[7.2]]).
   - Corrigir isolando o agregado por arquivo antes de somar no `grand`.
   - Verify: `bun utest.js src/table --force --json` com múltiplos arquivos
     concorrentes não deve mais inflar `checks` de um arquivo com o de outro
     (reproduzir o caso de ISSUES/007 ou equivalente local).

2. **Causa raiz B (012 sintomas 1-2)** — depois do passo 1
   - Reproduzir: `utest . -w` editando um arquivo vs. `utest <arquivo>
     --force` em paralelo.
   - Se o passo 1 já resolveu: documentar no report que B era efeito
     colateral de A.
   - Se persistir: investigar a cadeia `[[2.5]]`/`[[2.6]]`/`[[2.7]]`
     (cache → results.json → ledger) e o delta do `--watch` ([[4.4]]).
   - Verify: watch e chamada direta concordam no mesmo instante, sem
     precisar de `--force` pra confiar no resultado.

3. **006 — `--trace` recusa arquivo fora de fase**
   - `utest.js:495` (`makeFilter(inc,exc).included(rel)`): quando `_isFile`
     é true e nenhuma fase casa, gerar entry sintético para o arquivo em vez
     de lista vazia (correção completa, não só trocar a mensagem).
   - Verify: `utest <arquivo>.eval.js --trace` sem fase `eval` declarada no
     `TEST.yaml` traça o arquivo.

4. **008 — segundo caminho posicional desaparece**
   - `utest.js:275` (`positional.find`) e `:290` (`positional.filter`):
     tratar todo posicional existente como filtro de path, não só o
     primeiro — opção 2 da issue. Avisar (não silenciar) posicional
     inexistente.
   - Verify: `utest caminhoA caminhoB` roda/filtra por ambos, sem descartar
     silenciosamente o segundo.

5. `sprint test` + verify_tests de 1.3, 2.6, 2.7, 4.4, 4.5, 7.2 → `sprint
   eval --sweep --dry` → `sprint eval <N.F> --yes` por feature tocada (🟢) →
   humano roda `sprint eval <N.F>` step-by-step (🔵).

6. Atualizar `ISSUES.md`: mover 006, 007, 008, 012 para DONE com resumo da
   correção; anotar 013 como dependente (sem fechar).

## Critério de pronto

- As 4 verificações acima (passos 1-4) passam.
- `sprint test` verde para as features tocadas.
- `ISSUES.md` atualizado.
- `sprint close` encena só os arquivos deste sprint — commit é do usuário.
