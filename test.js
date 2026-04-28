// _current: set by test.begin() for per-file isolation; null = use test.main (back-compat)
let _current = null

export function test(name, fn = () => {}, op = {}) {
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
    oncheck: (chk) => t.checks.push(chk)
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

// ─── Isolated scope API (used by utest2.js) ─────────────────────
// Call test.begin() before import(file), test.end() after.
// All top-level test() calls in the file go into the returned root.
test.begin = (name = 'root') => {
  const root = { name, tests: [], checks: [], state: 'pending', output: [] }
  _current = root
  return root
}
test.end = () => { _current = null }

// Temporarily redirect test() registrations into a parent node.
// Used by describe() in shims so arrow-function bodies work correctly.
test.scope = (parent, fn) => {
  const prev = _current
  _current = parent
  try { fn() } finally { _current = prev }
}

// ─── Singleton (back-compat for worker.js / utest.js) ───────────
test.main = globalThis.test?.main || {
  name: 'Main',
  tests: [],
  checks: [],
  state: 'pending'
}

if (!globalThis.test) globalThis.test = test
globalThis.test.main = test.main

Object.defineProperty(test, '_loadingFile', {
  get: () => (test.main._loadingFile),
  set: v => { test.main._loadingFile = v },
  configurable: true
})

test.todo = (name, fn) => test(name, fn, { todo: true })
test.skip = (name, fn) => test(name, fn, { skip: true })
test.it   = test
test.context = {}

export default test
