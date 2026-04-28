#!/usr/bin/env bun
import './setup.js'
import { resolve, relative, basename } from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { scan, writeCache, writeSelfCache } from './scanner.js'
import { fullView, glyphs, summary } from './viewer.js'

// ─── Args ─────────────────────────────────────────────────────
const args      = process.argv.slice(2)
const force     = args.includes('--force') || args.includes('-f')
const uncovered = args.includes('--uncovered') || args.includes('-u')
const hogs      = args.includes('--hogs') || args.includes('-h')
const noAnsi    = args.includes('--no-ansi')
const phaseArg  = args.find(a => a.startsWith('--phase='))?.split('=')[1]
const phases    = phaseArg === 'all' ? ['unit', 'integration'] : phaseArg ? [phaseArg] : ['unit']
const timeoutArg = args.find(a => a.startsWith('--timeout=') || a.startsWith('-to='))
const timeout   = timeoutArg ? parseInt(timeoutArg.split('=')[1]) : 1000

let verbosity = 1
const _vArg = args.find(a => /^(-v)?:?([0123])$/.test(a))
if (_vArg) verbosity = parseInt(_vArg.match(/([0123])$/)[1])

const positional  = args.filter(a => !a.startsWith('-') && !/^(-v)?:?([0123])$/.test(a))
const targets     = positional.filter(a => existsSync(a) || a === '.')
const filterTerms = positional.filter(a => !targets.includes(a))
if (!targets.length) targets.push('.')

const root       = resolve(targets[0])
// TEST.yaml is always found from cwd, not from the target (target may be a subdirectory)
const configPath = [root, process.cwd()].map(d => resolve(d, 'TEST.yaml')).find(existsSync)
  || resolve(process.cwd(), 'TEST.yaml')
const title      = targets.join(', ')
const width      = parseInt(process.env.WIDTH || '') || process.stdout.columns || 80
const workerPath = fileURLToPath(new URL('./worker.js', import.meta.url))

const stripAnsi = s => String(s).replace(/\x1b\[[0-9;]*m/g, '')
const out = s => process.stdout.write((noAnsi ? stripAnsi(s) : s) + '\n')

// ─── Scan ─────────────────────────────────────────────────────
const allEntries   = []
const allUncovered = []

for (const phase of phases) {
  try {
    const { entries, uncovered: unc } = scan(root, configPath, phase)
    allEntries.push(...entries)
    allUncovered.push(...unc)
  } catch (e) {
    if (e.code !== 'ENOENT') { console.error(`[utest] scan error:`, e.message); process.exit(1) }
  }
}

// Deduplicate by path
const seen    = new Set()
const entries = allEntries.filter(e => !seen.has(e.path) && seen.add(e.path))

// ─── Split cached / toRun ─────────────────────────────────────
const cached = force ? [] : entries.filter(e => e.cache !== null)
const toRun  = entries.filter(e => !cached.includes(e))

// ─── Assemble main node ───────────────────────────────────────
const main = {
  name:     title,
  tests:    [],
  checks:   [],
  state:    'pending',
  duration: 0,
}

// Inject cached entries as pre-run test nodes
for (const e of cached) {
  main.tests.push({
    name:       basename(e.path),
    state:      e.cache.exception ? 'exception' : 'passed',
    address:    relative(root, e.path),
    cached:     true,
    _cached:    true,
    checkCount: e.cache.checks,
    duration:   0,
    checks:     [],
    tests:      [],
    output:     [],
  })
}

// ─── Parallel Execution ───────────────────────────────────────
const start = process.hrtime.bigint()

if (toRun.length > 0) {
  const queue   = [...toRun]
  const active  = new Set()
  const workers = Math.min(8, queue.length)
  const suppress = verbosity <= 1 ? suppressConsole() : null

  await new Promise(done => {
    const spawnNext = async () => {
      if (queue.length === 0) { if (active.size === 0) done(); return }
      const entry = queue.shift()
      const proc  = Bun.spawn(['bun', workerPath, entry.path, String(timeout)], { stdout: 'pipe', stderr: 'inherit' })
      active.add(proc)

      try {
        const text = await new Response(proc.stdout).text()
        if (text.trim()) {
          const msg = JSON.parse(text)
          if (msg.type === 'result') {
            // msg.results is the serialized test.main node: { name:'Main', tests:[...], state, duration }
            const node = msg.results
            node.name    = basename(entry.path)
            node.address = relative(root, entry.path)
            main.tests.push(node)

            if (entry.target) {
              if (node.state === 'passed') {
                const sum = countChecks(node)
                if (sum.tests > 0 || sum.checks > 0)
                  writeCache(entry.path, entry.target, { tests: sum.tests, checks: sum.checks })
              } else if (node.state === 'exception' || node.state === 'failed') {
                writeCache(entry.path, entry.target, { tests: 0, checks: 0, exception: true })
              }
            } else {
              // Targetless file: use self-referential file cache
              const isPass = node.state === 'passed'
              const sum = isPass ? countChecks(node) : { tests: 0, checks: 0 }
              writeSelfCache(entry.path, root, { exception: !isPass, ...sum })
            }
          } else if (msg.type === 'error') {
            main.tests.push({
              name:    basename(entry.path),
              state:   'exception',
              address: relative(root, entry.path),
              error:   msg.error,
              checks:  [], tests:  [], output: [], duration: 0,
            })
          }
        }
      } catch (e) {
        console.error(`[utest] parse error (${basename(entry.path)}):`, e.message)
      }

      active.delete(proc)
      spawnNext()
    }

    for (let i = 0; i < workers; i++) spawnNext()
  })

  if (suppress) restoreConsole(suppress)
}

main.duration = Number(process.hrtime.bigint() - start) / 1e6
const sum = summary(main)
main.state = sum.exception > 0 ? 'exception' : sum.failed > 0 ? 'failed' : 'passed'

// ─── Uncovered ────────────────────────────────────────────────
if (uncovered && allUncovered.length) {
  out(glyphs.failed + ' Uncovered:')
  for (const f of allUncovered) out(`  ${relative(root, f)}`)
}

// ─── Render ───────────────────────────────────────────────────
const report = fullView(main, { verbosity, width, title, nameTerms: filterTerms, hogsOnly: hogs })
if (report) out(report)

process.exit(main.state === 'passed' ? 0 : 1)

// ─── Helpers ──────────────────────────────────────────────────
function countChecks(node) {
  let checks = 0, tests = 0
  const walk = t => {
    checks += (t.checks || []).filter(c => c.state === 'passed').length
    if (!(t.tests?.length)) tests++
    for (const child of t.tests || []) walk(child)
  }
  for (const t of node.tests || []) walk(t)
  return { checks, tests }
}

function suppressConsole() {
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info }
  console.log = console.error = console.warn = console.info = () => {}
  return orig
}

function restoreConsole(orig) { Object.assign(console, orig) }
