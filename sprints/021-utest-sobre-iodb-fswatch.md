---
sprint: "021"
slug: "utest-sobre-iodb-fswatch"
title: "utest se apoia em iodb/fswatch, e mantem o fallback"
features: []
budget: null
state: "closed"
opened: null
closed: null
migrated: "0.2"
---

# 021 — utest se apoia em iodb/fswatch, e mantem o fallback

Milestone. Features **8.1** (ledger append-only), **8.2** (`.utest/STATE`) e **8.3** (`scanner.js` sobre o baseline do fswatch).

# PLAN

## Por que este sprint existe agora

O `utest` passa a se apoiar no sibling `iodb/fswatch` para as tres coisas que um runner
precisa lembrar entre rodadas — o log do que aconteceu (8.1), o estado do ultimo scan (8.2)
e a arvore de arquivos (8.3) — **sem ficar refem dele**. O `readdirSync` e o `results.json`
continuam vivos como fallback e como baseline de comparacao, atras da mesma interface.

O que o iodb traz e encadeamento criptografico sobre puro texto: cada registro carrega a
chave progressiva da cadeia (`key = sha64(payload) XOR sha64(prevKey)`), entao adulterar um
registro no meio invalida tudo dali pra frente — e isso e verificavel (`io.verify()`). E JS
sobre texto contra C++ sobre binario: **e esperado que seja igual ou um pouco mais lento que
o sqlite**. A troca e deliberada — auditabilidade e um formato legivel por humanos, em vez
de velocidade bruta.

## Plano de materializacao

### 1. O import quebrado (8.1 / 8.2) — a suite volta ao verde

`ledger.js:33` e `state.js:31` pediam `'../iodb/io-engine.js'`; o modulo mora em
`'../iodb/src/io-engine.js'`. O `catch` do degrade engoliu o `ERR_MODULE_NOT_FOUND` em
silencio e tudo rodou sobre o `noop()`. Nao e regressao do 022: o caminho nasceu errado no
commit original da 8.1 (`b9b0b66`), nove commits atras.

verify: `bun utest.js ledger.t.js --force` e `bun utest.js state.t.js --force` verdes.

### 2. O degrade deixa de ser mudo

O `catch` continua degradando — e o contrato. Mas escreve o `err.message` em stderr sob
`UTEST_DEBUG`. Foi o silencio, nao o degrade, que escondeu isto por nove commits.

verify: `UTEST_DEBUG=1` com caminho quebrado imprime `[utest] ledger degradado: ...`.

### 3. O falso-verde do `verify()`

`noop().verify()` devolve `{ valid: true, length: 0 }` hardcoded — entao
`check(v.valid, true)` passava identicamente com e sem cadeia. Os testes de cadeia real
afirmam `v.length > 0`; o do no-op afirma `length === 0`.

verify: sabotar o import e confirmar que os novos checks REPROVAM.

### 4. A equivalencia das duas engines de arvore (8.3)

Provar que `walk()` e o baseline do fswatch devolvem a MESMA lista para a mesma arvore, que
e o criterio de aceite da 8.3.

verify: `scan()` com `{ fswatch: false }` e `{ fswatch: true }`, comparando entries,
uncovered e targets pareados.

### 5. A medicao das duas engines

`scanner.bench.js` compara as duas nos mesmos pontos. Nao para escolher a mais rapida — para
saber o PRECO do que se ganha (cadeia verificavel, identidade por inode, varredura
compartilhada com o `sprint-cli`).

## Criterio de pronto

- `bun utest.js .` verde, zero ✘ e zero 💥.
- `.utest/ledger.dash` nasce depois da rodada.
- quente == frio: duas rodadas seguidas, mesmo numero de checks (frente 2).
- os checks novos falham contra um no-op — provado por sabotagem, nao por suposicao.
- as duas engines de arvore devolvem listas identicas.
- o fallback e exercitado de verdade, nao so declarado.

# REPORT

Milestone das features **8.1**, **8.2** e **8.3**. O `utest` passa a se apoiar no sibling
`iodb/fswatch` para o log (8.1), o estado de scan (8.2) e a arvore (8.3) — com o
`readdirSync` e o `results.json` vivos como fallback e baseline de comparacao.

## O que aconteceu

### O que estava quebrado: um caminho de import

A suite estava vermelha em 7 checks e 2 excecoes, e a causa era UMA: `ledger.js` e `state.js`
importavam `'../iodb/io-engine.js'`, e o modulo mora em `'../iodb/src/io-engine.js'`. O
`try/catch` do degrade — "um runner de testes nao pode ficar refem do seu proprio log" —
engoliu o `ERR_MODULE_NOT_FOUND` sem dizer nada, e tudo rodou sobre o `noop()`: `runId: null`,
`configChanged: false`, nenhum `.dash` escrito.

Nao era regressao do sprint 022. `git log -p --follow` poe o caminho errado no commit original
da 8.1 (`b9b0b66`) — nove commits de suite vermelha atribuida ao lugar errado.

Duas portas foram fechadas junto com o caminho:

**O degrade deixou de ser mudo.** Os `catch` seguem devolvendo `noop()`, mas escrevem o
`err.message` em stderr sob `UTEST_DEBUG`. O que escondeu o defeito por nove commits nao foi o
degrade: foi o silencio dele.

**O falso-verde do `verify()`, fechado.** `noop().verify()` devolve `{ valid: true, length: 0 }`
hardcoded — entao `check(v.valid, true)` passava identicamente com cadeia real e sem cadeia
nenhuma. Agora os testes de cadeia real afirmam `v.length > 0` e o do no-op afirma
`length === 0`: os estados ficaram distinguiveis, que e o que faz o check valer.

### As duas engines de arvore devolvem a mesma lista (8.3)

Medido neste repo, `scan()` com `{ fswatch: false }` contra `{ fswatch: true }`:

```
entries identicos   : true   (13 e 13)
uncovered identicos : true   (10 e 10)
targets pareados    : 12 e 12
```

**Uma diferenca real, que o criterio de igualdade crua esconde**: o `walk()` devolve caminhos
RELATIVOS e o fswatch devolve ABSOLUTOS. A comparacao so fecha depois de um `resolve()` nos
dois lados. Nao quebra nada hoje — `cache.read()` resolve os 13 entries nos dois caminhos —
mas e uma assimetria de contrato entre duas fontes que se anunciam intercambiaveis, e vale
como item proprio.

### O preco, medido — e ele e maior do que se esperava

`scanner.bench.js`, duas rodadas, numeros reproduziveis:

```
| ponto            | entries | readdirSync (ms) | fswatch frio (ms) | fswatch quente (ms) |
| sintetico N=300  |     300 |             26.3 |            1322.0 |              1571.3 |
| sintetico N=600  |     600 |             11.9 |            1435.5 |              2153.7 |
| sintetico N=1200 |    1200 |             16.9 |            2000.5 |              2991.5 |
| utest (real)     |      46 |              5.3 |            4018.8 |              5617.6 |
```

Duas coisas aqui contrariam a expectativa, e as duas ficam registradas como sao:

1. **Nao e "um pouco mais lento": e duas ordens de grandeza.** A premissa de que JS-sobre-texto
   perderia pouco para C++-sobre-binario nao se sustenta nesta medicao. O custo nao esta na
   travessia — esta no `open()`/`close()` do store, que e O(store) e nao O(dirty). E exatamente
   o gargalo que [ISSUES/002](../ISSUES/002-iodb-flush-o-store.md) ja descreve, e que a feature
   1.6 do `iodb` resolveu so pela metade: o `flushPages()` foi corrigido, o `open()` com replay
   do log nao.

2. **O "quente" sai MAIS CARO que o frio**, o que e o oposto de um cache. A causa esta em
   `fswatchSource.js`: cada `walk()` abre o store, roda `fs.scan()` inteiro e fecha no
   `finally`. Nao existe caminho quente — existe o mesmo caminho frio pago duas vezes, sobre um
   store que cresceu entre as duas. O benchmark nomeia essa coluna de "quente", e o nome esta
   errado.

Isso **nao invalida a escolha** — o que se compra e cadeia verificavel, formato legivel por
humanos e identidade por inode, e o fallback existe precisamente para que o preco seja
opcional. Mas o `fswatch` **nao esta pronto para ser o caminho default de um `scan()` por
rodada** enquanto o `open()` custar isso. Hoje ele nao e: `scan()` tem `fswatch = false` por
default, e a 8.3 entrega a fonte trocavel, nao a troca.

## Prova

`bun utest.js .` — **verde, 630 checks** (era `✘7 💥2` com 616). `.utest/ledger.dash` nasce:
128KB, junto de `ledger.index` e `ledger.yaml`. Quente == frio: duas rodadas, 630 nas duas.

**Os checks novos reprovam contra um no-op** — por sabotagem, nao por suposicao: apontando o
import para um caminho inexistente, `ledger.t.js` volta a `💥1 ✘4`, e entre os vermelhos estao
os dois `check(v.length > 0, ...)` recem-adicionados. Um check que nao sabe falhar nao e um
check.

## O que fica aberto

- O `open()` O(store) do iodb — [ISSUES/002](../ISSUES/002-iodb-flush-o-store.md), ja aberto,
  e do repo do `iodb`.
- A assimetria relativo/absoluto entre as duas fontes de arvore.
- O nome "quente" no `scanner.bench.js`, que mede outra coisa.
- O `sha256` de conteudo segue no `cacheLedger.js`: o `hash` do fswatch e sempre `null` e
  `content_changed` nunca e emitido — os dois ja no `ISSUES.md`, ambos do `iodb`.
