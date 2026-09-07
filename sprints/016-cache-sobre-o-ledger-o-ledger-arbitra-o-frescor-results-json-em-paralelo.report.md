---
sprint: 16
date: 2026-09-06
features: [2.7, 2.6]
thread: null
---
# 016 — cache sobre o ledger — o ledger arbitra o frescor, results.json em paralelo

`cacheLedger.js` — o segundo árbitro do cache, ancorado no **conteúdo** (`sha256`) em vez do
inode (`mtime`), derivado da stream que o ledger já grava. As duas persistências rodam em
paralelo: o ledger arbitra, o `results.json` continua sendo escrito por inteiro.

## O que mudou

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

## O ganho, e a única divergência esperada

Os dois árbitros concordam sempre que o conteúdo muda junto com o mtime — que é o caso comum.
Discordam nos dois casos em que o mtime **mente**:

- `touch` sem editar — inode novo, bytes idênticos;
- `git checkout` / rebase — o git reescreve o arquivo com os mesmos bytes e mtime novo.

Nos dois o ledger diz `fresh` e o `results.json` diz stale, e o ledger está certo: trocar de
branch e voltar deixa de re-rodar a suíte inteira à toa. `cacheLedger.t.js` fixa essa
divergência como teste, porque é ela que justifica a convergência.

## Duas descobertas que custaram uma correção cada

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

## 2.6 foi absorvida, não adiada

A 2.6 (`results.json` arbitra o cache — segunda checagem sobre o mtime cravado) é a mesma
arbitragem com o outro árbitro. Este sprint montou o ponto de decisão único; o caminho
`results.json` **é** a 2.6, e passou a ser o **fallback** — o que roda quando não há
`../iodb`. Implementar os dois separadamente duplicaria a lógica de promoção só para
desmontá-la no sprint seguinte.

## Reportado ao `~/iodb` (peer, fora desta árvore)

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

## Evidência

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

## Fora de escopo (vira sprint próprio)

Remover o `results.json`; migrar o `depgraph.json`; a convergência final das duas
persistências numa só.
