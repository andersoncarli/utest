#!/usr/bin/env bun
/**
 * test.run.js — Independent per-file test runner
 *
 * Each test file runs in its own subprocess (true process isolation).
 * Outputs a JSON report consumed by test.ui.js or any tooling.
 *
 * CLI modes:
 *   bun utils/test.run.js [--phase unit] [--parallel] [filter]
 *       Discover + run all matching files, output JSON report to stdout.
 *
 *   bun utils/test.run.js --exec <file>
 *       Run a single file (called internally by the orchestrator).
 *       Outputs one JSON object to stdout.
 *
 *   bun utils/test.run.js --list [--phase unit] [filter]
 *       Print discovered file paths as a JSON array and exit.
 *
 * Pipe to test.ui.js for display:
 *   bun utils/test.run.js | bun utils/test.ui.js
 */

import '../globals.d.js'
import errorView from '../src/errorView.js'
import checkView from '../src/checkView.js'
import dotfill from '../src/dotfill.js'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

// ── Config ───────────────────────────────────────────────────────────────────

let _config
function getConfig() {
  if (_config) return _config
  try {
    const p = path.join(ROOT, 'TEST.yaml')
    if (fs.existsSync(p)) _config = yaml.parse(fs.readFileSync(p, 'utf8'))
  } catch { }
  return (_config = _config || {})
}

function globToRegex(glob) {
  const res = glob
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\*\\\*\//g, '(?:.*/)?')
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^/]*')
    .replace(/\\\?/g, '.')
  return new RegExp(`^${res}$`)
}

function matchesPattern(rel, patterns = []) {
  return patterns.some(pat => {
    try { return globToRegex(pat).test(rel) } catch { return false }
  })
}

// ── Discovery ────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '.git', 'archive', 'archive_'])
const SKIP_FILES = new Set(['index.t.js', 'test-runner.js', 'test.run.js', 'test.ui.js'])

export function discover(options = {}) {
  const { phase = 'unit', filter = '', root = ROOT } = options
  const phaseConfig = getConfig()[phase] || {}
  const includes = phaseConfig.include || []
  const excludes = phaseConfig.exclude || []

  const filterTerms = String(filter).split(/\s+/).filter(Boolean)
  const matchesFilter = (rel) =>
    !filterTerms.length || filterTerms.some(t => rel.includes(t))

  const files = []

  function walk(dir) {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      const rel = path.relative(root, full)
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue
        if (matchesPattern(rel, excludes)) continue
        walk(full)
      } else {
        if (SKIP_FILES.has(ent.name)) continue
        const isTest = /\.(t|test)\.(js|ts)$/.test(ent.name)
        const isTuit = /\.tuit$/.test(ent.name)
        if (!isTest && !isTuit) continue
        if (includes.length && !matchesPattern(rel, includes)) continue
        if (matchesPattern(rel, excludes)) continue
        if (!matchesFilter(rel)) continue
        files.push(rel)
      }
    }
  }

  walk(root)
  return files.sort()
}

// ── Serialization ────────────────────────────────────────────────────────────

function serializeCheck(c) {
  return {
    state: c.state,
    received: c.a !== undefined ? String(c.a) : undefined,
    expected: c.b !== undefined ? String(c.b) : undefined,
    message: c.op?.message || undefined,
    address: c.address || undefined,
  }
}

function serializeTest(t) {
  const addr = t.address
    || (t.caller ? `${t.caller.file}:${String(t.caller.line).padStart(3, '0')}` : undefined)
  return {
    name: t.name,
    state: t.state,
    duration: Math.round(t.duration || 0),
    address: addr,
    checks: (t.checks || []).map(serializeCheck),
    output: (t.output || []),
    error: t.error ? { message: t.error.message, stack: t.error.stack } : undefined,
    tests: (t.tests || []).map(serializeTest),
  }
}

export function computeSummary(node) {
  const s = { passed: 0, failed: 0, exception: 0, total: 0 }
  for (const c of node.checks || []) {
    s[c.state] = (s[c.state] || 0) + 1
    s.total++
  }
  // Count bare test-level failure/exception when no checks captured it
  const hasFailingCheck = (node.checks || []).some(c => c.state !== 'passed')
  if (!hasFailingCheck && (node.state === 'failed' || node.state === 'exception')) {
    s[node.state]++
    s.total++
  }
  for (const child of node.tests || []) {
    const cs = computeSummary(child)
    s.passed += cs.passed
    s.failed += cs.failed
    s.exception += cs.exception
    s.total += cs.total
  }
  return s
}

// ── Source-file pairing & mtime convention ───────────────────────────────────
// After a test run, the SOURCE file's mtime is set relative to the TEST file's mtime:
//
//   passed   → src mtime = test mtime       (diff test−src = 0)
//   failed   → src mtime = test mtime − 1s  (diff test−src = 1)
//   exception→ src mtime = test mtime − 2s  (diff test−src = 2)
//
// On the next run (without --force), if diff is 0/1/2 the pair is "aligned"
// and the test is skipped, returning the cached state.
// Any real edit to src or test moves mtime outside 0/1/2 → forced re-run.

function findSourceFile(absTestPath) {
  const dir = path.dirname(absTestPath)
  const base = path.basename(absTestPath)
  const variants = [
    base.replace(/\.integration\.t\.(js|ts)$/, '.$1'),
    base.replace(/\.t\.(js|ts)$/, '.$1'),
    base.replace(/\.test\.(js|ts)$/, '.$1'),
    base.replace(/\.tuit$/, '.ts'),
    base.replace(/\.tuit$/, '.js'),
  ].filter(v => v !== base)
  for (const v of variants) {
    const full = path.join(dir, v)
    if (fs.existsSync(full)) return full
  }
  return path.join(ROOT, 'TEST.yaml')
}

const toSec = (ms) => Math.floor(ms / 1000)

function getCachedState(absTestPath) {
  try {
    const src = findSourceFile(absTestPath)
    if (!src) return null
    const testStat = fs.statSync(absTestPath)
    const srcStat = fs.statSync(src)

    const diff = toSec(testStat.mtimeMs) - toSec(srcStat.mtimeMs)
    const testMs = testStat.mtime.getMilliseconds()

    if (diff === 0) return { state: 'passed', count: testMs, line: 0 }
    if (diff >= 1 && diff < 10000) return { state: 'failed', count: testMs, line: diff - 1 }
    if (diff >= 10000) return { state: 'exception', count: testMs, line: diff - 10000 }

    return null
  } catch { return null }
}

function updateCacheState(absTestPath, state, count = 1, line = 0) {
  try {
    const src = findSourceFile(absTestPath)
    if (!src) return
    const srcStat = fs.statSync(src)

    const baseSec = toSec(srcStat.mtimeMs)
    const targetMs = Math.min(count, 999)
    let offset = 0
    if (state === 'failed') offset = 1 + line
    else if (state === 'exception') offset = 10000 + line

    const targetTestSec = baseSec + offset
    const testMtime = new Date(targetTestSec * 1000 + targetMs)

    fs.utimesSync(absTestPath, testMtime, testMtime)
  } catch { }
}

// ── Exec mode: run one file, emit JSON to stdout ─────────────────────────────

async function execTuit(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(ROOT, filePath)
  const rel = path.relative(ROOT, abs)
  const startMs = Date.now()

  // Pure Pixel pipeline — no Widget, no mapPojoToWidget
  const { runTuitFile } = await import('../soml/v1/tui/tuit-runner.js')
  // Use V2 stateless renderer
  const { renderStream } = await import('../soml/plugins/tui/tui.js')

  let results = [], loadError = null
  try {
    ; ({ results } = await runTuitFile(abs, {
      renderStreamSnapshot: async (stream, opts = {}) => renderStream(stream, opts),
      updateSnapshots: process.env.UPDATE === '1'
    }))
  } catch (e) {
    loadError = { message: e.message, stack: e.stack }
  }

  const checks = (results || []).map(r => {
    // Per-block render exception: show the error message as received so it's visible inline
    if (r.error) {
      return {
        state: 'failed',
        received: `💥 ${r.error.message || String(r.error)}`,
        expected: r.expected,
        address: r.location || r.name || undefined,
      }
    }
    return {
      state: r.actual === r.expected ? 'passed' : 'failed',
      received: r.actual !== r.expected ? r.actual : undefined,
      expected: r.actual !== r.expected ? r.expected : undefined,
      address: r.location || r.name || undefined,
    }
  })

  // If a file-level exception occurred and produced no checks, synthesise one
  if (loadError && checks.length === 0) {
    checks.push({
      state: 'failed',
      received: `💥 ${loadError.message}`,
      expected: '(render should not throw)',
      address: rel,
    })
  }

  const failed = checks.filter(c => c.state !== 'passed').length
  const sum = { passed: checks.length - failed, failed, exception: loadError ? 1 : 0, total: checks.length || 1 }
  const state = failed > 0 ? 'failed' : 'passed'

  process.stdout.write(JSON.stringify({
    file: rel,
    state,
    duration: Date.now() - startMs,
    summary: sum,
    tests: [{ name: path.basename(abs), state, duration: 0, checks, output: [], tests: [] }],
    error: loadError || undefined,
  }) + '\n')
}

async function execFile(filePath) {
  if (String(filePath).endsWith('.tuit')) return execTuit(filePath)

  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(ROOT, filePath)
  const rel = path.relative(ROOT, abs)
  const startMs = Date.now()
  let loadError = null

  // Bootstrap the standard test framework
  const { default: G } = await import('../src/G.js')
  const { default: test } = await import('./test.js')
  await import('../src/core.js')

  await G._boot({
    paths: [
      path.join(ROOT, 'utils'),
      path.join(ROOT, 'pixel'),
      path.join(ROOT, 'soml'),
      path.join(ROOT, 'soml/scl'),
    ],
    global: ['test', 'is', 'check'],
    eager: ['test', 'check'],
  })
  await G._ready

  try {
    await import(`file://${abs}`)
  } catch (e) {
    loadError = { message: e.message, stack: e.stack }
  }

  if (!loadError) {
    const runner = await G.testRunner
    if (runner) await runner.run()
  }

  const sum = computeSummary(test.main)
  const state = loadError
    ? 'exception'
    : sum.exception > 0 ? 'exception'
      : sum.failed > 0 ? 'failed'
        : 'passed'

  process.stdout.write(JSON.stringify({
    file: rel,
    state,
    duration: Date.now() - startMs,
    summary: sum,
    tests: test.main.tests.map(serializeTest),
    error: loadError || undefined,
  }) + '\n')
}

// ── Run a file as an isolated subprocess ─────────────────────────────────────

const GLYPHS = {
  passed: '\x1b[32;1m✔\x1b[39;22m',
  failed: '\x1b[31;1m✘\x1b[39;22m',
  exception: '💥',
  skipped: '\x1b[2m○\x1b[22m',
}

const TIMEOUT_MS = 15000

export function runFile(rel, { onProgress, timeout = TIMEOUT_MS, force = false } = {}) {
  const absTestPath = path.resolve(ROOT, rel)

  // Skip if source file is unchanged since last run (checks test and src mtime offset)
  if (!force) {
    const cached = getCachedState(absTestPath)
    if (cached) {
      const result = {
        file: rel,
        state: cached.state, // return the original state
        duration: 0,
        summary: {
          passed: cached.state === 'passed' ? (cached.count || 1) : 0,
          failed: cached.state === 'failed' ? (cached.count || 1) : 0,
          exception: cached.state === 'exception' ? (cached.count || 1) : 0,
          total: cached.count || 1,
          skipped: true
        },
        tests: [],
      }
      onProgress?.(result)
      return Promise.resolve(result)
    }
  }

  return new Promise((resolve) => {
    const startMs = Date.now()
    const child = child_process.spawn('bun', [__filename, '--exec', rel], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let stdout = '', stderr = '', timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeout)

    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })

    child.on('close', () => {
      clearTimeout(timer)
      let result
      if (timedOut) {
        result = {
          file: rel,
          state: 'exception',
          duration: Date.now() - startMs,
          summary: { passed: 0, failed: 0, exception: 1, total: 1 },
          tests: [],
          error: { message: `Timed out after ${timeout}ms` },
        }
      } else {
        // Find the last complete JSON object in stdout (debug output may precede it)
        const jsonMatch = stdout.match(/(\{[\s\S]*\})[^}]*$/)
        try {
          result = JSON.parse(jsonMatch ? jsonMatch[1] : stdout.trim())
        } catch {
          result = {
            file: rel,
            state: 'exception',
            duration: Date.now() - startMs,
            summary: { passed: 0, failed: 0, exception: 1, total: 1 },
            tests: [],
            error: { message: `Runner crashed:\n${(stderr || stdout).slice(0, 300)}` },
          }
        }
      }

      let firstLine = 0
      const failTest = (result.tests || []).find(t => t.state !== 'passed')
      if (failTest) {
        const failCheck = (failTest.checks || []).find(c => c.state !== 'passed')
        if (failCheck && failCheck.address) {
          const match = failCheck.address.match(/:(\d+)$/)
          if (match) firstLine = parseInt(match[1], 10)
        }
      }

      updateCacheState(absTestPath, result.state, result.summary ? result.summary.total : 1, firstLine)
      onProgress?.(result)
      resolve(result)
    })
  })
}

// ── Orchestrator: run all discovered files ────────────────────────────────────

function aggregateSummary(results) {
  return results.reduce(
    (s, r) => ({
      passed: s.passed + (r.summary?.passed || 0),
      failed: s.failed + (r.summary?.failed || 0),
      exception: s.exception + (r.summary?.exception || 0),
      total: s.total + (r.summary?.total || 0),
    }),
    { passed: 0, failed: 0, exception: 0, total: 0 }
  )
}

export async function runAll(options = {}) {
  const { phase = 'all', filter = '', parallel = false, force = false, onProgress } = options

  // 'all' runs each phase sequentially
  if (phase === 'all') {
    const allResults = []
    const startMs = Date.now()
    for (const p of ['unit', 'integration', 'rendering']) {
      const sub = await runAll({ ...options, phase: p })
      allResults.push(...sub.files)
    }
    const total = aggregateSummary(allResults)
    return {
      phase: 'all',
      duration: Date.now() - startMs,
      summary: total,
      state: total.exception > 0 ? 'exception' : total.failed > 0 ? 'failed' : 'passed',
      files: allResults,
    }
  }

  const files = discover({ phase, filter })
  const startMs = Date.now()
  const results = []

  const runOpts = { onProgress, force }
  if (parallel) {
    results.push(...await Promise.all(files.map(f => runFile(f, runOpts))))
  } else {
    for (const f of files) {
      results.push(await runFile(f, runOpts))
    }
  }

  const total = aggregateSummary(results)
  return {
    phase,
    duration: Date.now() - startMs,
    summary: total,
    state: total.exception > 0 ? 'exception' : total.failed > 0 ? 'failed' : 'passed',
    files: results,
  }
}

// ── CLI entry ─────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename
if (isMain) {
  // Parse args — flags that take a value must be listed here
  const OPTS_WITH_VALUE = new Set(['phase', 'exec', 'verbosity', 'v'])
  const args = process.argv.slice(2)
  const flags = {}, opts = {}, positional = []
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      if (OPTS_WITH_VALUE.has(key) && i + 1 < args.length) {
        opts[key] = args[++i]
      } else if (key.includes('=')) {
        const [k, v] = key.split('=')
        opts[k] = v
      } else {
        flags[key] = true
      }
    } else if (args[i].startsWith('-')) {
      const key = args[i].slice(1)
      if (OPTS_WITH_VALUE.has(key) && i + 1 < args.length) {
        opts[key] = args[++i]
      } else {
        flags[key] = true
      }
    } else {
      positional.push(args[i])
    }
  }

  if (flags.exec || opts.exec) {
    await execFile(opts.exec || positional[0])

  } else if (flags.list) {
    const phase = opts.phase || 'all'
    const filter = positional.join(' ')
    const files = phase === 'all'
      ? ['unit', 'integration', 'rendering'].flatMap(p => discover({ phase: p, filter }))
      : discover({ phase, filter })
    console.log(JSON.stringify([...new Set(files)], null, 2))

  } else {
    const phase = opts.phase || 'all'
    const filter = positional.join(' ')
    const parallel = !!flags.parallel
    const force = !!flags.force

    const verbosity = parseInt(opts.verbosity || '0', 10)
    const report = await runAll({
      phase, filter, parallel, force,
      onProgress: r => {
        if (r.summary?.skipped && r.state === 'passed' && verbosity === 0) return  // silent for passed skipped files unless verbosity > 0

        if (r.tests && r.tests.length) {
          const renderTree = (tests, indentLevel) => {
            const pad = '  '.repeat(indentLevel)
            for (const t of tests) {
              const checkGlyphs = (t.checks || []).map((c) => GLYPHS[c.state] || '?').join('')
              const timeTag = t.duration > 50 ? ` (${t.duration}ms)` : ''
              const icon = (t.checks && t.checks.length > 0) ? '' : GLYPHS[t.state] || GLYPHS.exception
              const addr = t.address || ''

              const left = `${pad}${t.name} ${icon}${checkGlyphs}${timeTag}`
              const width = process.stdout.columns || 80
              process.stderr.write(`${dotfill(left, cl.gray('.'), addr, width)}\n`)

              if (t.tests && t.tests.length) {
                renderTree(t.tests, indentLevel + 1)
              }
            }
          }
          renderTree(r.tests, 0)
        } else {
          const icon = GLYPHS[r.state] || GLYPHS.exception
          const dur = r.duration > 0 ? ` (${r.duration}ms)` : ''
          process.stderr.write(`  ${icon} ${r.file}${dur}\n`)
        }

        if (r.state === 'failed' || r.state === 'exception') {
          if (r.error) {
            const firstLine = (r.error.message || '').split('\n')[0].slice(0, 120)
            process.stderr.write(`    ${firstLine}\n\n`)
          } else {
            const findFirst = (tests) => {
              for (const t of tests || []) {
                if (t.state !== 'passed') {
                  const c = (t.checks || []).find(chk => chk.state !== 'passed')
                  if (c) return { type: 'check', check: c, test: t }
                  if (t.error) return { type: 'error', error: t.error, test: t }
                  const child = findFirst(t.tests)
                  if (child) return child
                }
              }
            }
            const f = findFirst(r.tests)
            if (f) {
              if (f.type === 'error') {
                const e = new Error(f.error.message)
                e.stack = f.error.stack || ''
                process.stderr.write(errorView(e, { skip: 0 }).replace(/^/gm, '    ') + '\n\n')
              } else if (f.type === 'check') {
                const c = f.check
                const chk = {
                  state: c.state,
                  a: c.received,
                  b: c.expected,
                  address: c.address || f.test.name,
                  lineCode: c.test?.name || f.test.name,
                  op: { message: c.message }
                }
                process.stderr.write(checkView(chk, { width: (process.stdout.columns || 80) - 4 }).replace(/^/gm, '    ') + '\n\n')
              }
            }
          }
        }
      },
    })

    const s = report.summary
    const parts = [`${GLYPHS.passed} ${s.passed}`]
    if (s.failed) parts.push(`${GLYPHS.failed} ${s.failed}`)
    if (s.exception) parts.push(`💥 ${s.exception}`)
    parts.push(`total ${s.passed + s.failed + s.exception}`)
    process.stderr.write(`\n${parts.join('  ')}  (${(report.duration / 1000).toFixed(1)}s)\n`)

    process.exit(report.state === 'passed' ? 0 : 1)
  }
}

export default { discover, runFile, runAll, computeSummary }
