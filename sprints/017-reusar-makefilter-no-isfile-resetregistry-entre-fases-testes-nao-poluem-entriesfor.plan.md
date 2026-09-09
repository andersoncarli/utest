# 017 — Plano: reusar makeFilter no _isFile; resetRegistry entre fases — testes nao poluem entriesFor

Plano do sprint 017. Features **3.2** (findTarget / pareamento por caminho) e **3.4**
(ganchos de extensão — `registerEntries`). Duas quirks levantadas em `issues/260907-tui.md`
(sprint 007 da feature 4.3 do `~/tui`), itens **#1** e **#3** — os dois de severidade alta.

## Objetivo

1. **#1 — `bun utest.js path/x.t.js` num subdiretório não imprime relatório** (só
   `coverage: —`, exit 0). O ramo `_isFile` de `runPhase` (utest.js) decide se o arquivo
   pertence à fase com um **regex glob bespoke** que quebra em caminho com ≥ 2 níveis. Trocar
   pelo `makeFilter` que `scanner.js` já exporta e a fase de scan já usa.

2. **#3 — a fase `eval` não roda sob `utest .`, só quando nomeada.** Um *teste*
   (`utest-phase.t.js` do `~/tui`) chama `registerEvalPhase({ entries })` na fase `unit` e
   **polui o singleton `ENTRY_PROVIDERS`** de `kinds.js`. Nas fases seguintes do mesmo
   processo, `entriesFor('eval')` devolve esse provider-fixture (vazio) → `runPhase('eval')`
   produz 0 entries → EVAL some do relatório. Mesma classe do item #4 (config global sem
   reset). Dar a `kinds.js` um `resetRegistry()` e chamá-lo entre fases no utest.

## Diagnóstico (confirmado)

### #1 — regex glob bespoke em `utest.js` (~L457-460)

```js
const belongs = inc.some(g => {
  const re = new RegExp('^' + g.replace(/[.]/g, '\\.').replace(/\*\*\//g, '(.*/)?').replace(/\*/g, '[^/]*') + '$')
  return re.test(path.relative(path.dirname(configPath), absFile))
})
```

A ordem dos `replace` é o bug: `**/` → `(.*/)?` **primeiro**, depois `*` → `[^/]*` roda
sobre a string inteira e **corrompe o `.` interno** de `(.*/)?`:

```
'**/*.t.js'  →  ^(.[^/]*\/)?[^/]*\.t\.js$
```

`(.[^/]*\/)?` casa **exatamente um** nível de diretório, não zero-ou-mais. Então:

| relpath | esperado | regex bespoke |
|---|---|---|
| `pty.t.js` | ✔ | ✔ |
| `a/pty.t.js` | ✔ | ✔ |
| `plugins/eval/pty.t.js` | ✔ | **✘** |

`belongs = false` → `entries = []` → fase sem entries → render imprime só `coverage: —`,
exit 0. O sidecar `.utest/<mangled>.json` **é** escrito (o arquivo roda) — só o relatório
some. Repro no `~/utest`: qualquer `.t.js` sob um subdir (o repo tem poucos; a repro
canônica é `cd ~/tui && bun ../utest/utest.js plugins/eval/pty.t.js`).

`scanner.js` já resolve isto certo: `makeFilter(include, exclude)` (exportado, L53) compõe
`compileGlob` — fast-path `**/*.ext`/`dir/**` + `minimatch` no resto. O ramo `_isFile`
deve reusá-lo em vez de reimplementar mal.

### #3 — `registerEntries` singleton poluído por um `.t.js`

`kinds.js`: `const ENTRY_PROVIDERS = new Map()` — estado de módulo, sem reset.
`~/tui/plugins/eval/utest-phase.t.js` L17-20:

```js
test('registerEvalPhase({ entries }): modo provider registra o entry-provider', ({ check }) => {
  const provider = async () => []
  registerEvalPhase({ entries: provider })   // ← ENTRY_PROVIDERS.set('eval', provider)
  check(typeof entriesFor('eval'), 'function')
})
```

Sequência sob `utest .`:

1. `phaseNames = ['unit', 'eval', 'tty']`
2. `runPhase('unit')` importa todos os `*.t.js` → `utest-phase.t.js` roda → `entriesFor('eval')` deixa de ser `null`
3. `runPhase('eval')`: `provider = entriesFor('eval')` → o fixture `async () => []` → 0 entries → EVAL vazio
4. `bun ../utest/utest.js eval` sozinho: `unit` nunca roda, provider fica `null`, cai no `scan()` glob → 11 entries reais ✓

Instrumentação confirmou: `entriesFor('eval')` = `false` logo após o `boot:`, `true` já na
2ª iteração do loop de fases.

## Passos

### Parte A — #1: `_isFile` reusa `makeFilter` (features 3.2)

- **`scanner.js`**: garantir que `makeFilter` está exportado (já está, L53). Nenhuma mudança
  esperada — confirmar a assinatura `makeFilter(include, exclude) → { included, excluded }`.
- **`utest.js`** (~L455-465, ramo `else if (_isFile)`): trocar o bloco `belongs` pelo
  `makeFilter`:
  ```js
  const cfg = cfgRaw[phase] || {}
  const inc = cfg.include || ['**/*.t.js', '**/*.test.js']
  const exc = [...(cfgRaw.exclude || []), ...(cfg.exclude || [])]
  const rel = path.relative(path.dirname(configPath), absFile)
  const belongs = makeFilter(inc, exc).included(rel)
  ```
  Adicionar `makeFilter` ao import de `./scanner.js` no topo de `utest.js`.
- **`scanner.t.js`** (dentro de `test('findTarget: ...')` ou um `test()` novo
  `'belongs: um arquivo por caminho pertence à fase certa'`): casos de mesa —
  `pty.t.js`, `a/b/pty.t.js`, `plugins/eval/pty.t.js` todos `included` sob
  `include: ['**/*.t.js']`; um `.eval.js` **não** `included` sob esse include; exclude
  global + de fase somam.

### Parte B — #3: `resetRegistry()` em `kinds.js`, chamado entre fases (feature 3.4)

- **`kinds.js`**: exportar `resetRegistry()` que limpa `ENTRY_PROVIDERS`, `EXECUTORS`,
  `PHASE_SETUPS` e restaura `KINDS` ao conjunto inicial (`t`, `test`, `it`, `tuit` — o que
  o módulo declara no import). Guardar o `KINDS` inicial num `const INITIAL_KINDS` no topo.
  Somar ao `export default`.
- **`utest.js`**: o registry é populado pelo `boot:` (L370-382). Depois que a fase `unit`
  importa os `.t.js`, ele pode estar sujo. Duas opções, decidir na implementação:
  - (preferida) **re-rodar o `boot:` entre fases** — extrair o loop de boot para
    `async function runBoot()` e chamar `resetRegistry()` + `runBoot()` no topo de cada
    iteração de `for (const phase of phaseNames)` **exceto a primeira**. Determinístico: cada
    fase parte do mesmo registry que o `boot:` monta.
  - (alternativa) só `resetRegistry()` + `runBoot()` uma vez, após a fase `unit`, antes das
    demais. Mais barato, cobre o caso real (só `unit` importa `.t.js` arbitrários).
- **`kinds.t.js`**: `test('resetRegistry: zera providers/executores/setups e restaura KINDS')`
  — registra `eval` + provider + executor + phaseSetup, chama `resetRegistry()`, afirma que
  `entriesFor`/`executorFor`/`phaseSetupFor` voltam a `null` e `kinds()` volta ao inicial.
- **`~/tui/plugins/eval/utest-phase.t.js`**: (fora do escopo de commit deste repo, mas
  anotar em `issues/260907-tui.md`) o teste deveria usar um helper `withRegistry` /
  restaurar no `finally` — o `resetRegistry` do utest é a rede, não a licença pra poluir.

## Critério de pronto

- `bun utest.js scanner.t.js` verde (verify_tests de 3.2) — com o `belongs` novo coberto.
- `bun utest.js kinds.t.js` verde — com `resetRegistry` coberto.
- `bun utest.js .` verde (a suíte do `~/utest`).
- **Repro #1 fecha**: `cd ~/tui && bun ../utest/utest.js plugins/eval/pty.t.js` imprime o
  relatório do arquivo (lista de testes + contagem), não só `coverage: —`.
- **Repro #3 fecha**: `cd ~/tui && bun ../utest/utest.js .` mostra a fase **EVAL** com suas
  ~11 entries / ~44 testes no relatório — a mesma contagem de `bun ../utest/utest.js eval`.
- `sprint test 3.2` e `sprint test 3.4` verdes.
- `sprint docs` ok.
