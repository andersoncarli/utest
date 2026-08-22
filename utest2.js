#!/usr/bin/env bun
// utest2.js — in-process test runner
//
// Architecture: scan → [import target → inject exports as ctx] → import test file
//               → runTest(t, ctx) in-process → stream/collect → cache → render
//
// Test bodies have no world outside their context argument:
//   test('hash53', ({ hash53, check }) => { check(hash53(''), 0) })
//   — hash53 comes from the target module, check from the runner. Zero imports needed.

import { G } from '../utils/globals.d.js'
await G._ready

import path from 'path'
import fs from 'fs'
import { plugin } from 'bun'

import test from './test.js'
import { check, checkFail, checkException } from './check.js'
import { scan, writeCache, writeSelfCache, bustCache } from './scanner.js'
import { view, fullView, summary, glyphs, checkView } from './viewer.js'
import { expect, describe, it, spyOn, jest, vi, mock, beforeAll, afterAll,
         beforeEach, afterEach, withTempDir} from './shims.js'

import { busReset } from '../utils/src/bus.js'

import is from '../utils/src/is.js'
import toSource from '../utils/src/toSource.js'
import callstack from '../utils/src/callstack.js'
// import normalize from '../utils/src/normalize.js'
import cl from '../utils/src/cl.js'
// import forEach   from '../utils/src/forEach.js'
import dotfill from '../utils/src/dotfill.js'

// Needed by callstack.js and cl.js internally
globalThis.fs = fs
globalThis.path = path

// Wire checkView so standalone check() calls (outside test context) render properly
check.view = (c) => checkView(c, { width: process.stdout.columns || 80 })

// ─── Base context ─────────────────────────────────────────────────────────────
// Everything a test body might need except target exports (added per file).
const baseCtx = { check, checkFail, checkException, expect, is, cl, withTempDir, spyOn, jest, vi, mock }

// ─── Globals for fn.length===0 style and file-level code ─────────────────────
for (const [k, v] of Object.entries(baseCtx)) globalThis[k] = v
Object.assign(globalThis, {
  test, describe, it, spyOn, jest, vi, mock,
  beforeAll, afterAll, beforeEach, afterEach
})
globalThis.utest = true
globalThis.utestVerbosity = 1

// ─── Plugin: redirect built-in test imports to our shims ─────────────────────
const shimsPath = new URL('./shims.js', import.meta.url).pathname
plugin({
  name: 'bun-test-shim',
  setup(build) {
    build.onLoad({ filter: /\.(t|test|tuit|it)\.(js|ts)$/ }, async (args) => {
      let code = await fs.promises.readFile(args.path, 'utf8')
      const needsShim = code.includes('bun:test') || code.includes('node:test')
      // Files that don't use bun:test/node:test don't need shim injection — some
      // declare their own `const { test } = globalThis` and an unconditional
      // import here collides with it ("test has already been declared").
      if (!needsShim) return { contents: code, loader: args.path.endsWith('.ts') ? 'ts' : 'js' }
      code = code.replace(/import\s+[\s\S]*?from\s+["'](?:bun:test|node:test)["'];?/g,
        m => m.split('\n').map(l => '// [utest-shim] ' + l).join('\n'))
      const isCjs = /\bmodule\.exports\b|\brequire\s*\(/.test(code)
      if (!isCjs) {
        const shebang = code.startsWith('#!')
          ? code.slice(0, code.indexOf('\n') + 1)
          : ''
        const body = shebang ? code.slice(shebang.length) : code
        code = shebang + `import { test, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, check } from ${JSON.stringify(shimsPath)};` + body
      }
      return { contents: code, loader: args.path.endsWith('.ts') ? 'ts' : 'js' }
    })
  }
})

// ─── In-process runner ───────────────────────────────────────────────────────
async function runTest(t, ctx, timeout = 1000) {
  if (t.state !== 'pending') return t
  t.state = 'running'
  const saved = check.test
  check.test = t
  const start = process.hrtime.bigint()

  // Build per-test context (binds check/log to this test node)
  const tCtx = {
    ...ctx,
    check: check.bind(t),
    checkFail: checkFail.bind(t),
    checkException: checkException.bind(t),
    test: test.bind(t),
    log: (...a) => t.output.push(['log', a]),
    debug: (...a) => t.output.push(['debug', a]),
  }

  try {
    const eff = t.op?.timeout || timeout
    await Promise.race([
      (async () => {
        // Describe nodes: run beforeAll hooks, children, then afterAll hooks.
        if (t._describe) {
          for (const f of t._beforeAll || []) await f()
          for (const child of t.tests) await runTest(child, ctx, timeout)
          for (const f of t._afterAll || []) try { await f() } catch { }
          return
        }
        // Leaf tests with no pre-registered children call fn now.
        if (!t.tests?.length) {
          const chain = []
          for (let p = t.parent; p; p = p.parent) chain.unshift(p)
          for (const p of chain) for (const f of p._beforeEach || []) await f()
          let r
          try {
            if (t.fn.length === 0) {
              r = t.fn.call(t)
              if (r instanceof Promise) await r
            } else if (t.fn.length === 1) {
              // Detect style from first param: ({check}) → context; (done) → callback
              const firstParam = (t.fn.toString().match(/\(([^)]*)\)/) ?? [])[1]?.trim() ?? ''
              if (firstParam.startsWith('{') || firstParam.startsWith('[')) {
                r = t.fn.call(t, tCtx)
                if (r instanceof Promise) await r
              } else {
                // done-callback style: (done) => { setTimeout(() => done()) }
                const done = new Promise((res, rej) => { r = t.fn.call(t, (e) => e ? rej(e) : res()) })
                if (r instanceof Promise) await r
                else await done
              }
            } else {
              const done = new Promise((res, rej) => {
                r = t.fn.call(t, (e) => e ? rej(e) : res(), tCtx)
              })
              await done; return
            }
          } finally {
            for (const p of [...chain].reverse()) for (const f of p._afterEach || []) await f()
          }
        }
        for (const child of t.tests) await runTest(child, ctx, timeout)
      })(),
      new Promise((_, r) => setTimeout(() => r(new Error(`Timeout (${eff}ms)`)), eff))
    ])

    if (t.state === 'running')
      t.state = (t.checks.some(c => c.state !== 'passed') || t.tests.some(c => ['failed', 'exception'].includes(c.state)))
        ? 'failed' : 'passed'
  } catch (e) {
    t.state = 'exception'; t.error = e
  } finally {
    check.test = saved
    t.duration = Number(process.hrtime.bigint() - start) / 1e6
  }
  return t
}

// ─── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
let verbosity = 1
const _vArg = args.find(a => /^(-v)?:?([0123])$/.test(a))
if (_vArg) verbosity = parseInt(_vArg.match(/([0123])$/)[1])
globalThis.utestVerbosity = verbosity

const force = args.includes('--force') || args.includes('-f')
const watch = args.includes('--watch') || args.includes('-w')
const showUnc = args.includes('--uncovered') || args.includes('-u')
const hogs = args.includes('--hogs') || args.includes('-h')
const timeoutArg = args.find(a => a.startsWith('--timeout=') || a.startsWith('-to='))
const timeout = timeoutArg ? parseInt(timeoutArg.split('=')[1]) : 1000
const positional = args.filter(a => !a.startsWith('-') && !/^(-v)?:?([0123])$/.test(a))
const filterTerms = positional.filter(a => !fs.existsSync(a))
const rawTarget = positional.find(a => fs.existsSync(a))
const _isFile = rawTarget && fs.statSync(rawTarget).isFile()
const targetDir = _isFile ? path.dirname(rawTarget) : rawTarget
const root = path.resolve(targetDir || '.')
const configPath = [root, process.cwd()].map(d => path.resolve(d, 'TEST.yaml')).find(p => fs.existsSync(p))
  || path.resolve(process.cwd(), 'TEST.yaml')
const width = parseInt(process.env.WIDTH || '') || process.stdout.columns || 80
const startAll = process.hrtime.bigint()

// ─── Scan ─────────────────────────────────────────────────────────────────────
let entries = [], uncovered = []
try {
  ; ({ entries, uncovered } = scan(root, configPath))
} catch (e) {
  if (e.code !== 'ENOENT') { console.error('[utest2] scan error:', e.message); process.exit(1) }
}
const seen = new Set()
entries = entries.filter(e => !seen.has(e.path) && seen.add(e.path))
if (_isFile) {
  const absFile = path.resolve(rawTarget)
  entries = entries.filter(e => e.path === absFile)
}

// ─── Main result node ────────────────────────────────────────────────────────
const main = { name: path.relative(process.cwd(), root) || '.', tests: [], checks: [], state: 'pending', duration: 0 }

// ─── Process each test file ───────────────────────────────────────────────────
for (const entry of entries) {
  busReset()

  // ── Cached: inject placeholder, skip execution ───────────────────────────
  // Bypass cache when filter terms are active (user wants live output/logs)
  const entryName = path.relative(root, entry.path)
  const matchesFilter = filterTerms.length === 0 ||
    filterTerms.every(t => entryName.toLowerCase().includes(t.toLowerCase()))
  const wantsLiveRun = filterTerms.length > 0 && matchesFilter
  if (!force && !wantsLiveRun && entry.cache && !entry.cache.exception) {
    main.tests.push({
      name: path.basename(entry.path),
      state: entry.cache.exception ? 'exception' : 'passed',
      address: path.relative(root, entry.path),
      cached: true, _cached: true,
      testCount: entry.cache.tests,
      checkCount: entry.cache.checks,
      duration: 0, checks: [], tests: [], output: [],
    })
    continue
  }

  // ── Build context: base utils + target module exports ────────────────────
  const ctx = { ...baseCtx }
  if (entry.target) {
    try {
      const mod = await import(entry.target)
      const baseName = path.basename(entry.target, path.extname(entry.target))
      for (const [k, v] of Object.entries(mod)) if (k !== 'default') ctx[k] = v
      if (mod.default !== undefined) {
        ctx[baseName] = mod.default   // hash53.js → ctx.hash53, cl.js → ctx.cl
        if (!ctx.default) ctx.default = mod.default
      }
    } catch { }
  }

  // ── Isolated load: test.begin() scopes all registrations to fileRoot ────
  const fileRoot = test.begin(path.basename(entry.path))

  let loadErr = null
  try {
    await import(entry.path)
  } catch (e) { loadErr = e } finally {
    test.end()
  }

  if (loadErr) {
    const node = {
      name: path.basename(entry.path), state: 'exception', error: loadErr,
      address: path.relative(root, entry.path),
      tests: [], checks: [], output: [], duration: 0,
    }
    main.tests.push(node)
    if (verbosity >= 3) { const v = view(node, { verbosity, width }); if (v) process.stdout.write(v + '\n') }
    continue
  }

  // ── Run all registered tests in-process ──────────────────────────────────
  const suite = {
    name: path.basename(entry.path),
    address: path.relative(root, entry.path),
    tests: fileRoot.tests,
    checks: [], output: [], state: 'pending', duration: 0,
  }
  const suiteStart = process.hrtime.bigint()

  for (const t of suite.tests) {
    await runTest(t, ctx, timeout)
    if (verbosity >= 3 && matchesFilter) {
      const v = view(t, { verbosity, width })
      if (v) process.stdout.write(v + '\n')
    }
  }

  suite.duration = Number(process.hrtime.bigint() - suiteStart) / 1e6
  const s = summary(suite)
  suite.state = s.exception > 0 ? 'exception' : s.failed > 0 ? 'failed' : 'passed'
  main.tests.push(suite)

  // ── Update cache ─────────────────────────────────────────────────────────
  const cacheData = { tests: s.tests, checks: s.passed, exception: suite.state === 'exception' }
  if (suite.state === 'passed') {
    if (entry.target) writeCache(entry.path, entry.target, cacheData)
    else writeSelfCache(entry.path, root, cacheData)
  } else {
    bustCache(entry.path)
  }
}

main.duration = Number(process.hrtime.bigint() - startAll) / 1e6
const finalSum = summary(main)
main.state = finalSum.exception > 0 ? 'exception' : finalSum.failed > 0 ? 'failed' : 'passed'

// ─── Render ───────────────────────────────────────────────────────────────────
if (verbosity < 3) {
  // Batch: v0/v1/v2 all go through fullView (which handles compact vs detail layout)
  const report = fullView(main, { verbosity, width, title: main.name, nameTerms: filterTerms, hogsOnly: hogs })
  if (report) process.stdout.write(report + '\n')
} else {
  // v3 streaming: tests already printed per-suite above, just show the summary footer
  const stripAnsi = s => String(s || '').replace(/\x1b\[[0-9;]*m/g, '')
  const left = [
    `${glyphs.passed} ${finalSum.total}`,
    finalSum.failed ? `${glyphs.failed} ${finalSum.failed}` : '',
    finalSum.exception ? `${glyphs.exception} ${finalSum.exception}` : '',
  ].filter(Boolean).join('  ')
  const right = `\x1b[90m${Math.round(main.duration)}ms\x1b[39m`
  const gap = Math.max(1, width - stripAnsi(left).length - stripAnsi(right).length)
  process.stdout.write(`${left}${' '.repeat(gap)}${right}\n`)
}

if (showUnc && uncovered.length) {
  process.stdout.write('\nUncovered:\n')
  for (const f of uncovered) process.stdout.write('  ' + path.relative(root, f) + '\n')
}

if (!watch) {
  process.exit(finalSum.failed > 0 || finalSum.exception > 0 ? 1 : 0)
}

// ─── Watch mode ───────────────────────────────────────────────────────────────
const runArgs = args.filter(a => a !== '--watch' && a !== '-w')
let debounce = null
let child = null
let lastChildExit = 0  // epoch ms when the last child process finished

const watchLine = () =>
  process.stdout.write(`\x1b[90mWatching ${root} — press Ctrl+C to stop\x1b[39m\n`)

const rerun = () => {
  clearTimeout(debounce)
  debounce = null
  if (child) { try { child.kill() } catch { } }
  process.stdout.write('\x1b[2J\x1b[H') // clear screen
  child = Bun.spawn(['bun', import.meta.path, ...runArgs, '--force'], {
    stdout: 'inherit', stderr: 'inherit',
  })
  // Reprint the watch line after the child finishes, and record exit time so
  // we can ignore the cache-write mtime events that follow immediately.
  child.exited.then(() => {
    lastChildExit = Date.now()
    watchLine()
  })
}

fs.watch(root, { recursive: true }, (_, filename) => {
  if (!filename) return
  // Skip for 1.5 s after a run ends — cache writes (utimesSync) trigger this too
  if (Date.now() - lastChildExit < 1500) return
  if (!/\.(js|ts|yaml|json|md)$/.test(filename)) return
  if (/node_modules|\.bot[/\\]/.test(filename)) return
  clearTimeout(debounce)
  debounce = setTimeout(rerun, 80)
})

watchLine()
await new Promise(() => { })
