---
sprint: 17
date: 2026-09-08
features: [3.2, 3.4]
thread: null
---
# 017 — reusar makeFilter no _isFile; resetRegistry entre fases — testes nao poluem entriesFor

Dois bugs de severidade alta levantados em `issues/260907-tui.md` (sprint 007 do `~/tui`): rodar um `.t.js` por caminho num subdiretorio nao imprimia relatorio (so `coverage: —`, exit 0), e a fase `eval` nao rodava sob `utest .`, so quando nomeada. Ambos eram estado global sem reset — um regex glob reimplementado a mao no `_isFile`, e o singleton `ENTRY_PROVIDERS` de `kinds.js` que um `.t.js` da fase `unit` poluia.

## Objetivo

`issues/260907-tui.md` documentou seis quirks do utest encontradas ao construir a feature 4.3
do `~/tui`. Os dois de severidade alta que sao do `~/utest` (o #4 e do `~/tui`, os #2/#5/#6
sao da frente de cache):

- **#1** — `bun utest.js plugins/eval/pty.t.js` (qualquer `.t.js` a >= 2 niveis de pasta)
  imprimia so `coverage: —` e saia 0. O arquivo rodava (o sidecar `.utest/` era escrito),
  mas o relatorio sumia.
- **#3** — `bun utest.js .` rodava so a fase `unit`; `eval`/`tty` so com o nome explicito.
  O "criterio de pronto" `utest .` verde era incompleto.

## Diagnostico

### #1 — regex glob bespoke no ramo `_isFile` de `runPhase` (`utest.js`)

O `belongs` — "este arquivo pertence a esta fase?" — montava um `RegExp` a mao:

```js
g.replace(/[.]/g, '\\.').replace(/\*\*\//g, '(.*/)?').replace(/\*/g, '[^/]*')
```

A ordem quebra: `**/` -> `(.*/)?` primeiro, depois `*` -> `[^/]*` roda sobre a string
inteira e corrompe o `.` interno de `(.*/)?`:

```
'**/*.t.js'  ->  ^(.[^/]*\/)?[^/]*\.t\.js$
```

`(.[^/]*\/)?` casa exatamente UM nivel de pasta, nao zero-ou-mais. `plugins/eval/pty.t.js`
(dois niveis) -> `belongs = false` -> `entries: []` -> fase sem entries -> render imprime so
`coverage: —`. `scanner.js` ja resolve isto certo com `makeFilter` (fast-path + minimatch),
usado pelo walk — o `_isFile` reimplementava mal.

Junto: `rawTarget` ficava relativo ate o ramo `_isFile`, que fazia `path.resolve(rawTarget)`
DEPOIS do `process.chdir(root)`. Como `root` para um alvo-arquivo e a pasta do proprio
alvo, o resolve duplicava: `.../plugins/eval/plugins/eval/pty.t.js` -> ENOENT. So aparecia
depois de consertar o `belongs` (antes, `belongs=false` engolia tudo).

### #3 — `ENTRY_PROVIDERS` (singleton de `kinds.js`) poluido por um `.t.js`

`~/tui/plugins/eval/utest-phase.t.js` L17-20 chama `registerEvalPhase({ entries: async () => [] })`
para provar o modo provider. Isso faz `ENTRY_PROVIDERS.set('eval', <fixture>)` e nunca
restaura. Sequencia sob `utest .`:

1. `phaseNames = ['unit', 'eval', 'tty']`
2. `runPhase('unit')` importa todos os `*.t.js` -> o teste acima roda -> `entriesFor('eval')` deixa de ser `null`
3. `runPhase('eval')`: `provider = entriesFor('eval')` -> o fixture `async () => []` -> 0 entries -> EVAL vazio
4. `utest eval` sozinho: `unit` nunca roda, provider fica `null`, cai no `scan()` glob -> 11 entries reais

Instrumentacao confirmou: `entriesFor('eval')` = `false` logo apos o `boot:`, `true` ja na
2a iteracao do loop de fases. Mesma classe do item #4 (`configure()` global sem reset).

## O que foi entregue

**#1 — `_isFile` reusa `makeFilter`** (`utest.js`, feature 3.2)
O bloco `belongs` virou `makeFilter(inc, exc).included(rel)` — o mesmo `compileGlob` do
walk. `exc` soma `cfgRaw.exclude` (global) + `cfg.exclude` (da fase). `rawTarget` passou a
ser absolutizado logo apos a deteccao (antes do `chdir`), com comentario explicando o
double-path. `makeFilter` ja era exportado por `scanner.js` — so faltava o import em
`utest.js`.

**#3 — `resetRegistry()` em `kinds.js`, chamado entre fases** (`kinds.js` + `utest.js`, feature 3.4)
- `kinds.js`: `INITIAL_KINDS` guarda o vocabulario do import; `resetRegistry()` limpa
  `ENTRY_PROVIDERS`/`EXECUTORS`/`PHASE_SETUPS` e restaura `KINDS`. Somado ao `export default`.
- `utest.js`: o loop `boot:` virou `async function runBoot()` (os modulos ja sao
  `import()`-cacheados; so a fn de registro re-roda). O loop de fases agora e indexado, e
  antes de CADA fase apos a primeira chama `resetRegistry()` + `runBoot()` — cada fase parte
  do registry que so o `boot:` monta.

**Cobertura**
- `scanner.t.js` §"makeFilter": `**/*.t.js` casa em qualquer profundidade (raiz, 1, 2, fundo);
  um `.eval.js` nao casa `include` de `unit`; exclude vence include em qualquer nivel.
- `kinds.t.js` §"resetRegistry": registra kind + executor + entries + phaseSetup, afirma que
  o reset zera os tres mapas e volta `KINDS` ao inicial.

**Roteiros de eval** (features 3.2 e 3.4 estavam 🟡 sem `.eval.js` — `verify_manual` de ambas
pedia um; escrevê-los era preencher lacuna de design, nao expandir escopo)
- `plans/3-scan/3.2.eval.js`: as seis regras de `findTarget` contra o `scanner.js` real; o
  passo que fecha o laço (`3.2.eval.js` -> `3.2-…-md`); e o passo `real` do issue #1 —
  `bun utest.js plugins/deep/nest/m.t.js` num subdir fundo imprime o relatorio completo.
- `plans/3-scan/3.4.eval.js`: os tres `*For` + `resetRegistry`; fase provider ignora o
  `include`; sem `boot:` a fase nem existe; e o passo `real` do issue #3 — um `.t.js` da
  `unit` que chama `registerEntries` nao polui a fase seguinte (`PROV 📄2 🧪2` igual em
  `utest .` e `utest prov`).
- `sprint eval 3.2 --yes` e `sprint eval 3.4 --yes` verdes -> ambas 🟢 avaliada.

## Verificacao

- `bun utest.js scanner.t.js` — verde (44 checks), verify_tests da 3.2
- `bun utest.js kinds.t.js` — verde (31 checks), verify_tests da 3.4
- `bun utest.js .` (suite do `~/utest`) — verde, 12 📄 / 202 🧪 / 577 ✔, exit 0
- `sprint eval 3.2 --yes` — verde (6 sandbox + 1 real) -> 🟢
- `sprint eval 3.4 --yes` — verde (3 sandbox + 1 real) -> 🟢
- Repro #1: `cd ~/tui && bun ../utest/utest.js plugins/eval/pty.t.js` -> relatorio completo
  (34 testes), nao mais `coverage: —`
- Repro #3: `cd ~/tui && bun ../utest/utest.js .` -> UNIT + **EVAL (11 📄 / 44 🧪)** + TTY,
  a mesma contagem de `bun ../utest/utest.js eval`
- `sprint docs` — ok

## Pendente (fora deste sprint)

- `utest .` sai com exit 0 mesmo com `EVAL ✘1` — o exit code nao agrega fases provider
  (relacionado ao item #5 da issue).
- O `.t.js` do `~/tui` deveria restaurar o registry no `finally` (helper `withRegistry`);
  `resetRegistry` e a rede do utest, nao licenca pra poluir. Anotado em `issues/260907-tui.md`.
