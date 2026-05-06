import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, utimesSync, mkdirSync } from "fs"
import { join, relative, dirname, basename } from "path"
import { parse } from "bun:yaml"
import { Minimatch } from "minimatch"

const TEST_RE = /\.(t|test|tuit|it)\.(js|ts)$/

// ─── File Walking ──────────────────────────────────────────────
function walk(dir, root, filter, out = []) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const abs = join(dir, e.name)
    const rel = relative(root, abs)
    if (e.isDirectory()) {
      if (!filter.excluded(rel)) walk(abs, root, filter, out)
    } else if (filter.included(rel)) {
      out.push(abs)
    }
  }
  return out
}

// ─── Filtering ────────────────────────────────────────────────
function compileGlob(pattern) {
  // Fast path: **/*.ext → endsWith('.ext')
  if (/^\*\*\/\*[^*/]+$/.test(pattern)) {
    const suffix = pattern.slice(4) // drop '**/*'
    return rel => rel.endsWith(suffix)
  }
  // Fast path: dir/** → startsWith('dir/')
  if (!pattern.includes('*') || (pattern.endsWith('/**') && !pattern.slice(0,-3).includes('*'))) {
    const prefix = pattern.replace(/\/?\*\*$/, '')
    return rel => rel === prefix || rel.startsWith(prefix + '/')
  }
  const m = new Minimatch(pattern)
  return rel => m.match(rel)
}

function makeFilter(include, exclude) {
  const inclFns = include.map(compileGlob)
  const exclFns = exclude.map(compileGlob)
  const isIncluded = rel => inclFns.some(fn => fn(rel))
  const isExcluded = rel => exclFns.some(fn => fn(rel))
  return {
    included: rel => isIncluded(rel) && !isExcluded(rel),
    excluded: rel => isExcluded(rel)
  }
}

// ─── Cache Protocol ───────────────────────────────────────────
// On write: testMtime = floor(targetMtime/60000)*60000 + numTests*1000 + numChecks
//   checks=0, tests=0 → exception cached (sentinel)
//   checks>0 or tests>0 → pass cached
// On read:  same minute → cached; different minute → stale
export function readCache(testPath, targetPath) {
  try {
    const testMs   = statSync(testPath).mtimeMs
    const targetMs = statSync(targetPath).mtimeMs
    if (Math.floor(testMs / 60000) !== Math.floor(targetMs / 60000)) return null
    const checks = Math.round(testMs % 1000)
    const tests  = Math.round((testMs % 60000) / 1000)
    return { checks, tests, exception: checks === 0 && tests === 0 }
  } catch { return null }
}

export function bustCache(testPath) {
  try { utimesSync(testPath, new Date(0), new Date(0)) } catch {}
}

export function writeCache(testPath, targetPath, { tests, checks, exception = false }) {
  try {
    const targetMs = statSync(targetPath).mtimeMs
    const minute   = Math.floor(targetMs / 60000) * 60000
    const mtime    = exception
      ? new Date(minute)
      : new Date(minute + Math.min(tests, 59) * 1000 + Math.min(checks, 999))
    utimesSync(testPath, mtime, mtime)
  } catch {}
}

// ─── Self-referential Cache (targetless files) ────────────────
// Stores { mtime, exception, checks, tests } in .bot/.utest/<key>.json
// Cache is valid when test file mtime matches stored mtime.
function selfCacheFile(testPath, root) {
  const key = relative(root, testPath).replace(/[/\\]/g, '__')
  return join(root, '.bot', '.utest', key + '.json')
}

export function readSelfCache(testPath, root) {
  try {
    const cf = selfCacheFile(testPath, root)
    const data = JSON.parse(readFileSync(cf, 'utf8'))
    if (data.mtime !== statSync(testPath).mtimeMs) return null
    return data
  } catch { return null }
}

export function writeSelfCache(testPath, root, data) {
  try {
    const cf = selfCacheFile(testPath, root)
    mkdirSync(dirname(cf), { recursive: true })
    writeFileSync(cf, JSON.stringify({ mtime: statSync(testPath).mtimeMs, ...data }))
  } catch {}
}

// ─── Test-to-Target Pairing ───────────────────────────────────
export function findTarget(testPath) {
  const dir  = dirname(testPath)
  const name = basename(testPath)

  // Build candidate list: exact-match variants first, then progressive dot-stripping
  const candidates = new Set()
  for (const v of [
    name.replace(/\.(integration|rendering)\.t\.(js|ts)$/, '.js'),
    name.replace(/\.t\.(js|ts)$/, '.js'),
    name.replace(/\.test\.(js|ts)$/, '.js'),
    name.replace(/\.tuit$/, '.js'),
    name.replace(/\.it\.(js|ts)$/, '.js'),
  ]) {
    if (v !== name) candidates.add(v)
  }

  // Progressive strip: a.b.c.t.js → a.b.js → a.js
  const base  = name.replace(/\.(t|test|tuit|it)\.(js|ts)$/, '')
  const parts = base.split('.')
  for (let i = parts.length - 1; i >= 1; i--)
    candidates.add(parts.slice(0, i).join('.') + '.js')

  for (const v of candidates) {
    const full = join(dir, v)
    if (existsSync(full)) return full
  }
  return null
}

// ─── Pipeline ─────────────────────────────────────────────────
export function scan(root, configPath, phase = 'unit') {
  const cfg           = parse(readFileSync(configPath, 'utf8')) || {}
  const globalExclude = cfg.exclude || []
  const pcfg          = cfg[phase] || {}
  const include       = pcfg.include || ['**/*.t.js', '**/*.test.js']
  const exclude       = [...globalExclude, ...(pcfg.exclude || [])]
  const filter        = makeFilter(include, exclude)
  const all           = walk(root, root, filter)

  const testFiles   = all.filter(f => TEST_RE.test(basename(f)))
  const sourceFiles = all.filter(f => !TEST_RE.test(basename(f)))

  const entries = testFiles.map(path => {
    const target = findTarget(path)
    const cache  = target ? readCache(path, target) : readSelfCache(path, root)
    return { path, target, cache }
  })

  const covered   = new Set(entries.map(e => e.target).filter(Boolean))
  const uncovered = sourceFiles.filter(f => !covered.has(f))

  return { entries, uncovered }
}

if (import.meta.main) {
  const root       = process.argv[2] || '.'
  const configPath = process.argv[3] || 'TEST.yaml'
  const phase      = process.argv[4] || 'unit'

  const { entries, uncovered } = scan(root, configPath, phase)
  for (const e of entries) {
    const rel = relative(root, e.path)
    console.log(JSON.stringify({ [rel]: { target: e.target ? relative(root, e.target) : null, cache: e.cache } }))
  }
  if (uncovered.length)
    console.log(JSON.stringify({ _uncovered: uncovered.map(f => relative(root, f)) }))
}
