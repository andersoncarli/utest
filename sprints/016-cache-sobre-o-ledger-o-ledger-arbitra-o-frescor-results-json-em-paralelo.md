---
sprint: "016"
slug: "cache-sobre-o-ledger-o-ledger-arbitra-o-frescor-results-json-em-paralelo"
title: "cache sobre o ledger — o ledger arbitra o frescor, results.json em paralelo"
features: ["2.7", "2.6"]
budget: null
state: "closed"
opened: "2026-09-06"
closed: "2026-09-06"
migrated: "0.2"
---

# 016 — cache sobre o ledger — o ledger arbitra o frescor, results.json em paralelo

Plano do sprint 016 (feature 2.7).

# PLAN

## Por que este sprint existe agora

**Objetivo**

Fazer o **ledger responder "este teste está fresco?"** — a pergunta que hoje é do
`results.json` — sem desmontar nada do que existe. As duas persistências rodam **em
paralelo**: o `results.json` continua sendo escrito integralmente (compatibilidade, índice
de `utest 3.2`, `failLines` do render), e o ledger passa a ser quem **arbitra**. A
convergência — remover um dos dois — é sprint futuro, e só acontece depois que esta feature
provar que os dois concordam.

O 8.1 fechou dizendo "nenhum dos dois lê o outro NESTA feature". Esta é a feature onde eles
passam a se falar, e a direção da seta é: cache lê ledger.

**A tese**

O `results.json` e o ledger respondem a mesma pergunta com garantias diferentes:

| | `results.json` | ledger |
|---|---|---|
| forma | snapshot mutável, reescrito por fase | log append-only encadeado |
| ancoragem | `mtime` (o inode) | `sha256` (o conteúdo) |
| adulteração | invisível | `verify()` localiza (`failedAt`) |
| perda | custa uma rodada fria | custa a história |

O `mtime` responde *rápido*; o `sha256` responde *certo*. Um `touch` sem edição derruba o
mtime e força uma rodada que o conteúdo provaria desnecessária; um checkout que devolve
bytes idênticos com mtime novo, idem. O ledger arbitra melhor porque sabe **o que o arquivo
era**, não só **quando o inode mudou**.

## Plano de materializacao

1. **`cacheLedger.js`** (arquivo novo). `openCacheLedger(root, { enabled, phase })` →
   `{ get, record, fresh, flush, verify, enabled }` — a **mesma forma** que o objeto
   `results` interno do `cache.js` já expõe (`cache.js:169`), para que o `TestCache` troque
   um pelo outro sem saber a diferença. Abre o mesmo storage do `ledger.js`
   (`.utest/ledger`) por `openLedger`, projetando os `test:result` da stream num índice
   `{ relpath → último registro }`. Degrada para no-op com `enabled === false` ou sem
   `../iodb`, e nesse caso `enabled` volta `false` — o sinal que o `TestCache` usa para
   ficar no mtime.

2. **`fresh()` ancorado no conteúdo.** Onde `results.fresh` compara `mtime` e `depsNewest`,
   o ledger compara o `sha256` do `fileSet` do último `run:start` que incluiu o arquivo,
   mais o sha256 do alvo pareado. Mesma assinatura de `results.fresh(phase, p, extraDeps,
   targetPath)` → `boolean`, para caber no `arbitrate` existente sem reescrevê-lo.

3. **`TestCache(root, { ledger })`** — segundo parâmetro opcional. Quando
   `ledger?.enabled`, `arbitrate` (`cache.js:461`) consulta o ledger; senão, o
   `results.json` como hoje. `results.record` continua rodando **sempre**, nos dois casos —
   é o "escrito em paralelo" do requisito. Nenhuma assinatura pública muda: quem chama
   `TestCache(root)` sem opts tem o comportamento de hoje, byte por byte.

4. **`utest.js` — ordem de abertura.** Hoje `openLedger` roda na linha 481, **depois** dos
   `cache.read` das linhas 437/453. Para o ledger arbitrar ele precisa estar aberto antes.
   Mover a abertura para antes da montagem das entries e passar o handle ao `TestCache`.
   Cuidado: `ledger.start(entries)` continua onde está — só a *abertura* sobe.

5. **`cacheLedger.t.js`** — cobre: projeção do índice a partir da stream; `fresh()` verde
   quando o sha256 bate; vermelho quando o conteúdo muda; **verde quando só o mtime mudou e
   o conteúdo não** (o ganho sobre o `results.json`, e a única divergência esperada entre os
   dois árbitros); no-op sem `../iodb`; e o cross-check de que ledger e `results.json`
   concordam em todo caso onde o conteúdo mudou junto com o mtime.

## Riscos de execucao

**O side effect que não pode mudar**

O critério duro da frente 2 é o portão desta feature: **quente e frio reportam o MESMO
número** (320 na suíte própria). O ledger arbitrando não pode mover esse número em nenhum
sentido — nem para mais (promoveu o que não devia) nem para menos (deixou de promover).
`utest .` duas vezes, mesmo total, é o aceite.

E a degradação continua sendo lei: **sem `../iodb`, a arbitragem cai de volta no mtime** e o
utest roda exatamente como hoje. Um runner não fica refém do seu log — a regra do 8.1 vale
igual aqui.

**Fora de escopo (vira sprint próprio)**

Remover o `results.json`; migrar o `depgraph.json`; a convergência final das duas
persistências numa só.

## Criterio de pronto

- `utest .` verde no `~/utest`, duas rodadas seguidas com o **mesmo número de checks**
  (quente == frio) — o portão da frente 2, com o ledger arbitrando;
- depois de uma rodada, o índice do ledger responde `fresh()` para os arquivos que não
  mudaram, e `.utest/results.json` continua existindo e atualizado (paralelo, não substituído);
- editar um arquivo (conteúdo) → `fresh()` falso nos dois árbitros;
- `touch` sem editar → `fresh()` **verde no ledger**, falso no `results.json`; a divergência
  é registrada e esperada, e é o que motiva a convergência;
- `ledger.verify().valid === true` depois de tudo;
- renomear/remover `../iodb` → `utest .` roda como hoje, mesmo número, sem erro.

### 2.6 é absorvida, não adiada

A 2.6 (`results.json` arbitra o cache — segunda checagem sobre o mtime cravado) **não fica
pendurada**: ela é a mesma arbitragem com o outro árbitro, e este sprint a constrói por
consequência. O passo 3 monta o ponto de decisão único em `arbitrate`; o caminho
`results.json` É a 2.6, e passa a ser o **fallback** — o que roda quando não há `../iodb`.
Implementar os dois árbitros separadamente duplicaria a lógica de promoção só para
desmontá-la depois.

Ao fechar: `sprint eval 2.6` junto de 2.7, com a mesma evidência (o critério de 2.6 — o
MISS de tempo promovido pela segunda checagem — é exercitado pelo caminho de fallback dos
testes deste sprint).

# REPORT

`cacheLedger.js` — o segundo árbitro do cache, ancorado no **conteúdo** (`sha256`) em vez do
inode (`mtime`), derivado da stream que o ledger já grava. As duas persistências rodam em
paralelo: o ledger arbitra, o `results.json` continua sendo escrito por inteiro.

## O que aconteceu

**`cacheLedger.js` (novo).** `openCacheLedger(root, opts)` devolve a **mesma forma** que o
objeto `results` interno do `cache.js` já expunha — `get`/`fresh`/`record`/`flush` —, mais um
`enabled`. É essa igualdade de forma que deixa o `TestCache` trocar um pelo outro sem saber a
diferença: o `arbitrate` não sabe qual dos dois está respondendo, e não precisa saber.

A projeção é feita **na abertura**, uma passada só: os `run:start` dão o `sha256` de cada
arquivo do conjunto, os `run:tests` dão o veredito de cada teste, e o mais recente vence. É a
propriedade que o `_front.md` da frente 8 nomeia — o estado presente é derivado do histórico,
nunca mantido em paralelo a ele.

**`cache.js`.** `TestCache(root, { ledger })`. Um `judge` — o ledger quando há um, o
`results.json` quando não —, e o `arbitrate` (que já existia) passa a consultá-lo em vez de
falar direto com o `results`. `results.record` continua rodando **sempre**, nos dois casos.
`TestCache(root)` sem opts é idêntico a antes, byte por byte.

**`ledger.js`.** Ganhou `state()` (o histórico projetado — com `reduce: append`, o estado
reduzido do iodb já É o array de eventos) e `test()` passou a carregar `phase`, `target` e
`deps` no registro.

**`utest.js` / `scanner.js`.** A abertura do ledger subiu para **antes** das entries — quem
arbitra o frescor precisa estar aberto quando o primeiro `cache.read` acontece. E o conjunto
assinado pelo `run:start` passou a incluir alvos e deps, não só os arquivos de teste: é o
sha256 deles que ancora o `fresh()`.

### 2.6 foi absorvida, não adiada

A 2.6 (`results.json` arbitra o cache — segunda checagem sobre o mtime cravado) é a mesma
arbitragem com o outro árbitro. Este sprint montou o ponto de decisão único; o caminho
`results.json` **é** a 2.6, e passou a ser o **fallback** — o que roda quando não há
`../iodb`. Implementar os dois separadamente duplicaria a lógica de promoção só para
desmontá-la no sprint seguinte.

## Onde o PLAN errou

**1. Hashear no caminho quente derruba a rodada.** A primeira versão calculava o `sha256` do
teste, do alvo e das deps dentro de cada `test:result`. O `io.in()` segura o lock do storage
durante o flush, e isso estourou o `Lock timeout (1000ms)` do iodb com os workers em paralelo
— o runner morrendo pelo próprio log, exatamente o que a regra de custo zero do 8.1 proíbe. A
âncora do conteúdo é a mesma; o lugar dela é o evento **agregado** (`run:start`), uma vez por
rodada.

**2. Um evento por teste também não escala.** Mesmo sem os hashes, um `io.in()` por
`test:result` é uma disputa de lock por teste sobre um arquivo que cresce a cada rodada. Os
resultados passaram a ser bufferizados num `run:tests` agregado, escrito uma vez no `end()` —
o mesmo movimento que o `run:start` já fazia com o `fileSet`. A cadeia não enfraquece: mesmos
eventos, mesma ordem, mesmo encadeamento.

O padrão por trás das duas: **a granularidade do registro segue a granularidade do que se
pergunta a ele, não a do laço que o produziu.**

## Prova

- `utest .` no `~/utest`: **559 checks, 198 testes, 12 arquivos, verde**, com o ledger
  arbitrando (baseline antes do sprint: 492 checks — os +67 são o `cacheLedger.t.js`);
- **quente e frio reportam o MESMO número** (559 = 559), o portão da frente 2, em rodadas
  seguidas sem lock timeout;
- o `touch` medido: **6.79s sem, 6.84s depois de tocar três `.t.js`** — os arquivos tocados
  não re-rodaram, que é o ganho da feature em números;
- `sprint eval 2.7 --yes`: **4 passos sandbox, todos verdes** → 🟢 avaliada. Os passos rodam
  contra o `../iodb` real, montando um projeto de verdade e rodando `utest` nele duas vezes;
- `.utest/results.json` continua existindo e atualizado depois de cada rodada — as duas
  persistências em paralelo;
- editar um arquivo → stale nos dois árbitros; `touch` sem editar → fresh no ledger, stale no
  `results.json` (a divergência esperada, fixada em teste);
- sem `../iodb`, `enabled` volta `false` e `TestCache(...).judge` volta `'results.json'` — o
  comportamento de sempre.

### O ganho, e a única divergência esperada

Os dois árbitros concordam sempre que o conteúdo muda junto com o mtime — que é o caso comum.
Discordam nos dois casos em que o mtime **mente**:

- `touch` sem editar — inode novo, bytes idênticos;
- `git checkout` / rebase — o git reescreve o arquivo com os mesmos bytes e mtime novo.

Nos dois o ledger diz `fresh` e o `results.json` diz stale, e o ledger está certo: trocar de
branch e voltar deixa de re-rodar a suíte inteira à toa. `cacheLedger.t.js` fixa essa
divergência como teste, porque é ela que justifica a convergência.

## O que fica aberto

### Reportado ao `~/iodb` (peer, fora desta árvore)

O `acquireLock` tem um timeout **fixo** de 1000ms sobre um `flush` que reescreve o arquivo
inteiro — um custo que **cresce com o store**. Um storage que funciona hoje passa a estourar
sozinho ao crescer, de forma intermitente (só morde quando um writer de fato espera), o que
lê como teste flaky em vez de limite atingido. Correção aplicada: o timeout passa a escalar
com o tamanho do arquivo, piso de 1000ms.

Tentativa **revertida**, e vale registrar: pausar o spin entre tentativas (`Atomics.wait`)
parecia o conserto companheiro óbvio. O wait é síncrono, bloqueia a thread inteira, e quando
a disputa é entre writers dentro de UM processo o waiter adormecido está bloqueando
justamente o trabalho que ele espera. Está comentado no código para não ser retentado.

**Achado de segunda ordem, e o mais acionável dos dois: a suíte do `~/iodb` não é
determinística sob paralelismo.** Foi o que quase me fez atribuir uma regressão ao meu
próprio patch. Rodadas **alternadas** (base, fix, base, fix, base, fix) do mesmo par de códigos:

| | r1 | r2 | r3 | média |
|---|---|---|---|---|
| baseline (`HEAD`) | ✘13 | ✘1 | ✘3 | 5.7 |
| com o fix | ✘10 | ✘3 | ✘6 | 6.3 |

A variação **dentro** de cada linha (1 a 13) é muito maior que a diferença **entre** as
médias (5.7 vs 6.3) — o que significa que a suíte não consegue, hoje, distinguir um patch
bom de um ruim. Uma medição isolada dali não é evidência de nada, e eu tratei uma como se
fosse: cheguei a registrar "meu conserto piorou o iodb, 4 → 10" antes de rodar o pareado,
e o número era ruído. É o mesmo tipo de armadilha que o `_front.md` da frente 8 descreve na sessão de
2026-09-06: um motor discordando de si mesmo entre duas invocações. Vale um sprint próprio
no `~/iodb` — provavelmente fixtures compartilhando o mesmo storage entre arquivos de teste.

### Fora de escopo (vira sprint próprio)

Remover o `results.json`; migrar o `depgraph.json`; a convergência final das duas
persistências numa só.
