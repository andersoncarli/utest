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

export default { register, kinds, testRe, loaderFilter, stripKind }
