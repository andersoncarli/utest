---
sprint: "020"
slug: "fswatch"
title: "consumir-fswatch"
features: ["8.3", "4.7"]
budget: null
state: "closed"
opened: "2026-09-11"
closed: "2026-09-11"
migrated: "0.2"
---

# 020 — consumir-fswatch

Plano do sprint 020 (feature 8.3). A arvore do projeto passa a poder vir do baseline persistente do sibling `iodb/fswatch`, com o `readdirSync` atual como fallback e baseline de comparacao, atras da mesma interface.

# PLAN

## Por que este sprint existe agora

`scanner.js#walk()` levanta a arvore do zero a cada `scan()`, sem estado entre execucoes.
O `iodb/fswatch` mantem esse ultimo estado conhecido, com identidade por `(dev, ino)` sobre
o mesmo ledger iodb que `ledger.js` (8.1) e `state.js` (8.2) ja consomem — por isso a
feature saiu da frente 9 e virou 8.3.

O compartilhamento e do arquivo de baseline no root de cada projeto, lido por `utest` e por
`sprint-cli` quando rodam sobre o mesmo root. Historicos de run seguem separados.

## Plano de materializacao

1. `fswatchSource.js` (novo) — import dinamico do sibling em `try/catch`, degradando para
   `null`; produz `{ tests, sources }`, a mesma forma que `walk()`.
2. `scanner.js` — `scan()` vira `async`, escolhe a fonte numa linha, e `sourceFiles` ganha
   `NON_TARGET_RE` (a absorcao da 4.7).
3. `utest.js` — um `await` no unico call site de producao.
4. `scanner.t.js` — o helper `run()` acompanha o `scan()` async.
5. `fswatchSource.t.js` (novo) — a prova de equivalencia entre os dois caminhos.

## Criterio de pronto

Os dois caminhos devolvem `testFiles`/`sourceFiles` identicos para a mesma arvore fixture;
a suite segue verde pelo fallback; apagar o baseline nao quebra nada.

# REPORT

Intro: a arvore do projeto pode vir do baseline do sibling `iodb/fswatch`, com identidade
por `(dev, ino)`, e o `readdirSync` atual fica como fallback atras da mesma interface;
no caminho, `.eval.js` e `.int.js` saem do denominador da cobertura (a 4.7, absorvida) e a
2.8 se revela ja resolvida pela 2.6.

## O que aconteceu

**Objetivo**

Absorver `iodb/fswatch` como fonte da arvore, e mover a feature da frente 9 (que ficou
vazia) para a frente 8, porque nao e um baseline de filesystem isolado: e a mesma memoria
permanente sobre iodb que 8.1 e 8.2 ja consomem.

**O que foi feito**

- **`fswatchSource.js`** (novo) — le o baseline e devolve `{ tests, sources }`, a mesma
  forma que `walk()`. Import dinamico do sibling em `try/catch`, degradando para `null`,
  o padrao ja repetido em `ledger.js`, `state.js` e `cacheLedger.js`.
- **`scanner.js`** — `scan()` virou `async` e escolhe a fonte numa linha, a mesma figura
  que `cache.js` usa para eleger o `judge`. A classificacao (`makeFilter`, `testRe()`,
  `SOURCE_RE`) e compartilhada pelos dois caminhos, nao reimplementada — e o que garante
  listas identicas.
- **`utest.js`** — um `await` no unico call site de producao.
- **`scanner.t.js`** — o helper `run()` acompanha o `scan()` async; 44 checks verdes.
- **`fswatchSource.t.js`** (novo) — 7 checks: equivalencia entre os caminhos, poda pelo
  exclude, o `.fswatch` fora da arvore que indexa, baseline ilegivel caindo no fallback.

## Onde o PLAN errou

1. **`.fswatch/PROJECT` nao existia como codigo** — era contrato confirmado, entidade nao
   materializada. Nenhum `.fswatch` existia em disco nesta maquina. Logo `utest` PRODUZ o
   baseline, nao so o le.
2. **O dominio nao sai de uma config POJO.** `normalizeConfig` ignora o nome do cluster:
   toda config POJO cai em `.fswatch/metadata` (fswatch.js:288), qualquer que seja a chave.
   `PROJECT` so sai de um YAML chamado `PROJECT.yaml`. Como o dominio e
   `<dir do yaml>/.fswatch/<nome>`, e o YAML mora em `.fswatch/` para nao sujar a raiz, o
   store acaba em `.fswatch/.fswatch/PROJECT`. O aninhamento e o preco de nao tocar no iodb
   a partir daqui.
3. **`path` e ausente, nao apenas opcional.** O contrato documenta `path` como "so presente
   quando produzido por `scan()`", mas medindo: ZERO de zero entries o trazem — o `Scanner`
   batch, que e o caminho do `scan()`, nao o preenche. O idiom do proprio contrato
   (`map(e => relative(root, e.path))`) daria `undefined` para todos os arquivos. O que
   sempre existe e `parent`, entao o caminho se reconstroi subindo a cadeia.

## Prova

- `bun utest.js fswatchSource.t.js` — 7 checks verdes.
- `bun utest.js scanner.t.js` — 44 checks verdes.
- `bun utest.js .` — suite verde, salvo as 7 falhas pre-existentes em `state.t.js` e
  `ledger.t.js`, identicas antes e depois (conferido com `git stash`).
- Apagar o baseline e rodar de novo: recria sem erro.

## A revisao de 2.8 e 4.7 a luz do fswatch

Ambas eram stubs do `sprint new`, sem um requisito escrito. Foram absorvidas:

- **4.7** virou `NON_TARGET_RE` em `scanner.js`, aplicado nos dois caminhos. O filtro e
  independente da fase de proposito: `testRe()` le o registry mutavel de `kinds.js`, que
  `resetRegistry()` zera entre fases, entao rodando `unit` o `.eval.js` nao estava
  registrado e escapava para `sourceFiles` — um roteiro de avaliacao cobrando um teste que
  nunca vai existir. A cobertura foi de 40% para 58%, e a lista de `--uncovered` agora so
  tem fonte de verdade.
- **2.8** foi revista e NAO e absorvida por esta feature. Rever o `cache.js` a luz do
  fswatch mostrou que o caso ja estava resolvido pela 2.6: a arbitragem cruzada do
  `results.json` promove a HIT o MISS cuja dessincronia e de relogio e nao de conteudo, e
  resolve rodando uma vez. Creditar a correcao ao `(dev, ino)` seria apoiar um degrau num
  caminho que esta atras de um opt-in desligado e que nenhuma execucao de producao toma. O
  ganho do fswatch aqui e futuro e de outra natureza: a identidade por inode DISPENSA a
  arbitragem em vez de corrigi-la. Fica registrado na 8.3, para quando o padrao trocar.

## A medicao que muda a premissa — leia antes de expandir o uso

Medido neste repo (186 arquivos de codigo, 1485 entries com tudo que a arvore tem):

| caminho | custo |
|---|---|
| `readdirSync` recursivo (o `walk()` atual) | **6ms** — 0.032ms por arquivo |
| fswatch, baseline frio (open+scan+close) | **10.0s** |
| fswatch, baseline JA existente | **10.2s** (open 1.8s + scan 4.9s + close 3.5s) |

Duas conclusoes, ambas desconfortaveis:

1. **E ~215x mais caro por entry** (6.9ms contra 0.032ms), e o custo e de ESCRITA no store
   iodb, nao de varredura. Confirmado escalando linear: 200 arquivos num tmpdir custam 1.5s.
2. **O baseline persistente nao ajuda — atrapalha.** A segunda execucao e a MAIS lenta das
   duas, porque abrir o store passa a custar 1.8s replicando o log. Nao ha caminho
   incremental: `scan()` reescreve tudo e `close()` faz flush de tudo, toda vez.

Ou seja: o ganho que o contrato promete ("reaproveitar a varredura entre `utest` e
`sprint-cli`") nao se realiza com o engine como esta hoje, porque a varredura nunca foi o
custo. Num projeto onde uma suite inteira roda em 5s, pagar 10s de indexacao para economizar
6ms de `readdir` e prejuizo de tres ordens de grandeza.

**Por isso o caminho fswatch fica atras de um opt-in desligado por padrao** (`{ fswatch: true }`),
e o `readdirSync` continua sendo o caminho de producao — nao como fallback temporario, mas
como o padrao ate que o iodb tenha escrita incremental (paged writes O(dirty) em vez de
O(store), o que o proprio README do iodb lista em "What's Not Here Yet"). A feature entrega
a COSTURA e a prova de equivalencia; a troca do padrao depende de trabalho no iodb.

### Investigado: DUAS causas isoladas, nao uma limitacao do desenho

A hipotese do usuario ("as chamadas de `in()` nao estao sendo buferizadas") estava certa, e
levou a duas causas distintas, ambas medidas e reportadas em `ISSUES.md`:

1. **`reconcile()` grava sem buffer.** `MetadataStore.put` tem default `flush: true`; o
   `Scanner` batch passa `{ flush: false }` nos dois call sites, mas `reconcile()` nao. Como
   o `scan()` publico chama `snapshot()`+`reconcile()`, o caminho caro e o caminho normal.
   300 arquivos: **4901ms -> 241ms (20x)** com a flag. Os 14 checks de `fswatch.t.js` seguem
   verdes com a correcao aplicada localmente (e revertida — o repo do iodb nao foi tocado).
   [ISSUES/001](../ISSUES/001-fswatch-reconcile-sem-buffer.md)
2. **`flush()`/`close()` do engine sao O(store).** Com a escrita ja buferizada, `in()` x300
   custa 4ms e persistir custa 1150ms. O custo por entry CAI conforme N cresce (5.17ms em
   300, 2.94ms em 1200) — assinatura de custo fixo por persistencia, nao proporcional ao
   delta. E o que o proprio README do iodb lista em "What's Not Here Yet".
   [ISSUES/002](../ISSUES/002-iodb-flush-o-store.md)

Corrigido o item 1, o total cai de ~10.2s para ~8.7s; o resto e o item 2 mais uma terceira
descoberta: o `scan()` publico **varre a arvore duas vezes**, porque `snapshot()` refaz o
`readdir` inteiro so para preencher o `path` que o `Scanner` nao preencheu
([ISSUES/003](../ISSUES/003-fswatch-scan-varre-duas-vezes.md) e
[004](../ISSUES/004-fswatch-path-ausente.md) — uma correcao resolve os dois).

### Corrigido no proprio iodb (autorizado: "utest e o primeiro cliente real")

As tres correcoes foram aplicadas em `iodb/fswatch/fswatch.js` e registradas em
`ISSUES.md` de ambos os repos:

| | antes | depois |
|---|---|---|
| indexar 400 arquivos | ~6500ms | **814ms** |
| `scan()` no repo do utest, baseline quente | ~13.5s | **1.5s** |
| suite do iodb | 50s | 27s |

O baseline quente passou a ser MAIS BARATO que o frio, que e como um baseline persistente
deveria se comportar — antes era o contrario.

Sobra o defeito [002](../ISSUES/002-iodb-flush-o-store.md): `flushPages()` re-renderiza a
projecao inteira a cada flush (a escrita ja e diffada; o re-render nao). Isolado: com 400
entries no store, acrescentar UM custa 86ms. Isso mexe no nucleo compartilhado por features
ja 🔵 e precisa de sprint proprio no iodb — por isso foi reportado, nao corrigido junto.

Enquanto ele nao cair, o `readdirSync` (51ms neste repo) segue sendo o PADRAO e o caminho
fswatch fica atras do opt-in. Mas a distancia caiu de 2200x para ~30x, e a costura ja esta
pronta.

Isto e evidencia para a frente 6 do iodb, nao critica ao desenho: o `(dev, ino)` e a
identidade certa, e a costura fica pronta para o dia em que escrever custar o que ler custa.

## Para o iodb — reportado, nao consertado

Conforme o nao-objetivo explicito de 8.1:

- `import { Database } from 'bun:sqlite'` estatico em `fswatch.js:6`, no mesmo arquivo do
  `MetadataStore` — impede carregar o modulo fora do Bun, qualquer que seja o backend.
- `private: true` sem campo `exports` — impede empacotar.
- O `path` ausente no caminho `Scanner` batch, contra o que o contrato documenta.
- Uma config POJO nao consegue nomear o dominio, o que torna `.fswatch/PROJECT` inalcancavel
  sem um arquivo YAML.
- **Escrita O(store) a cada `scan()`/`close()`** — 6.9ms por entry, ~215x o custo de um
  `readdirSync`, e um baseline existente nao barateia a proxima execucao (open passa a
  custar 1.8s). E o que hoje impede o fswatch de ser o caminho padrao de um runner.
- O espelho process-local do `MetadataStore` (defeito de leitura viva do iodb) impede um
  processo ver a escrita de outro sem reabrir. Nao bloqueia esta feature, cujo
  compartilhamento e por reabertura, mas limita qualquer uso ao vivo.
