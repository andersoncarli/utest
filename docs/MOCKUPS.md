# Expected output for many situations

Cada caso mostra **exatamente o que se quer saber, com o mínimo de moldura
estrutural** para aquela saída. Erro ou hog sempre guiam ao próximo passo natural
via `tip:`.

O badge de arquivo num rio (`fileReportSpan`) tem ordem canônica: `<nome> [🐢N]
[💥K] [✘M] [✔P]`. 🐢 primeiro — num hog o tempo é a manchete. `✔P` só aparece com
`-v2`. `🐢N` = `floor(ms / limite)`; o limite é `--hogs <N>` (default 1000), então
sem `--hogs` `🐢N` são segundos inteiros e com `--hogs 100` um arquivo de 7100ms
vira `🐢71`.

---

## tudo verde — bloco tight, sem moldura

```bash
$ utest .
UNIT ... (1s 🐢3) 📄12 🧪210 ✔620
EVAL ....... (1s) 📄10 🧪 10  ✔20
coverage: 40%
```

`(1s 🐢3)` — 1s totais na fase, `🐢3` = soma dos multiplicadores 🐢 dos arquivos-hog
(sem `--hogs`, ~= segundos gastos em hogs). Uma fase sem nenhum arquivo não emite
linha.

## `utest . -v1` — com erros e exceções

```bash
$ utest . -v1
check.t.js 🐢1 💥1 ✘2 ✔21
  ✘ check(false) //line comment if any ............ check.t.js:030
  ✘ check(1, 2).................................... check.t.js:031
    received: 1  expected: 2
  💥 Bang!......................................... check.t.js:032
```

O bloco tight vira o rio de `compactFails` (só vermelhos/hogs) + o detalhe de cada
vermelho por inteiro. `💥1` no nome = uma exceção neste arquivo (badge próprio,
separado de `✘M`); abaixo, a linha `💥 Bang!` com o endereço.

## direct file run — um ou mais arquivos na linha de comando

Direto ao ponto, sem molduras.

```bash
$ utest check.t.js other.t.js
check.t.js 🐢1 💥1 ✘2 ✔21
  ✘ check(false) //line comment if any ............ check.t.js:030
  ✘ check(1, 2) ................................... check.t.js:031
    received: 1  expected: 2
  💥 Bang! ........................................ check.t.js:032
other.t.js ✘1
  💥 Bang! ........................................ other.t.js:002
```

## `utest .` com vermelhos — relatório emoldurado

```bash
$ utest .
────────────────────────────────────────────────────────────────────
utest results
────────────────────────────────────────────────────────────────────
UNIT ................................. (1s 🐢11) ✘2 💥2 📄12 🧪18 ✔594
  check.t.js 🐢1 ✘3 💥1 ✔21   state.t.js 💥1 ✔11
  viewer.t.js 🐢7 ✔202        trace.t.js 🐢4 ✔35
────────────────────────────────────────────────────────────────────
 tip: run  utest check.t.js  to see failure details
────────────────────────────────────────────────────────────────────
coverage: 40%                                        (1s 🐢11) ✘2 💥2 …
```

Só um vermelho pede a moldura. `--hogs` **não** entra aqui — tem forma própria
(abaixo).

## `--hogs [N]` — MODO LASER, zero moldura

`--hogs` é uma pergunta sobre TEMPO. A resposta é a lista dos arquivos-hog e seus
badges, direto: sem `─────`, sem `utest results`, sem phaseLine, sem `coverage:`.
Nunca mostra vermelhos — quem quer falha roda sem `--hogs`. Sem cap: `--hogs 100`
pediu TODOS acima de 100ms. Ordenado do mais lento ao menos.

```bash
$ utest . --hogs 100
viewer.t.js 🐢71  trace.t.js 🐢10  cache.t.js 🐢9  ledger.t.js 🐢4
state.t.js 🐢3  scanner.t.js 🐢3  test.t.js 🐢1  probe.t.js 🐢1
 tip: run  utest viewer.t.js --trace  to investigate the slowest
```

`-v1` (default do laser) → só `nome 🐢N`. `--trace` é a ferramenta de drill-in de
hog — é para lá que o `tip:` aponta.

## `-v2 --hogs [N]` — os mesmos hogs + a contagem de checks

```bash
$ utest . -v2 --hogs 100
viewer.t.js 🐢71 ✔200  trace.t.js 🐢10 ✔35  cache.t.js 🐢9 ✔178
ledger.t.js 🐢4 ✔9  state.t.js 🐢3 ✔13  scanner.t.js 🐢3 ✔44
test.t.js 🐢1 ✔14  probe.t.js 🐢1 ✔39
 tip: run  utest viewer.t.js --trace  to investigate the slowest
```

`-v2` acrescenta `✔P` a cada arquivo. Ainda sem moldura.

## `--hogs N` sem nenhum arquivo acima de N — linha seca

```bash
$ utest . --hogs 100000
nenhum arquivo acima de 100000ms
```

## `--watch` / `-w` — a moldura sempre no topo

Cada refresh reseta a scroll-region, leva o cursor a 0,0 e limpa da linha atual
pra baixo — **sem** `\x1b[3J`, então o histórico das rodadas anteriores continua
rolável pra cima. Só num TTY.
