// runner.js — Load test files from scanner manifest, execute, serialize for viewer.
//
// Manifest format (from scanner.js):
//   "src/foo.js":  { tests: { "foo.t.js": {cache?:N} } }   covered
//   "src/bar.js":  { cache: N }                              self-validating
//   "src/baz.js":  {}                                        uncovered — skipped

import path from 'path'
import test from './test.js'

const INTERNAL = /utest\.js|scanner\.js|runner\.js|test\.js|node:|loader|run_main|ModuleJob|Module\._|internal\//i

async function loadFile(abs) {
  const prev = test._loadingFile
  test._loadingFile = abs
  const existing = test.main.tests.filter(t => t.address === abs || t._address === abs)
  if (existing.length > 0) {
    // console.log(`[runner.js] ${abs} already loaded, skipping import`)
    return
  }

  try {
    await import(`file://${abs}?t=${Date.now()}`)
    for (const t of test.main.tests)
      if (!t.address && !t._address) t._address = abs
  } catch (e) {
    const t = test(`load ${path.basename(abs)}`, () => {})
    t.state = 'exception'
    t.error = e
    t.address = abs
  } finally {
    test._loadingFile = prev
  }
}

function cachedTest(name, abs, checkCount) {
  const t = test(name, () => {})
  t.state = 'passed'
  t._cached = true
  t._checkCount = checkCount
  t.address = abs
  return t
}

export async function runManifest(manifest, options = {}) {
  const { force = false, stopOnException = false } = options
  const cwd = manifest._TARGET || process.cwd()

  for (const [rel, entry] of Object.entries(manifest)) {
    if (rel.startsWith('_')) continue

    if (entry.tests) {
      const dir = path.dirname(path.resolve(cwd, rel))
      for (const [testName, info] of Object.entries(entry.tests)) {
        const abs = path.join(dir, testName)
        if (typeof info.cache === 'number' && !force)
          cachedTest(testName, abs, info.cache)
        else
          await loadFile(abs)
      }
    } else if (typeof entry.cache === 'number') {
      const abs = path.resolve(cwd, rel)
      if (force) await loadFile(abs)
      else cachedTest(path.basename(rel), abs, entry.cache)
    }
    // uncovered: skip
  }

  const rawTree = await run(test.main, { stopOnException })
  const entries  = Object.entries(manifest).filter(([k]) => !k.startsWith('_'))
  const allRel   = entries.map(([k]) => k)
  const isTest   = n => /\.(t|test|tuit|it)\.(js|ts)$/.test(n)

  const fCount = allRel.filter(n => !isTest(n)).length
  const cCount = entries.filter(([, v]) => v.tests || typeof v.cache === 'number').length

  rawTree._coverage = {
    files:     fCount,
    covered:   cCount,
    uncovered: fCount - cCount,
  }
  return prepareReport(rawTree)
}

export async function run(tree, options = {}) {
  const { stopOnException = false } = options
  await G._ready
  const ctx = { check: await G.check, callstack: await G.callstack }
  const start = process.hrtime.bigint()

  for (const t of tree.tests) {
    if (t._cached) continue
    try {
      await runTest(t, ctx, { stopOnException })
    } catch (e) {
      console.error(`[run] fatal: "${t.name}"`, e)
      throw e
    }
    if (stopOnException && t.state === 'exception') break
  }

  tree.duration = Number(process.hrtime.bigint() - start) / 1e6
  const sum = summary(tree)
  tree.state = sum.exception > 0 ? 'exception' : sum.failed > 0 ? 'failed' : 'passed'
  return serialize(tree)
}

export async function runTest(t, ctx, op = {}) {
  const { stopOnException = true } = op
  if (t.state !== 'pending') return t
  t.state = 'running'
  t.startTime = process.hrtime.bigint()

  if (!t.caller && t.stack && ctx.callstack) {
    for (const frame of ctx.callstack({ error: { stack: t.stack }, smartFilter: false }).stack) {
      if (!INTERNAL.test(frame.file) && !INTERNAL.test(frame.func)) { t.caller = frame; break }
    }
  }

  const saved = ctx.check.test
  ctx.check.test = t
  try {
    const context = {
      ...(t.context || {}),
      check: ctx.check.bind(t),
      checkFail: ctx.check.checkFail.bind(t),
      checkException: ctx.check.checkException.bind(t),
      test: test.bind(t),
      log:   (...a) => t.output.push(['log', a]),
      debug: (...a) => t.output.push(['debug', a]),
    }
    const r = t.fn.call(t, context)
    if (r instanceof Promise) await r

    for (const child of t.tests) {
      await runTest(child, ctx, op)
      if (stopOnException && child.state === 'exception') { t.state = 'exception'; break }
    }

    if (t.state === 'running')
      t.state = (t.checks.some(c => c.state !== 'passed') || t.tests.some(c => ['failed','exception'].includes(c.state)))
        ? 'failed' : 'passed'
  } catch (e) {
    t.state = 'exception'
    t.error = e
  } finally {
    ctx.check.test = saved
    t.endTime  = process.hrtime.bigint()
    t.duration = Number(t.endTime - t.startTime) / 1e6
  }
  return t
}

export function summary(t) {
  const s = { passed: 0, failed: 0, exception: 0, total: 0 }
  for (const c of (t.checks || [])) { s[c.state] = (s[c.state] || 0) + 1; s.total++ }
  if (t.tests?.length) {
    for (const child of t.tests) {
      const cs = summary(child)
      s.passed += cs.passed; s.failed += cs.failed; s.exception += cs.exception; s.total += cs.total
    }
  } else if (s.total === 0 && t.state && !['pending','running'].includes(t.state)) {
    s[['passed','failed','exception'].includes(t.state) ? t.state : 'passed']++
    s.total++
  }
  return s
}

// ── Report ─────────────────────────────────────────────────────────────────────
// Converts the raw serialized tree from run() into a flat Report POJO for viewer.
// Pre-computes all summaries and flattens failures — viewer becomes pure formatting.

const HOG_MS = 100

export function prepareReport(rawTree) {
  const cov = rawTree._coverage || {}
  const stats = {
    files: cov.files || 0, covered: cov.covered || 0, self: cov.self || 0, uncovered: cov.uncovered || 0,
    tests: 0, passed: 0, cached: 0, failed: 0, exception: 0, hogs: 0
  }

  const suites = (rawTree.tests || []).map(t => {
    const s = _buildSuite(t)
    stats.tests     += s._tc
    stats.passed    += s.passed
    stats.cached    += s.cached
    stats.failed    += s.failed
    stats.exception += s.exception
    stats.hogs      += s._hogs
    delete s._tc
    delete s._hogs
    return s
  })

  return { state: rawTree.state, duration: rawTree.duration || 0, stats, suites }
}

function _buildSuite(root) {
  const s = {
    name:      root.name,
    file:      root.address || root._address || '',
    state:     root.state,
    duration:  Math.round(root.duration || 0),
    fromCache: root.cached || false,
    passed: 0, cached: 0, failed: 0, exception: 0,
    _tc: 0, _hogs: 0,
    failures: [],   // { kind:'check'|'exception', check?, name?, error? }
    nodes: []       // flat depth-annotated list for v3 rendering
  }

  function walk(t, depth) {
    s._tc++
    const ic     = t.cached || t._cached
    const checks = t.checks || []

    if (!ic && (t.duration || 0) > HOG_MS) s._hogs++

    if (ic) {
      s.cached += t.checkCount || 1
    } else {
      for (const c of checks) {
        if (c.state === 'passed') s.passed++
        else {
          s[c.state] = (s[c.state] || 0) + 1
          s.failures.push({ kind: 'check', check: c })
        }
      }
      // Exception on the test node itself (not via a check)
      if (t.state === 'exception' && t.error) {
        if (!checks.length) s.exception++
        s.failures.push({ kind: 'exception', name: t.name, error: t.error })
      }
      // Leaf nodes with no checks: auto-count 1 to keep cache encoding non-zero
      if (!checks.length && !(t.tests?.length) && t.state === 'passed') s.passed++
    }

    s.nodes.push({
      depth,
      name:       t.name,
      state:      t.state,
      duration:   Math.round(t.duration || 0),
      cached:     ic,
      checkCount: ic ? (t.checkCount || 0) : undefined,
      checks,
      output:     t.output || [],
      error:      t.error ? { message: t.error.message, stack: t.error.stack } : undefined
    })

    for (const child of (t.tests || [])) walk(child, depth + 1)
  }

  walk(root, 0)
  return s
}

// ── Serialize ─────────────────────────────────────────────────────────────────
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
    op: { skip: c.op?.skip, message: c.op?.message,
          error: c.op?.error ? { message: c.op.error.message, stack: c.op.error.stack } : undefined },
  }
}

function serialize(t) {
  return {
    name:     t.name,
    state:    t.state,
    duration: Math.round(t.duration || 0),
    address:  t.address || t._address || (t.caller ? `${t.caller.file}:${String(t.caller.line).padStart(3,'0')}` : undefined),
    cached:     t._cached || false,
    checkCount: t._checkCount || 0,
    checks:     (t.checks || []).map(serializeCheck),
    output:   t.output || [],
    error:    t.error ? { message: t.error.message, stack: t.error.stack } : undefined,
    tests:    (t.tests || []).map(serialize),
  }
}
