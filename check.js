// Self-contained check for utest — no external dependencies.
// Captures new Error('check') at call site so viewer can extract lineCode from stack.
// Semantics match utils/src/check.js: undefined check, function eval, string repr comparison.

const UNSET = Symbol('unset')

function pass(a, bIn) {
  const bGiven = bIn !== UNSET
  let b = bGiven ? bIn : true  // default b to true when not provided

  // undefined: only passes when explicitly checking for 'undefined'
  if (a === undefined) return b === 'undefined'

  // function evaluation for a
  if (typeof a === 'function') a = a()

  // truth check: bool a with no explicit b (or string message)
  if (typeof a === 'boolean' && (!bGiven || typeof b === 'string')) return a

  // function evaluation for b
  if (typeof b === 'function') b = b()

  // string repr comparison
  const ra = typeof a === 'string' ? a : repr(a)
  const rb = typeof b === 'string' ? b : repr(b)
  return ra === rb
}

function repr(v) {
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  try { return JSON.stringify(v) } catch { return String(v) }
}

function Check(a, bIn, op, boundTest) {
  if (typeof op === 'string') op = { message: op }
  op = op || {}
  if (!op.error) op.error = new Error('check')

  this.op = op
  this.state = 'pending'
  const bGiven = bIn !== UNSET

  try {
    if (a instanceof Error) throw a
    const result = pass(a, bIn)
    this.state = result ? 'passed' : 'failed'
    // Only record a/b for equality checks (not truth checks)
    if (bGiven && !(typeof a === 'boolean' && typeof bIn !== 'boolean')) {
      this.a = typeof a === 'function' ? repr(a()) : repr(a)
      this.b = typeof bIn === 'function' ? repr(bIn()) : (bIn === UNSET ? undefined : repr(bIn))
    }
  } catch (e) {
    this.state = 'exception'
    this.error = e
    if (op.checkException) this.state = 'passed'
  }

  if (op.checkFail) {
    if (this.state === 'failed') this.state = 'passed'
    else if (this.state === 'passed') this.state = 'failed'
  }

  const t = boundTest || check.test
  if (t?.oncheck) t.oncheck(this)
}

export function check(a, b, op, cb) {
  const t = (this && this.oncheck) ? this : null
  const bIn = arguments.length >= 2 ? b : UNSET
  return new Check(a, bIn, op, t)
}

export function checkFail(a, b, op) {
  const t = (this && this.oncheck) ? this : null
  if (typeof op === 'string') op = { message: op }
  const bIn = arguments.length >= 2 ? b : UNSET
  return new Check(a, bIn, { ...op, checkFail: true }, t)
}

export function checkException(fn, op) {
  const t = (this && this.oncheck) ? this : null
  if (typeof op === 'string') op = { message: op }
  try {
    if (typeof fn === 'function') fn()
    return new Check(false, true, { ...op, checkException: true }, t)
  } catch (e) {
    return new Check(true, true, { ...op, checkException: true }, t)
  }
}

check.checkFail = checkFail
check.checkException = checkException
check.test = null

export default check
