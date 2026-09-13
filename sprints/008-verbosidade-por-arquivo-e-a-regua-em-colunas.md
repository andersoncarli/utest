---
sprint: "008"
slug: "verbosidade-por-arquivo-e-a-regua-em-colunas"
title: "verbosidade-por-arquivo-e-a-regua-em-colunas"
features: ["4.1", "3.5", "5.5"]
budget: null
state: "closed"
opened: "2026-09-04"
closed: "2026-09-04"
migrated: "0.2"
---

# 008 — verbosidade-por-arquivo-e-a-regua-em-colunas

Plano do sprint 008 (feature 4.1). Origem: os quatro itens de `docs/NOTES.md`, os retoques pedidos antes do deploy.

# PLAN

## Por que este sprint existe agora

Fechar os retoques de `docs/NOTES.md` — e, no caminho, consertar o que a investigação
de cada um revelou. O tema comum é que **o relatório mentia em três lugares**: a
verbosidade não mudava nada, a cobertura não podia ser diferente de 100%, e a régua não
media colunas de terminal.

## Plano de materializacao

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

## Criterio de pronto

- `./utest.js .` verde nos dois repos, e `bun utest/utest.js .` no soml sem regressão
  (mesmos vermelhos de antes: são falhas de produto do soml, não deste sprint).
- v1/v2/v3 visivelmente diferentes, cacheado e forçado.
- Nenhuma linha do relatório acima da largura, em qualquer largura.
- Todo defeito consertado com teste que FALHA contra o código velho.

# REPORT

Os quatro retoques de `docs/NOTES.md` antes do deploy. O `-v:2` vira a visão por ARQUIVO (a barra de título que só o `-v:3` alcançava), a cobertura passa a poder ser diferente de 100%, o `--trace` largo agrega por frente/feature, e a régua do relatório passa a medir COLUNAS de terminal em vez de unidades UTF-16.

## O que aconteceu

- **`viewer.js`** (+163/−~40) — `displayLen()` (conta por codepoint, cobra 2 nos
  intervalos largos: emoji, CJK); `dotfill` medindo por ele e TRUNCANDO em vez de
  estourar (`truncEnd` no código, `truncStart` no endereço — `…nome.eval.js:110` é o que
  identifica); `fileLine()` (a barra de título por arquivo, derivada do REGISTRO e não da
  árvore viva, para render igual quente e frio); `failData()` (o dado do check que vai
  para o storage) + `failLines()` redesenhando a partir dele; o ramo `verbosity === 2` do
  `fullView` reescrito para a visão por arquivo.
- **`utest.js`** (+122/−~25) — o bloco tight passa a ser a forma do `-v:1` só (era o
  bypass que tornava v1/v2/v3 idênticos em rodada verde); `-v:3` sem nada a rodar cai no
  `-v:2` em vez da linha seca; a fase sem entries fora do denominador do `coverage`;
  `--uncovered` imprimindo a lista; o `--trace` largo agregando por frente/feature.
- **`scanner.js`** (+9/−2) — `walk()` classificando por KIND (`testRe()`), não pelo
  include. Era o bug que fazia `sourceFiles` ficar vazio sob `include: '**/*.js'`.
- **`cache.js`** (+6/−2) — `failLines` no `record()` do `results.json`.
- **`TEST.yaml`** — `index.js`/`paths.js` no exclude de infra da fase `unit`.
- **`utest2.js` DELETADO** (−359) — cópia anterior do runner, 2º `bin`, zero refs; as
  menções em `viewer.js`/`kinds.js`/`package.json`/`docs/ONTOLOGY.md`/[3.5] foram junto.
- **7 testes novos** (`viewer.t.js` +6, `scanner.t.js` +1) — 320 → 347 checks. Cada um
  verificado FALHANDO contra o código velho antes de entrar.

### Frentes / features tocadas

| feature | efeito |
|---|---|
| 4.1 relatório compacto | ✅ a escada v1/v2/v3 passa a existir de fato; régua em colunas; `fileLine`/`displayLen`/`failData` cobertos → 🟡 |
| 3.5 cobertura | ✅ o MECANISMO fecha (classificação por kind, fase vazia fora da conta, exclude de infra, `--uncovered` imprime); a META (9 fontes sem `.t.js`) segue aberta → 🟠 |
| 5.5 roteamento --trace | ⚠️ escopo largo passa a agregar por frente/feature; o consumo no `utest.js` segue sem `.t.js` → 🟠 |

## Onde o PLAN errou

- **Três dos quatro itens do NOTES eram sintoma, não causa.** O `-v:2` "amarrado ao
  escopo" era o bloco tight ignorando `verbosity`; a cobertura "que não bate com o
  sprint" era `walk()` classificando por include e tornando 100% o único valor possível;
  a `-v:3` largo "sem saída" era o stream que não acontece quando tudo vem do cache. Ler
  o pedido literalmente teria consertado a fachada dos três.
- **Eu introduzi uma regressão no passo 1 e ela só apareceu no passo 5.** Gravar a linha
  JÁ RENDERIZADA no `results.json` resolvia o `-v:2` cacheado e congelava a largura do
  terminal daquele run — todo replay em outra largura saía errado. É o mesmo erro de
  categoria que o `box` do soml evita por invariante: **formatação é dado derivado, não
  vai para o storage**. Agora vai o dado (`failData`) e o render é na largura de agora.
- **O `coverage: 50%` é o primeiro número honesto que esse contador já deu.** Antes de
  hoje ele era estruturalmente incapaz de sair de 100% na fase `unit` — e ninguém notou,
  porque o 31% que aparecia vinha inteiro da fase `integration` vazia. Um número errado
  por dois motivos que se cancelavam em direções diferentes.
- **A dívida de teste do consumo no `utest.js` continua** (a mesma ressalva do sprint
  007, feature 5.5 🟠): `displayLen`/`fileLine`/`failLines` estão cobertos em
  `viewer.t.js`, mas o roteamento de verbosidade no `utest.js` — qual ramo de render
  roda, quando o `-v:3` cai no `-v:2` — só é exercitado rodando o soml à mão.
- **`--trace` largo é agregação, não instrumentação.** Ele lê o `lastMs` que o relatório
  já tem: não re-roda, não fura o cache, e por isso é o único trace que escopo largo pode
  pagar (o `--force` largo é o que o `docs/CRASH-LOG.md` do soml tirou do procedimento).

## O que fica aberto

### Achados fora do escopo (NÃO consertados — reportados)

- **`trace.t.js` é flaky sob carga**: `check(outer.selfMs < 22, …)` mede um sleep de
  ~12ms e estoura quando a suíte inteira roda junta (verde isolado, 3/3). Limiar de
  wall-clock num teste que divide CPU — merece sprint próprio, não um número ajustado.
- **No soml, 3 `.eval.js` divergem entre rodada forçada e cacheada** (45 vs 48
  vermelhos). Mesma categoria: falham sob carga/cache, passam limpos.
- **`shimmer.js`**: 0 refs, o irmão do `utest2.js` que sobrou — candidato a DELETE.
