import path from 'path'
import { test } from './test.js'
import check from './check.js'
import callstack from '../utils/src/callstack.js'
import { captureConsole } from './console-capture.js'

const INTERNAL = /utest\.js|scanner\.js|runner\.js|worker\.js|check\.js|test\.js|shims\.js|node:|bun:|internal\//i

// ─── Load ─────────────────────────────────────────────────────
export async function loadFile(abs) {
  const prev = test._loadingFile
  test._loadingFile = abs
  const existing = test.main.tests.filter(t => t.address === abs || t._address === abs)
  if (existing.length > 0) return

  let _importTimer = null
  try {
    await Promise.race([
      import(abs),
      new Promise((_, r) => { _importTimer = setTimeout(() => r(new Error(`Import Timeout (1s): ${abs}`)), 1000) })
    ])
    for (const t of test.main.tests)
      if (!t.address && !t._address) t._address = abs
  } catch (e) {
    const t = test(`load ${path.basename(abs)}`, () => {})
    t.state = 'exception'; t.error = e; t.address = abs
  } finally { if (_importTimer) clearTimeout(_importTimer); test._loadingFile = prev }
}

// ─── Execute ──────────────────────────────────────────────────
export async function run(tree, options = {}) {
  const { stopOnException = false, timeout = 1000 } = options
  const start = process.hrtime.bigint()

  await Promise.all(tree.tests.filter(t => !t._cached).map(async t => {
    try { await runTest(t, { stopOnException, timeout }) }
    catch (e) { console.error(`[run] fatal: "${t.name}"`, e) }
  }))

  tree.duration = Number(process.hrtime.bigint() - start) / 1e6
  const sum = summary(tree)
  tree.state = sum.exception > 0 ? 'exception' : sum.failed > 0 ? 'failed' : 'passed'
  return serialize(tree)
}

export async function runTest(t, op = {}) {
  const { stopOnException = true, timeout = 1000 } = op
  if (t.state !== 'pending') return t
  t.state = 'running'
  t.startTime = process.hrtime.bigint()

  // Resolve caller location from the test's captured stack
  if (!t.caller && t.stack) {
    const cs = callstack({ error: { stack: t.stack }, smartFilter: false })
    for (const frame of cs.stack) {
      if (!INTERNAL.test(frame.file) && !INTERNAL.test(frame.func)) { t.caller = frame; break }
    }
  }

  const saved = check.test
  check.test = t

  try {
    const context = {
      ...(t.context || {}),
      check:          check.bind(t),
      checkFail:      check.checkFail.bind(t),
      checkException: check.checkException.bind(t),
      test:           test.bind(t),
      log:            (...a) => t.output.push(['log', a]),
      debug:          (...a) => t.output.push(['debug', a]),
    }

    const effectiveTimeout = t.op?.timeout || timeout
    const releaseConsole = captureConsole(t)
    let _timeoutTimer = null
    try {
      await Promise.race([
        (async () => {
          let r
          if (t.fn.length === 0)      r = t.fn.call(t)            // no-arg: plain async fn (bun:test style)
          else if (t.fn.length === 1) r = t.fn.call(t, context)   // ({ check }) => {} style
          else { const done = new Promise((res, rej) => { r = t.fn.call(t, (e) => e ? rej(e) : res(), context) }); await done; return }
          if (r instanceof Promise) await r
        })(),
        // O timer TEM que ser limpo quando o trabalho ganha — um `setTimeout` de 10s de um
        // passo de `eval` já pronto seguraria o event loop por 10s depois do relatório.
        new Promise((_, r) => { _timeoutTimer = setTimeout(() => r(new Error(`Timeout (${effectiveTimeout}ms)`)), effectiveTimeout) })
      ])
    } finally { if (_timeoutTimer) clearTimeout(_timeoutTimer); releaseConsole() }

    for (const child of t.tests) {
      await runTest(child, op)
      if (stopOnException && child.state === 'exception') { t.state = 'exception'; break }
    }

    if (t.state === 'running')
      t.state = (t.checks.some(c => c.state !== 'passed') || t.tests.some(c => ['failed','exception'].includes(c.state)))
        ? 'failed' : 'passed'
  } catch (e) {
    t.state = 'exception'
    t.error = e
  } finally {
    check.test = saved
    t.endTime  = process.hrtime.bigint()
    t.duration = Number(t.endTime - t.startTime) / 1e6
  }
  return t
}

// ─── Summary ──────────────────────────────────────────────────
export function summary(t) {
  const s = { passed: 0, failed: 0, exception: 0, total: 0 }
  for (const c of (t.checks || [])) { s[c.state] = (s[c.state] || 0) + 1; s.total++ }
  if (t.tests?.length) {
    for (const child of t.tests) {
      const cs = summary(child)
      s.passed += cs.passed; s.failed += cs.failed; s.exception += cs.exception; s.total += cs.total
    }
  } else {
    if (s.total === 0 && t.state && !['pending','running'].includes(t.state)) {
      s[['passed','failed','exception'].includes(t.state) ? t.state : 'passed']++
      s.total++
    } else if (t.state === 'exception' && !s.exception) {
      // Leaf test threw an exception but also has checks — count the exception
      s.exception++; s.total++
    }
  }
  return s
}

// ─── Serialize ────────────────────────────────────────────────
const safeStr = v => { try { return v !== undefined ? String(v) : undefined } catch(e) { return `[${e.message}]` } }

function serializeCheck(c) {
  return {
    state:    c.state,
    a:        safeStr(c.a),
    b:        safeStr(c.b),
    message:  c.op?.message   || undefined,
    address:  c.address       || undefined,
    lineCode: c.lineCode      || undefined,
    error:    c.error ? { message: c.error.message, stack: c.error.stack } : undefined,
    op: {
      message: c.op?.message,
      error: c.op?.error ? { message: c.op.error.message, stack: c.op.error.stack } : undefined
    },
  }
}

function serialize(t) {
  return {
    name:       t.name,
    state:      t.state,
    duration:   Math.round(t.duration || 0),
    address:    t.address || t._address || (t.caller ? `${t.caller.file}:${String(t.caller.line).padStart(3,'0')}` : undefined),
    cached:     t._cached || false,
    checkCount: t._checkCount || 0,
    checks:     (t.checks || []).map(serializeCheck),
    output:     t.output || [],
    error:      t.error ? { message: t.error.message, stack: t.error.stack } : undefined,
    tests:      (t.tests || []).map(serialize),
  }
}
