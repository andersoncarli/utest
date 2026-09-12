# 021 — Plano: utest se apoia em iodb/fswatch, e mantem o fallback

Milestone. Features **8.1** (ledger append-only), **8.2** (`.utest/STATE`) e **8.3**
(`scanner.js` sobre o baseline do fswatch).

## Objetivo

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

## Passos

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
