#!/usr/bin/env bun
/**
 * test.ui.js — Terminal renderer for JSON test reports
 *
 * Reads a JSON report produced by test.run.js and renders it to the terminal.
 *
 * Usage:
 *   bun utils/test.run.js | bun utils/test.ui.js          # pipe from runner
 *   bun utils/test.ui.js report.json                       # from file
 *   bun utils/test.ui.js [--phase unit] [filter]           # run + display inline
 *
 * Options:
 *   --phase <unit|integration|rendering>  (default: unit)
 *   --parallel                            run files in parallel
 *   --errors-only                         show only failing tests
 *   --verbosity <0-3>                     0=silent, 1=default, 2=checks, 3=output
 */

import '../globals.d.js'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const ansi = {
  reset: '\x1b[0m',
  bold: (s) => `\x1b[1m${s}\x1b[22m`,
  dim: (s) => `\x1b[2m${s}\x1b[22m`,
  red: (s) => `\x1b[31;1m${s}\x1b[39;22m`,
  green: (s) => `\x1b[32;1m${s}\x1b[39;22m`,
  yellow: (s) => `\x1b[33m${s}\x1b[39m`,
  gray: (s) => `\x1b[90m${s}\x1b[39m`,
  cyan: (s) => `\x1b[36m${s}\x1b[39m`,
}

const stripAnsi = (s) => String(s || '').replace(/\x1b\[[0-9;]*m/g, '')

const glyphs = {
  passed: ansi.green('✔'),
  failed: ansi.red('✘'),
  exception: '💥',
}

function dotfill(left, right, width) {
  const lw = stripAnsi(left).length
  const rw = stripAnsi(right).length
  const gap = Math.max(1, width - lw - rw)
  return `${left}${ansi.gray('.'.repeat(gap))}${right}`
}

// ── Summary count ─────────────────────────────────────────────────────────────

function sumTests(tests) {
  let p = 0, f = 0, e = 0
  function walk(t) {
    for (const c of t.checks || []) {
      if (c.state === 'passed') p++
      else if (c.state === 'failed') f++
      else if (c.state === 'exception') e++
    }
    for (const child of t.tests || []) walk(child)
  }
  for (const t of tests) walk(t)
  return { passed: p, failed: f, exception: e }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderCheck(chk, pad, width) {
  const lines = []
  const g = glyphs[chk.state] || chk.state
  if (chk.state === 'passed') return ''

  const addr = chk.address || ''
  const left = `${pad}  ${g} ${chk.message || 'check'}`
  lines.push(dotfill(left, ansi.gray(addr), width))

  if (chk.state === 'failed') {
    if (chk.received !== undefined) lines.push(`${pad}    received: ${ansi.red(chk.received)}`)
    if (chk.expected !== undefined) lines.push(`${pad}    expected: ${ansi.green(chk.expected)}`)
  }
  if (chk.state === 'exception') {
    lines.push(`${pad}    ${ansi.red(chk.message || 'exception')}`)
  }
  return lines.join('\n')
}

function renderTestNode(t, indent, width, opts) {
  const { verbosity = 1, errorsOnly = false } = opts
  const pad = '  '.repeat(indent)
  const hasIssue = t.state === 'failed' || t.state === 'exception'
  const failedChecks = (t.checks || []).filter(c => c.state !== 'passed')
  const checkGlyphs = (t.checks || []).map(c => glyphs[c.state] || '?').join('')
  const stateGlyph = (t.checks || []).length === 0 && hasIssue ? glyphs[t.state] : ''
  const timeTag = (t.duration || 0) > 100 ? ` (${t.duration}ms)` : ''

  if (t.state === 'pending') return ''
  if (errorsOnly && !hasIssue && failedChecks.length === 0) {
    // Still recurse to children
    return (t.tests || []).map(c => renderTestNode(c, indent, width, opts)).filter(Boolean).join('\n')
  }
  if (verbosity < 2 && t.state === 'passed') {
    return (t.tests || []).map(c => renderTestNode(c, indent + 1, width, opts)).filter(Boolean).join('\n')
  }

  const lines = []
  const addr = t.address || ''
  const left = `${pad}${t.name} ${stateGlyph}${checkGlyphs}${timeTag}`
  lines.push(dotfill(left, ansi.gray(addr), width))

  // Output (log/debug) at verbosity 3
  if (verbosity >= 3) {
    for (const [type, args] of (t.output || [])) {
      const prefix = type === 'debug' ? '[dbg]' : '[log]'
      const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
      lines.push(ansi.gray(`${pad}  ${prefix} ${text}`))
    }
  }

  // Test-level exception
  if (t.state === 'exception' && t.error) {
    lines.push(`${pad}  ${glyphs.exception} ${ansi.red(t.error.message || 'exception')}`)
    if (verbosity >= 2 && t.error.stack) {
      const stackLines = t.error.stack
        .split('\n').slice(1)
        .filter(l => !/node:|internal\//.test(l))
        .slice(0, 4)
        .map(l => `${pad}    ${ansi.gray(l.trim())}`)
      lines.push(...stackLines)
    }
  }

  // Failed checks at verbosity >= 1
  if (verbosity >= 1) {
    for (const chk of failedChecks) {
      const cv = renderCheck(chk, pad, width)
      if (cv) lines.push(cv)
    }
  }

  // Children
  for (const child of (t.tests || [])) {
    const cv = renderTestNode(child, indent + 1, width, opts)
    if (cv) lines.push(cv)
  }

  return lines.filter(Boolean).join('\n')
}

function renderFileResult(fileResult, width, opts) {
  const { verbosity = 1, errorsOnly = false } = opts
  const { file, state, duration, summary, tests, error } = fileResult
  const g = glyphs[state] || state
  const timeMs = duration > 100 ? ` (${duration}ms)` : ''

  const lines = []
  const left = `${g} ${ansi.bold(file)}${timeMs}`
  const sum = summary || { passed: 0, failed: 0, exception: 0, total: 0 }
  const right = sum.total > 0
    ? ansi.gray(`${sum.passed}/${sum.total}`)
    : ''
  lines.push(dotfill(left, right, width))

  // Load/runner error
  if (error) {
    lines.push(`  ${glyphs.exception} ${ansi.red(error.message || 'load error')}`)
    if (verbosity >= 2 && error.stack) {
      error.stack.split('\n').slice(1, 4).forEach(l =>
        lines.push(`    ${ansi.gray(l.trim())}`)
      )
    }
  }

  // Test details — show when there are issues or verbosity >= 2
  const hasIssue = state === 'failed' || state === 'exception'
  if (hasIssue || verbosity >= 2) {
    for (const t of (tests || [])) {
      const tv = renderTestNode(t, 1, width, opts)
      if (tv) lines.push(tv)
    }
  }

  return lines.join('\n')
}

export function render(report, opts = {}) {
  const width = opts.width ?? process.stdout.columns ?? 80
  const verbosity = opts.verbosity ?? 1
  const errorsOnly = opts.errorsOnly ?? false

  const { phase, duration, summary, state, files } = report
  const sum = summary || { passed: 0, failed: 0, exception: 0, total: 0 }

  const allPassed = sum.failed === 0 && sum.exception === 0
  if (verbosity === 0) {
    const p = phase || 'test'
    return allPassed
      ? `${p} ${glyphs.passed} ${sum.total}  ${duration}ms`
      : `${p} ${glyphs.failed} ${sum.failed + sum.exception}  ${duration}ms`
  }

  const hr = ansi.gray('═'.repeat(width))
  const lines = []

  lines.push(hr)
  lines.push(`${ansi.bold(phase || 'test')} Test Results`)
  lines.push(hr)

  for (const fr of (files || [])) {
    const hasIssue = fr.state !== 'passed'
    if (errorsOnly && !hasIssue) continue
    if (verbosity === 1 && !hasIssue) {
      // One-liner for passing files
      const timeMs = fr.duration > 100 ? ` (${fr.duration}ms)` : ''
      const sum2 = fr.summary || {}
      lines.push(dotfill(
        `${glyphs.passed} ${fr.file}${timeMs}`,
        ansi.gray(`${sum2.total || 0}`),
        width
      ))
    } else {
      lines.push(renderFileResult(fr, width, { verbosity, errorsOnly }))
    }
  }

  lines.push(hr)

  // Footer summary
  const parts = [`${glyphs.passed} ${sum.passed}`]
  if (sum.failed > 0) parts.push(`${glyphs.failed}    ${sum.failed}`)
  if (sum.exception > 0) parts.push(`${glyphs.exception} ${sum.exception}`)
  const left = parts.join('  ')
  const right = ansi.gray(`${duration}ms`)
  const gap = Math.max(1, width - stripAnsi(left).length - stripAnsi(right).length)
  lines.push(`${left}${' '.repeat(gap)}${right}`)

  return lines.join('\n')
}

// ── Read report from stdin or file ───────────────────────────────────────────

async function readReport(filePath) {
  if (filePath) {
    return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'))
  }
  // stdin
  return new Promise((resolve, reject) => {
    let buf = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', d => { buf += d })
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(buf.trim())) }
      catch (e) { reject(new Error(`Failed to parse JSON: ${e.message}`)) }
    })
    process.stdin.on('error', reject)
  })
}

// ── CLI entry ─────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename
if (isMain) {
  const args = process.argv.slice(2)
  const flags = {}, opts = {}, positional = []
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        opts[key] = args[++i]
      } else {
        flags[key] = true
      }
    } else {
      positional.push(args[i])
    }
  }

  const verbosity = opts.verbosity != null ? parseInt(opts.verbosity, 10) : 1
  const errorsOnly = !!flags['errors-only']
  const width = process.stdout.columns ?? 80

  // If no piped stdin and no file arg, run test.run.js and display output
  const hasFileArg = positional.length > 0 && positional[0].endsWith('.json') && fs.existsSync(positional[0])
  const hasPhase = !!opts.phase || !!flags.phase

  let report
  if (hasFileArg) {
    report = await readReport(positional[0])
  } else if (!process.stdin.isTTY || hasPhase) {
    // Either piped data or explicit phase given — run test.run.js inline
    if (!process.stdin.isTTY && !hasPhase) {
      // Pure pipe mode
      report = await readReport(null)
    } else {
      // Invoke test.run.js
      const { default: runner } = await import('./test.run.js')
      const phase = opts.phase || 'unit'
      const filter = positional.join(' ')
      const parallel = !!flags.parallel

      process.stderr.write(`Running ${phase} tests...\n`)
      report = await runner.runAll({
        phase, filter, parallel,
        onProgress: r => {
          const icon = r.state === 'passed' ? '✔' : r.state === 'failed' ? '✘' : '💥'
          process.stderr.write(`  ${icon} ${r.file} (${r.duration}ms)\n`)
        },
      })
    }
  } else {
    process.stderr.write('Usage: bun utils/test.ui.js [report.json]\n')
    process.stderr.write('       bun utils/test.run.js | bun utils/test.ui.js\n')
    process.stderr.write('       bun utils/test.ui.js --phase unit [filter]\n')
    process.exit(1)
  }

  console.log(render(report, { verbosity, errorsOnly, width }))
  process.exit(report.state === 'passed' ? 0 : 1)
}

export default { render, readReport }
