/**
 * viewer.js — Phase 3: Pure Renderer
 *
 * Input:  Report POJO from runner.prepareReport()
 *   report.stats    — pre-computed aggregates for the footer
 *   report.suites[] — one entry per test file
 *     suite.passed/failed/exception — check-level counts
 *     suite.failures[]              — pre-flattened for v1/v2
 *     suite.nodes[]                 — flat depth-annotated tree for v3
 *
 * Output: formatted string. No logic — pure data-to-string.
 */
import path from 'path'

export const glyphs = {
  file:      '📄',
  test:      '🧪',
  hog:       '⏳',
  exception: '💥',
  passed:    '\x1b[32;1m✔\x1b[39;22m',
  cached:    '\x1b[33;1m✔\x1b[39;22m',
  failed:    '\x1b[31;1m✘\x1b[39;22m',
  covered:   '\x1b[32m●\x1b[39m',
  uncovered: '\x1b[31m○\x1b[39m',
}

const stripAnsi = s => String(s || '').replace(/\x1b\[[0-9;]*m/g, '')

// ── Rendering deps (lazy G load) ──────────────────────────────────────────────
let _deps
async function getDeps() {
  if (_deps) return _deps
  if (!globalThis.G) return _deps = {
    cl:        { gray: s => s, bold: s => s, red: s => s, cyan: s => s },
    dotfill:   (a, _, b, w) => { const g = Math.max(1, w - stripAnsi(a).length - stripAnsi(b||'').length); return `${a}${' '.repeat(g)}${b||''}` },
    checkView: c => `${glyphs[c.state]||'?'} ${c.lineCode||'check'}`,
    errorView: e => e?.stack || e?.message || String(e)
  }
  const [cl, dotfill, checkView, errorView] = await Promise.all([G.cl, G.dotfill, G.checkView, G.errorView])
  return _deps = { cl, dotfill, checkView, errorView }
}

// ── Footer ────────────────────────────────────────────────────────────────────
function renderFooter(stats, duration, width) {
  const { files, covered, uncovered, tests, passed, cached, failed, exception, hogs } = stats
  const covPct = files ? Math.round(covered / files * 100) : 0
  const left = [
    files                && `${glyphs.file}${files}`,
    covered              && `${glyphs.covered}${covered}(${covPct}%)`,
    uncovered            && `${glyphs.uncovered}${uncovered}`,
    tests                && `${glyphs.test}${tests}`,
    (passed + cached)    && `${glyphs.passed}${passed + cached}`,
    failed               && `${glyphs.failed}${failed}`,
    exception            && `${glyphs.exception}${exception}`,
  ].filter(Boolean).join('  ')
  const right = [hogs && `${glyphs.hog}${hogs}`, `(${Math.round(duration)}ms)`].filter(Boolean).join(' ')
  const gap = Math.max(1, width - stripAnsi(left).length - stripAnsi(right).length)
  return `${left}${' '.repeat(gap)}${right}`
}

// ── Suite: compact inline  "AIChat.t.js ✔13" ─────────────────────────────────
function suiteInline(s) {
  const name  = path.basename(s.file) || s.name
  const total = s.passed + s.cached
  const g     = (s.fromCache || (s.passed === 0 && s.cached > 0)) ? glyphs.cached : glyphs.passed
  return `${name} ${g}${total > 1 ? total : ''}`
}

// ── Suite: one-line header  "G ✔40✘2 (264 ms)  G.t.js" ──────────────────────
function suiteHeader(s, { cl }) {
  const file  = path.basename(s.file)
  const total = s.passed + s.cached
  let counts  = ''
  if (total)       counts += `${glyphs.passed}${total > 1 ? total : ''}`
  if (s.failed)    counts += `${glyphs.failed}${s.failed > 1 ? s.failed : ''}`
  if (s.exception) counts += glyphs.exception
  const timeTag = s.duration > 100 ? ` (${s.duration} ms)` : ''
  return `${s.name} ${counts}${timeTag}  ${cl.gray(file)}`
}

// ── Suite: failure detail lines (v1/v2) ───────────────────────────────────────
function suiteFailureLines(s, { cl, checkView, errorView }, width) {
  const lines = []
  const pad   = '  '
  const wrap  = l => `\x1b[40m${l}\x1b[K\x1b[49m`

  for (const f of s.failures) {
    if (f.kind === 'exception') {
      const msg = f.error?.message || String(f.error)
      lines.push(wrap(`${pad}${glyphs.exception} ${cl.red(msg)}`))
      const stack = (f.error?.stack || '').split('\n').slice(1)
        .filter(l => l.trim() && !/node:|bun:|utest\/runner|utest\/shims/.test(l))
        .slice(0, 6)
      for (const l of stack) lines.push(wrap(`${pad}  ${cl.gray(l.trim())}`))
    } else {
      const v = checkView(f.check, { width: width - 4 })
      if (v) lines.push(...v.split('\n').map(l => wrap(`${pad}${l}`)))
    }
  }
  return lines
}

// ── Suite: full node tree (v3) ────────────────────────────────────────────────
function suiteNodeLines(s, { cl, dotfill, checkView, errorView }, width) {
  const lines = []
  const wrap  = l => `\x1b[40m${l}\x1b[K\x1b[49m`

  for (const node of s.nodes) {
    if (node.state === 'pending') continue
    const pad    = '  '.repeat(node.depth)
    const file   = node.depth === 0 ? path.basename(s.file) : ''
    const checks = node.checks || []

    let counts = ''
    if (node.cached) {
      const n = node.checkCount || 0
      counts = `${glyphs.cached}${n > 1 ? n : ''}`
    } else {
      const passed = checks.filter(c => c.state === 'passed').length
      const failed = checks.filter(c => c.state === 'failed').length
      const excep  = checks.filter(c => c.state === 'exception').length
      if (passed) counts += `${glyphs.passed}${passed > 1 ? passed : ''}`
      if (failed) counts += `${glyphs.failed}${failed > 1 ? failed : ''}`
      if (excep || node.state === 'exception') counts += glyphs.exception
      if (!checks.length && node.state !== 'exception')
        counts = glyphs[node.state] || ''
    }

    const timeTag = node.duration > 100 ? ` (${node.duration} ms)` : ''
    const left    = `${pad}${node.name} ${counts}${timeTag}`
    lines.push(dotfill(left, cl.gray('.'), cl.gray(file), width))

    for (const [type, args] of (node.output || [])) {
      const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
      lines.push(`${pad}  ${cl.gray(`[${type}] ${text}`)}`)
    }

    if (node.state === 'exception' && node.error) {
      const err = errorView(node.error, { width: width - pad.length - 2 })
      if (err) lines.push(...err.split('\n').map(l => wrap(`${pad}  ${l}`)))
    }

    for (const chk of checks.filter(c => c.state !== 'passed')) {
      const v = checkView(chk, { width: width - pad.length - 4 })
      if (v) lines.push(...v.split('\n').map(l => wrap(`${pad}  ${l}`)))
    }
  }
  return lines
}

// ── Main render ───────────────────────────────────────────────────────────────
export async function render(report, op = {}) {
  let verbosity  = op.verbosity ?? 1
  const width    = op.width ?? process.stdout.columns ?? 80
  const title    = op.title || '.'
  const terms    = String(op.nameTerms || '').toLowerCase().split(/\s+/).filter(Boolean)
  const hogsOnly = op.hogsOnly ?? false

  const { stats, suites = [], state, duration } = report
  const allPassed = state === 'passed'

  if (verbosity === 0 && allPassed) return ''
  if (verbosity === 0) verbosity = 1
  if (hogsOnly && verbosity < 2) verbosity = 2

  const deps = await getDeps()
  const { cl } = deps

  if (verbosity === 1 && allPassed && !terms.length && !hogsOnly) {
    return `${title}: ${glyphs.passed} ${stats.passed + stats.cached} (${Math.round(duration)}ms)`
  }

  const hr    = `\x1b[90m${'═'.repeat(width)}\x1b[39m`
  const lines = [hr, cl.bold(`${title} Test Results`), hr]

  const visible = terms.length
    ? suites.filter(s => terms.every(t => s.name.toLowerCase().includes(t) || s.file.toLowerCase().includes(t)))
    : suites

  const passing  = visible.filter(s => s.state === 'passed')
  const failing  = visible.filter(s => s.state !== 'passed')
  const showPass = hogsOnly ? passing.filter(s => s.duration > 100) : passing

  if (verbosity >= 3) {
    for (const s of [...failing, ...showPass]) {
      lines.push(...suiteNodeLines(s, deps, width))
      if (s.state !== 'passed') lines.push(`\x1b[40m\x1b[K\x1b[49m`)
    }
  } else {
    if (verbosity >= 2 && showPass.length)
    lines.push(cl.gray(showPass.map(suiteInline).join(verbosity >= 2 ? '  ' : ', ')))

    if (failing.length) {
      if (showPass.length) lines.push(hr)
      for (const s of failing) {
        lines.push(suiteHeader(s, deps))
        lines.push(...suiteFailureLines(s, deps, width))
        lines.push(`\x1b[40m\x1b[K\x1b[49m`)
      }
    }
  }

  lines.push(hr)
  lines.push(renderFooter(stats, duration, width))

  return lines.join('\n')
}

export async function warmDeps() {
  await getDeps()
}

export function renderSuite(s, op = {}) {
  const verbosity = op.verbosity ?? 1
  const width = op.width ?? process.stdout.columns ?? 80
  const deps = _deps 
  if (!deps) return '' // Should call warmDeps first
  const { cl } = deps

  if (s.state === 'passed') {
    if (verbosity < 2) return ''
    return suiteInline(s)
  }

  const lines = [suiteHeader(s, deps)]
  if (verbosity >= 3) lines.push(...suiteNodeLines(s, deps, width))
  else lines.push(...suiteFailureLines(s, deps, width))
  lines.push(`\x1b[40m\x1b[K\x1b[49m`)
  return lines.join('\n')
}

export default { render, renderSuite, warmDeps, glyphs }
