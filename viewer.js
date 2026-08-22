import callstack from '../utils/src/callstack.js'
import cl from '../utils/src/cl.js'

const stripAnsi = s => String(s || '').replace(/\x1b\[[0-9;]*m/g, '')
// cl.gray uses dim-black (\x1b[2;30m) which is barely visible; use bright-black instead
const gray = s => `\x1b[90m${s}\x1b[39m`

function dotfill(left, fill, right, width = 80) {
  const l = stripAnsi(left).length
  const r = stripAnsi(right || '').length
  const gap = Math.max(1, width - l - r)
  return `${left}${gray(fill.repeat(gap))}${right || ''}`
}

// Lazy getters: evaluated per-access so cl.nocolor is respected at render time
export const glyphs = {
  get passed()  { return cl('g+', '✔') },
  get cached()  { return cl('y+', '✔') },
  get failed()  { return cl('r+', '✘') },
  get pending() { return gray('○')  },
  exception: '💥',
}

const RUNNER   = /utest2?\.js/i
// Match exact runner/framework filenames (anchored) and node:/bun:/internal/ prefixes.
// Avoid loose patterns like `test\.js` that would also match `io-engine.test.js`.
const INTERNAL = /^(check|runner|worker|shims|setup|withTempDir)\.js$|^utest2?\.js$|^test\.js$|node:|bun:|internal\//i

// ─── Check View ───────────────────────────────────────────────
function checkView(c, { width = 80 } = {}) {
  if (c.state === 'passed') return ''

  const errLike   = c.error || c.op?.error
  const lineCode  = c.lineCode || extractLineCode(errLike)
  const addr      = c.address  || extractAddr(errLike)

  if (c.state === 'exception') {
    const msg  = c.error?.message || String(c.error || 'exception')
    const left = `${glyphs.exception} ${msg}`
    const out  = [dotfill(left, '.', ' '+gray(addr), width)]
    const frames = extractFrames(errLike)
    const seen = new Set([addr])  // skip frames already shown in the header
    for (const f of frames.slice(0, 6)) {
      const fAddr = `${f.file}:${String(f.line).padStart(3,'0')}`
      if (seen.has(fAddr)) continue
      seen.add(fAddr)
      out.push(gray(`  ${f.func || ''}`.padEnd(2) + dotfill(' ' + (f.func || ''), '.', fAddr, width - 2)))
    }
    return out.join('\n')
  }

  const left = `${glyphs.failed} ${lineCode || 'check()'}`
  let out = dotfill(left, '.', ' '+gray(addr), width)
  if (c.a !== undefined) out += `\n  received: ${cl.red(String(c.a))}`
  if (c.b !== undefined) out += `\n  expected: ${cl.green(String(c.b))}`
  return out
}

function extractLineCode(errLike) {
  if (!errLike?.stack) return ''
  try {
    const cs = callstack({ error: errLike, smartFilter: false })
    for (let i = 0; i < cs.stack.length; i++) {
      const f = cs.stack[i]
      if (!f.file || f.file === 'native' || f.file === 'unknown') continue
      if (!INTERNAL.test(f.file)) return cs.callerLine(i) || ''
    }
  } catch {}
  return ''
}

function extractAddr(errLike) {
  if (!errLike?.stack) return ''
  try {
    const cs = callstack({ error: errLike, smartFilter: false })
    for (const f of cs.stack) {
      if (!f.file || f.file === 'native' || f.file === 'unknown') continue
      if (!INTERNAL.test(f.file)) return `${f.file}:${String(f.line).padStart(3, '0')}`
    }
  } catch {}
  return ''
}

function extractFrames(errLike) {
  if (!errLike?.stack) return []
  try {
    const cs = callstack({ error: errLike, smartFilter: false })
    const frames = []
    for (const f of cs.stack) {
      if (RUNNER.test(f.file)) break
      if (INTERNAL.test(f.file)) continue
      if (!f.file || f.file === 'unknown' || f.file === 'native') continue
      frames.push(f)
    }
    return frames
  } catch { return [] }
}

// ─── Error View ───────────────────────────────────────────────
function errorView(err, { width = 80 } = {}) {
  if (!err) return ''
  const msg    = err.message || String(err)
  const frames = extractFrames(err)
  const header = `${glyphs.exception} ${cl.red(msg.split('\n')[0])}`
  const lines  = [header]
  for (const f of frames.slice(0, 6))
    lines.push(gray(`  ${dotfill('  ' + (f.func || ''), '.', ` ${f.file}:${String(f.line).padStart(3,'0')}`, width - 2)}`))
  return lines.join('\n')
}

// ─── Summary helpers ──────────────────────────────────────────
function gatherChecks(t, out = []) {
  for (const c of t.checks || []) out.push(c)
  for (const child of t.tests || []) gatherChecks(child, out)
  return out
}

function gatherExceptions(t, out = []) {
  if (t.state === 'exception' && t.error) out.push(t)
  for (const child of t.tests || []) gatherExceptions(child, out)
  return out
}

function gatherOutput(t, out = []) {
  for (const o of t.output || []) out.push(o)
  for (const child of t.tests || []) gatherOutput(child, out)
  return out
}

const normalizeTerms = terms =>
  (Array.isArray(terms) ? terms : String(terms || '').split(/[,\s]+/))
    .map(t => String(t || '').trim().toLowerCase()).filter(Boolean)

const matchesTerms = (name = '', terms = []) =>
  !terms.length || terms.every(t => String(name || '').toLowerCase().includes(t))

function hasDeepMatch(t, terms) {
  if (matchesTerms(t?.name, terms) || matchesTerms(t?.address, terms)) return true
  return (t?.tests || []).some(c => hasDeepMatch(c, terms))
}

export { checkView }

export function summary(t) {
  const s = { passed: 0, failed: 0, exception: 0, total: 0, tests: 0 }
  if (t._cached) {
    const n = t.checkCount || 1
    if (t.state === 'exception') { s.exception++; s.total++; s.tests++ }
    else { s.passed += n; s.total += n; s.tests += t.testCount || 1 }
    return s
  }
  for (const c of (t.checks || [])) { s[c.state] = (s[c.state] || 0) + 1; s.total++ }
  if (t.tests?.length) {
    for (const child of t.tests) {
      const cs = summary(child)
      s.passed += cs.passed; s.failed += cs.failed; s.exception += cs.exception
      s.total += cs.total; s.tests += cs.tests
    }
  } else {
    s.tests++
    if (s.total === 0 && !['pending','running'].includes(t.state)) {
      const k = ['passed','failed','exception'].includes(t.state) ? t.state : 'passed'
      s[k]++; s.total++
    } else if (t.state === 'exception' && !s.exception) {
      s.exception++; s.total++
    }
  }
  return s
}

// ─── view(t) — render one test node ───────────────────────────
export function view(t, op = {}) {
  const verbosity = op.verbosity ?? 1
  const indent    = op.indent    ?? 0
  const width     = op.width     ?? process.stdout.columns ?? 80
  const pad       = '  '.repeat(indent)
  const terms     = normalizeTerms(op.nameTerms)

  if (t.state === 'pending') return ''
  if (terms.length && !hasDeepMatch(t, terms)) return ''
  // v1: show only failing/exception tests (passing accounted for in footer)
  if (verbosity <= 1 && t.state === 'passed' && !terms.length && !op.hogsOnly) return ''

  // At v1/v2: flatten entire subtree into one line. At v3: show own checks + recurse.
  const allChecks     = verbosity < 3 ? gatherChecks(t)     : (t.checks || [])
  const allExceptions = verbosity < 3 ? gatherExceptions(t) : (t.error ? [t] : [])

  const isCached    = t.cached || t._cached
  const checkCount  = t.checkCount || t._checkCount || 0
  // File-level header (indent 0, more than one check): collapse the glyph run into counts
  // ("shell.t.js ✔97 ✘3") instead of printing one glyph per check.
  const isFileHeader = indent === 0 && !isCached && allChecks.length > 1
  const passCount   = isFileHeader ? allChecks.filter(c => c.state === 'passed').length : 0
  const failCount   = isFileHeader ? allChecks.length - passCount : 0
  const checkGlyphs = isCached
    ? (t.state === 'exception' ? glyphs.exception : `${glyphs.cached}${checkCount > 1 ? checkCount : ''}`)
    : isFileHeader
      ? `${glyphs.passed}${passCount}${failCount ? ` ${glyphs.failed}${failCount}` : ''}`
      : allChecks.map(c => glyphs[c.state] || '?').join('')
  const stateGlyph  = (allChecks.length === 0 && !isCached) ? (glyphs[t.state] || '') : ''

  const addr    = t.address || (t.caller ? `${t.caller.file}:${String(t.caller.line).padStart(3,'0')}` : '')
  const tookMs  = Math.round(t.duration || 0)
  const timeTag = (isFileHeader || tookMs > 100) ? ` (${tookMs}ms)` : ''

  const lines = []
  const selfMatch = !terms.length || matchesTerms(t.name, terms) || matchesTerms(addr, terms)

  if (selfMatch) {
    const left = `${pad}${t.name} ${stateGlyph}${checkGlyphs}`
    lines.push(isFileHeader && timeTag ? dotfill(left + ' ', '-', timeTag, width) : `${left}${timeTag}`)
  }

  const allOutput = verbosity < 3 ? gatherOutput(t) : (t.output || [])
  if (selfMatch && allOutput.length && (verbosity >= 3 || t.state !== 'passed')) {
    for (const [type, args] of allOutput) {
      const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
      lines.push(`${pad}  ${gray(`[${type}] ${text}`)}`)
    }
  }

  if (selfMatch) {
    const errors = (verbosity < 3 ? allChecks : (t.checks || [])).filter(c => c.state !== 'passed')
    const hasErrors = allExceptions.length > 0 || errors.length > 0
    if (hasErrors) lines.push('')
    for (const ex of allExceptions) {
      const v = errorView(ex.error, { width: width - pad.length - 2 })
      if (v) lines.push(v.split('\n').map(l => `${pad}  ${l}`).join('\n'))
    }
    for (const chk of errors) {
      const v = checkView(chk, { width: width - pad.length - 2 })
      if (v) lines.push(v.split('\n').map(l => `${pad}  ${l}`).join('\n'))
    }
  }

  if (verbosity >= 3) {
    for (const child of (t.tests || [])) {
      const v = view(child, { ...op, indent: indent + 1 })
      if (v) lines.push(v)
    }
  }

  return lines.filter(Boolean).join('\n')
}

// ─── fullView(main) — complete output ─────────────────────────
export function fullView(main, op = {}) {
  let verbosity = op.verbosity ?? 1
  const width   = op.width    ?? process.stdout.columns ?? 80
  const title   = op.title    || '.'
  const terms   = normalizeTerms(op.nameTerms)
  const hogsOnly = op.hogsOnly ?? false
  const sum     = summary(main)
  const allPassed = sum.failed === 0 && sum.exception === 0

  if (verbosity === 0 && allPassed) return ''
  if (verbosity === 0) verbosity = 1
  if (hogsOnly && verbosity < 2) verbosity = 2

  if (verbosity === 1 && allPassed && !terms.length && !hogsOnly) {
    return `${title}: ${glyphs.passed} ${sum.total} (${Math.round(main.duration || 0)}ms)`
  }

  const hr    = `\x1b[90m${'═'.repeat(width)}\x1b[39m`
  const lines = [hr, `${cl.bold(title)} Test Results`, hr]

  const allSuites = hogsOnly
    ? (main.tests || []).filter(t => (t.duration || 0) > 100 || t.state !== 'passed')
    : (main.tests || [])
  const filtered = terms.length ? allSuites.filter(t => hasDeepMatch(t, terms)) : allSuites

  if (verbosity === 2) {
    // Compact passing row (gray inline), then full detail for failing
    const passing = filtered.filter(t => t.state === 'passed')
    const failing = filtered.filter(t => t.state !== 'passed')
    if (passing.length) {
      const inlineRow = passing.map(t => {
        const n = t._cached ? (t.checkCount || '') : gatherChecks(t).length
        return `${t.name} ${glyphs.passed}${n > 1 ? n : ''}`
      }).join('  ')
      lines.push(gray(inlineRow))
    }
    if (failing.length) {
      if (passing.length) lines.push(hr)
      for (const t of failing) {
        const v = view(t, { verbosity, width, nameTerms: terms })
        if (v) lines.push(v)
      }
    }
  } else {
    for (const t of filtered) {
      const v = view(t, { verbosity, width, nameTerms: terms })
      if (v) lines.push(v)
    }
  }

  lines.push(hr)

  const files = (main.tests || []).length
  const footLeft = [
    files             && `📄${files}`,
    sum.tests         && `🧪${sum.tests}`,
    sum.total         && `${glyphs.passed}${sum.total - sum.failed - sum.exception}`,
    sum.failed        && `${glyphs.failed}${sum.failed}`,
    sum.exception     && `${glyphs.exception}${sum.exception}`,
  ].filter(Boolean).join('  ')
  const footRight = gray(`${Math.round(main.duration || 0)}ms`)
  const gap = Math.max(1, width - stripAnsi(footLeft).length - stripAnsi(footRight).length) - 1
  lines.push(`${footLeft}${' '.repeat(gap)}${footRight}`)

  return lines.join('\n')
}

export default { view, fullView, summary, glyphs }
