/**
 * kinds.js — que sufixos o utest reconhece, declarado UMA vez.
 *
 * O vocabulário (`.t.js`, `.test.js`, `.tuit`, `.it.js`) estava escrito à mão em
 * cinco lugares: o `TEST_RE` do scanner, o descascador de `findTarget`, e o
 * `filter` do plugin em `utest.js`, `utest2.js` e `setup.js`. Acrescentar um
 * tipo exigia achar os cinco, e um esquecido não dá erro — o arquivo
 * simplesmente some da suíte, ou entra sem o shim.
 *
 * Daqui saem as duas formas de perguntar a mesma coisa: `TEST_RE` para quem
 * testa um nome, e `loaderFilter()` para o `build.onLoad` do plugin do Bun.
 *
 * ── Estender ────────────────────────────────────────────────────────────────
 *
 * `register('eval')` faz `.eval.js` passar a ser reconhecido pelas duas pontas
 * ao mesmo tempo. É o gancho que deixa um consumidor externo (o `sprint eval`,
 * que roda `.eval.js`) reusar o runner sem forkar o regex — ver
 * `sprint/TEST-EVAL.md` no soml.
 *
 * `registerExecutor(kind, fn)` é o gancho irmão: um tipo pode não ser um módulo ESM
 * chamando `test()` (`.tuit` é JSON+arte intercalados; `.eval.js` exporta `(t) => {...}`).
 * `fn(entry, helpers) → Promise<Array<{name, fn}>>` devolve os PASSOS a registrar como
 * `test()` filhos — `utest.js` chama isto no lugar de `await import(entry.path)` quando um
 * executor está registrado para o `kindOf(entry.path)`. Um projeto registra via `boot:`
 * (`TEST.boot.js`), antes do scan — `utest/` em si não importa nada de projeto nenhum.
 */
const KINDS = new Set(['t', 'test', 'tuit', 'it'])

// `.tuit` não tem extensão de linguagem depois do tipo; os outros têm.
const pattern = () => {
  const alt = [...KINDS].join('|')
  return `\\.(${alt})\\.(js|ts)$|\\.(${alt})$`
}

export const register = (...kinds) => {
  for (const k of kinds) KINDS.add(k)
  return kinds
}

export const kinds = () => [...KINDS]

// Um RegExp novo a cada leitura: `register()` pode ter mudado o conjunto, e um
// regex guardado em `const` congelaria o vocabulário no import.
export const testRe = () => new RegExp(pattern())

// O mesmo alcance, na forma que `build.onLoad` do Bun espera.
export const loaderFilter = () => new RegExp(pattern())

// Tira o sufixo de tipo de um nome: `pixel.classes.t.js` → `pixel.classes`.
export const stripKind = name => name.replace(testRe(), '')

// Qual tipo um nome casou: `pixel.classes.t.js` → `'t'`, `panel.tuit` → `'tuit'`. `null` se
// não é teste. O executor usa isto para decidir COMO rodar o arquivo — `.tuit` e `.eval.js`
// não são módulo ESM chamando `test()`, então `await import(entry.path)` não serve.
export const kindOf = name => {
  const m = name.match(testRe())
  return m ? (m[1] ?? m[3]) : null
}

const EXECUTORS = new Map()

export const registerExecutor = (kind, fn) => { EXECUTORS.set(kind, fn); return fn }
export const executorFor = kind => EXECUTORS.get(kind) ?? null

// `registerEntries(phase, fn)` é para a fase cujos arquivos NÃO moram sob `root` — `.eval.js`
// vive em `~/sprint-cli/plans/**`, fora da árvore que `scan()` varre por `include`/`exclude`.
// `fn() → Promise<Array<{path, target}>>` devolve as entries direto, sem passar pelo walk.
// Uma fase com provider registrado ignora `include`/`exclude` do TEST.yaml por completo.
const ENTRY_PROVIDERS = new Map()

export const registerEntries = (phase, fn) => { ENTRY_PROVIDERS.set(phase, fn); return fn }
export const entriesFor = phase => ENTRY_PROVIDERS.get(phase) ?? null

export default {
  register, kinds, testRe, loaderFilter, stripKind, kindOf,
  registerExecutor, executorFor, registerEntries, entriesFor,
}
