// test.js — PRELOAD OBRIGATÓRIO. Qualquer arquivo, em qualquer projeto peer sibling, que
// use `check`/`checkException`/os globais de asserção do `utest` DEVE importar ESTE módulo
// (`import '.../utest/src/test.js'`) como a PRIMEIRA coisa que roda — antes de qualquer
// outro import que dependa desses globais já existirem. `test.install()` (fim do arquivo)
// roda como efeito colateral do próprio import e faz `Object.assign(globalThis, test.api)`
// — não há outro ponto de instalação, e depender da ordem TRANSITIVA de imports de outro
// módulo (torcer pra alguém no meio do caminho já ter importado isto) é frágil: qualquer
// reordenação silenciosa quebra o consumidor sem aviso.
//
// NÃO importar `utest/src/index.js`/`utest.js` (o pacote inteiro, `package.json#main`)
// só para pegar os globais fora do contexto de RODAR a suíte: aquele entrypoint instala um
// trap em `process.exit` (proteção do runner) que quebra qualquer processo que chame
// `process.exit()` legitimamente fora de um test run. `test.js` sozinho é o módulo certo —
// só os globais de asserção, sem esse efeito colateral.
import { check, checkFail, checkException } from './check.js'

// _current: set by test.begin() for per-file isolation; null = use test.main (back-compat)
let _current = null

export function test(name, fn = () => {}, op = {}) {
  // `fn` tem default (`() => {}`) só pra nunca crashar em `t.fn()` — não é um jeito
  // válido de chamar `test()`, é so uma rede de segurança. `typeof fn` sozinho nunca
  // pega "omitido" por causa do default; `arguments.length` distingue "não passou"
  // de "passou uma função de verdade".
  if (typeof name !== 'string' || arguments.length < 2 || typeof fn !== 'function') {
    const fnDesc = arguments.length < 2 ? 'ausente' : typeof fn
    process.stderr.write(`\x1b[33mutest: test() chamado sem nome/função — name:${JSON.stringify(name)} fn:${fnDesc}\x1b[39m\n`)
  }

  const stack = new Error().stack

  const t = {
    name,
    fn,
    op: typeof op === 'boolean' ? { run: op } : op,
    stack,
    checks: [],
    tests: [],
    output: [],
    state: 'pending',
    parent: null,
    // Depois de `sealed` o veredito de `t` já foi lido. Um check que chega aqui
    // veio de trabalho solto (setTimeout, promise não esperada, corpo que
    // seguiu após o timeout) e não teria efeito nenhum: seria empilhado num nó
    // já julgado, e a falha sumiria do relatório e do cache. Reabrir o estado é
    // o que a devolve para a conta de quem a soltou.
    oncheck: (chk) => {
      t.checks.push(chk)
      if (t.sealed && chk.state !== 'passed') t.state = 'failed'
    }
  }

  // Precedence: explicit this-binding (inside describe) → _current (file root) → test.main
  const parent = (this && this.tests) ? this
    : _current ?? test.main

  if (parent && parent !== t) {
    t.parent = parent
    parent.tests.push(t)
    if (!_current && parent === test.main && test._loadingFile)
      t.address = test._loadingFile
  }

  return t
}

// ─── Isolated scope API ─────────────────────────────────────────
// Call test.begin() before import(file), test.end() after.
// All top-level test() calls in the file go into the returned root.
test.begin = (name = 'root') => {
  const root = { name, tests: [], checks: [], state: 'pending', output: [] }
  _current = root
  return root
}
test.end = () => { _current = null }
Object.defineProperty(test, 'current', { get: () => _current, configurable: true })

// Temporarily redirect test() registrations into a parent node.
// Used by describe() in shims so arrow-function bodies work correctly.
test.scope = (parent, fn) => {
  const prev = _current
  _current = parent
  try { fn() } finally { _current = prev }
}

// ─── Singleton (back-compat for src/worker.js / utest.js) ───────────
test.main = globalThis.test?.main || {
  name: 'Main',
  tests: [],
  checks: [],
  state: 'pending'
}

// test.api: a única fonte do que um corpo de teste recebe como contexto (`fn(ctx)`).
// shims.js estende isto com describe/it/expect/etc — não pode importar de lá (ciclo:
// shims.js já importa test.js), então cada camada soma o que só ela enxerga.
test.api = test.api || { check, checkFail, checkException }

Object.defineProperty(test, '_loadingFile', {
  get: () => (test.main._loadingFile),
  set: v => { test.main._loadingFile = v },
  configurable: true
})

test.todo = (name, fn) => test(name, fn, { todo: true })
test.skip = (name, fn) => test(name, fn, { skip: true })
test.it   = test
test.context = {}

// ─── Instalação explícita de globals ──────────────────────────────
// Único ponto que escreve em `globalThis`. Chamado automaticamente no import (linha
// abaixo) — todo consumidor direto de `test.js` (utest.js, os `.t.js` do projeto sob o
// harness) ganha o global de graça, como sempre foi. Também exposto como `test.install()`
// para quem monta o próprio entrypoint fora do harness (uma app TUI em runtime, por
// exemplo) e precisa garantir o global de forma explícita, sem depender de MAIS um import
// silencioso em algum ponto da cadeia.
//
// Idempotente por identidade de referência, não por forma: bun expõe um `test` nativo
// (seu test runner embutido) antes deste módulo carregar, então `!globalThis.test` sozinho
// nunca segura a instalação — mas comparar contra a PRÓPRIA função (`globalThis.test ===
// test`) evita reescrever globals que hooks de terceiros (describe/it de shims.js, por
// exemplo) já emendaram em cima da mesma instância.
test.install = () => {
  if (globalThis.test !== test) globalThis.test = test
  globalThis.test.main = test.main
  Object.assign(globalThis, test.api)
  return test
}
test.install()

export default test
