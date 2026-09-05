import { readFileSync, readdirSync, existsSync } from "fs"
import { join, relative, dirname, basename } from "path"
import { parse } from "bun:yaml"
import { Minimatch } from "minimatch"
import { TestCache } from "./cache.js"
import { testRe, stripKind } from "./kinds.js"


// ─── File Walking ──────────────────────────────────────────────
// Devolve os arquivos de TESTE (o que o include seleciona) e os de FONTE (todo
// `.js`/`.ts` que sobrou, fora dos excludes). A cobertura precisa dos dois: um
// walk que só colhia o include deixava `sourceFiles` sempre vazio, e portanto
// `uncovered` também — o `--uncovered` não tinha como reportar nada.
const SOURCE_RE = /\.(js|ts)$/

function walk(dir, root, filter, out = { tests: [], sources: [] }) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const abs = join(dir, e.name)
    const rel = relative(root, abs)
    if (e.isDirectory()) {
      if (!filter.excluded(rel)) walk(abs, root, filter, out)
      continue
    }
    // Quem decide se é TESTE é o KIND (`.t.js`, `.tuit`, …), não o include. Um
    // `include: '**/*.js'` (a fase `unit` deste repo) casa a fonte junto, e mandá-la
    // para `tests` a fazia sumir das DUAS listas — `sourceFiles` vazio, `uncovered`
    // sempre zero, cobertura sempre 100%.
    if (filter.excluded(rel)) continue
    if (filter.included(rel) && testRe().test(e.name)) out.tests.push(abs)
    else if (SOURCE_RE.test(e.name)) out.sources.push(abs)
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

// ─── Test-to-Target Pairing ───────────────────────────────────
// Um `.eval.js` também tem alvo, e pela mesma regra: `slider.eval.js` prova
// `slider.js`. Quando não há um `.js` de mesmo nome-base — o caso de um roteiro
// de feature `N.F.eval.js`, cujo assunto é uma STRING passada a `render()` — o
// alvo é o `N.F-*.md` da feature, e é o `files:` desse `.md` que a fase `eval`
// caminha como grafo de dependência (`utest.js#runPhase` passa `extraDeps`).
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
    name.replace(/\.eval\.js$/, '.js'),
  ]) {
    if (v !== name) candidates.add(v)
  }

  // Progressive strip: a.b.c.t.js → a.b.js → a.js. `stripKind` não conhece
  // `eval` (registrá-lo global contaminaria `kinds.t.js`), então o `.eval.js`
  // é descascado aqui, na origem.
  const base  = name.endsWith('.eval.js') ? name.slice(0, -'.eval.js'.length) : stripKind(name)
  const parts = base.split('.')
  for (let i = parts.length - 1; i >= 1; i--)
    candidates.add(parts.slice(0, i).join('.') + '.js')

  for (const v of candidates) {
    if (v === name) continue
    const full = join(dir, v)
    if (existsSync(full)) return full
  }

  // Sem `.js` de mesmo nome-base: para um `.eval.js`, o alvo é o `.md` irmão —
  // `<base>.md` ou o glob `<base>-<slug>.md` (o nome de feature do sprint-cli).
  if (name.endsWith('.eval.js')) {
    const exact = join(dir, base + '.md')
    if (existsSync(exact)) return exact
    try {
      const md = readdirSync(dir).find(f => f.startsWith(base + '-') && f.endsWith('.md'))
      if (md) return join(dir, md)
    } catch {}
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
  const walked      = walk(root, root, filter)

  const isTest      = f => testRe().test(basename(f))
  const testFiles   = walked.tests.filter(isTest)
  const sourceFiles = walked.sources.filter(f => !isTest(f))

  const cache = TestCache(root)
  const entries = testFiles.map(path => {
    const target = findTarget(path)
    return { path, target, cache: cache.read(path, target, { phase }) }
  })

  const covered   = new Set(entries.map(e => e.target).filter(Boolean))
  const uncovered = sourceFiles.filter(f => !covered.has(f))

  return { entries, uncovered, cache }
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
