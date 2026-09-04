# 008 — Plano: verbosidade-por-arquivo-e-a-regua-em-colunas

Plano do sprint 008 (feature 4.1). Origem: os quatro itens de `docs/NOTES.md`, os
retoques pedidos antes do deploy.

## Objetivo

Fechar os retoques de `docs/NOTES.md` — e, no caminho, consertar o que a investigação
de cada um revelou. O tema comum é que **o relatório mentia em três lugares**: a
verbosidade não mudava nada, a cobertura não podia ser diferente de 100%, e a régua não
media colunas de terminal.

## Passos

### 1. `-v:2` / `-v:3` devolviam o mesmo que `-v:1` [4.1]

Duas causas independentes:

a. Um arquivo vindo do CACHE empurra `checks: []` / `tests: []` — o bloco de erro do
   `-v:2` não tinha o que renderizar e caía calado no `-v:1`. → o `results.json` passa a
   gravar o DADO do check (`failData`), e `failLines` redesenha a partir dele.

b. A causa maior: numa rodada VERDE o render nem passava pelo `fullView` — o bloco
   "tight" imprime três linhas e ignora `verbosity`. Com a suíte limpa (o caso do
   `utest/` inteiro) v1/v2/v3 eram idênticos. → o tight passa a ser a forma do `-v:1` só.

E o `-v:2` deixa de ser "o v1 mais o erro": vira a **visão por ARQUIVO** que já existia
em `view()` e só o `-v:3` alcançava (`fileLine`, a barra de título por arquivo).

**verify**: `./utest.js . -v1`, `-v2`, `-v3` — três saídas diferentes, sem `--force`.

### 2. `utest2.js` [—]

Cópia anterior do runner, sem `kinds`/`results`/`--trace`, 2º `bin`, zero refs de código;
já marcado DELETE em `docs/ONTOLOGY.md` e no plano de [3.5]. → deletar, e limpar as
menções em `viewer.js` (`/utest2?\.js/`), `kinds.js`, `package.json`, docs.

**verify**: `grep -rn utest2` volta vazio; a suíte segue verde.

### 3. `coverage: N%` não batia com `sprint fronts` [3.5]

Dois bugs sob um sintoma:

a. A fase `integration` (zero entries) jogava todas as fontes do repo no denominador
   DELA. → uma fase sem nenhum teste não entra na conta.

b. `walk()` mandava para `tests` tudo que o `include` casava. Com `include: '**/*.js'` a
   FONTE ia para lá, era filtrada por `isTest` depois, e sumia das DUAS listas —
   `sourceFiles` vazio, `uncovered` sempre zero, **cobertura sempre 100%**. → quem decide
   se é teste é o KIND (`testRe()`), não o include.

Mais: `index.js`/`paths.js` viram exclude de infra, e `--uncovered` (lido em `utest.js`,
nunca impresso) passa a imprimir a lista.

**verify**: `./utest.js . -u` — 50%, e os 9 arquivos batendo com a tabela de leaks de [3.5].

### 4. `--trace` largo [5.5]

Recusava escopo largo e mandava filtrar. → escopo largo agrega por FRENTE e FEATURE o
`lastMs` que o relatório já tem (não instrumenta, não re-roda, não fura o cache); escopo
filtrado segue dissecando por chamada. Frente <1% da parede vai para uma linha de resto;
repo PLANO (uma frente só) avisa e manda para o `-v:2`.

**verify**: no soml, `bun utest/utest.js . --trace` → `plans/5-apps 44%`, `5.32 14%`.

### 5. A régua em COLUNAS [4.1]

Reportado ao ver as barras passando da largura do terminal. Três defeitos:

a. `fileLine` media contra `width` cheio, mas o chamador indenta 2 tudo que vem sob a
   linha-título → 82 colunas contra régua de 80.

b. `dotfill` media com `.length` (unidades UTF-16), não colunas de tela. → `displayLen()`,
   que conta por codepoint e cobra 2 nos intervalos largos (emoji, CJK).

c. **Regressão introduzida no passo 1**: gravar a linha PRONTA no `results.json` congela
   a largura do terminal daquele run — todo replay cacheado saía errado. → grava o dado
   (`failData`), renderiza na largura de agora.

E `dotfill` passa a TRUNCAR em vez de estourar: o código corta no fim, o endereço corta no
começo (`…nome.eval.js:110` é o que identifica).

**verify**: varredura de largura (60/80/100/140/200) nos dois repos, zero linhas acima da
régua.

## Critério de pronto

- `./utest.js .` verde nos dois repos, e `bun utest/utest.js .` no soml sem regressão
  (mesmos vermelhos de antes: são falhas de produto do soml, não deste sprint).
- v1/v2/v3 visivelmente diferentes, cacheado e forçado.
- Nenhuma linha do relatório acima da largura, em qualquer largura.
- Todo defeito consertado com teste que FALHA contra o código velho.
