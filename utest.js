#!/usr/bin/env bun
/**
 * utest.js - Universal Test Orchestrator
 *
 * Chains the three independent phases:
 *   1. scanner.js  — walk files, build test tree (zero deps)
 *   2. runner.js   — execute tree, build results POJO (G boot)
 *   3. viewer.js   — format results and print (rendering libs)
 */
import fs from 'fs'
import path from 'path'

import { test } from './scanner.js'
import { render } from './viewer.js'
import { G } from '../utils/globals.d.js'

try {

// ── CLI Arguments ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const targets = args.filter(a => !!a && !a.startsWith('-'))
const filter = args.find(a => !a.startsWith('-') && args.indexOf(a) > 0) || ''

let verbosity = 1
for (const a of args) {
  if (['-v1', '-v:1', '1'].includes(a)) verbosity = 1
  if (['-v2', '-v:2', '2'].includes(a)) verbosity = 2
  if (['-v3', '-v:3', '3'].includes(a)) verbosity = 3
}

const phaseArg = args.find(a => a.startsWith('--phase='))
const phase   = phaseArg ? phaseArg.split('=')[1] : 'all'
const titleArg = args.find(a => a.startsWith('--title='))
const title   = titleArg ? titleArg.split('=')[1] : (targets.length ? targets.join(', ') : '.')
const force    = args.includes('--force') || verbosity >= 3
const hogsOnly = args.includes('--hogs')

async function main() {
  try {
    // Reset test collector before boot to capture all registrations
    test.main.tests = []
    test.main.state = 'pending'

    await G._ready
    await G('../utils/globals.d.js')

    const phases = phase === 'all' ? ['unit', 'rendering', 'integration'] : [phase]
    const fullManifest = { 'scanner-result': { _TARGET: process.cwd(), _FILTER: '' } }

    // Phase 1: Scan
    const { getManifest } = await import('./scanner.js')
    const manifest = fullManifest['scanner-result']
    manifest._SUMMARY = { files: 0, test: 0, check: 0, expect: 0 }

    for (const p of phases) {
       const m = await getManifest(targets.length ? targets : ['.'], { filter, force, phase: p })
       if (m._FILTER) manifest._FILTER = m._FILTER

       for (const k in m) {
         if (k === '_SUMMARY') {
           manifest._SUMMARY.files += m[k].files || 0
           manifest._SUMMARY.test += m[k].test || 0
           manifest._SUMMARY.check += m[k].check || 0
           manifest._SUMMARY.expect += m[k].expect || 0
           continue
         }
         if (k.startsWith('_')) continue
         manifest[k] = m[k]
       }
    }

    // Suppress console noise during run at low verbosity
    const origConsole = verbosity < 3 ? suppressConsole(verbosity) : null

    let results
    try {
      // Phase 2: Run
      const { runManifest } = await import('./runner.js')
      results = await runManifest(manifest, { force, stopOnException: false })

      // Phase 3: View
      if (origConsole) restoreConsole(origConsole)
      const width = process.env.WIDTH ? parseInt(process.env.WIDTH) : (process.stdout.columns || 80)
      const report = await render(results, { verbosity, width, title, nameTerms: filter, hogsOnly })
      if (report) console.log(report)

      // Phase 4: Cache writeback
      if (results) {
        const fileCache = new Map()
        for (const suite of (results.suites || [])) {
          if (!suite.fromCache && suite.state === 'passed' && suite.file) {
            const abs = path.resolve(suite.file)
            fileCache.set(abs, (fileCache.get(abs) || 0) + suite.passed)
          }
        }

        for (const [abs, checks] of fileCache) {
          try {
            const src = findSourceFile(abs)
            const srcStat = fs.statSync(src)
            const T = Math.floor(srcStat.mtimeMs / 60000) * 60000

            // Update test file
            const td = new Date(T + Math.min(checks, 999))
            fs.utimesSync(abs, td, td)
          } catch {}
        }
      }
    } finally {
      if (origConsole) restoreConsole(origConsole)
    }

    const finalState = results?.state || 'failed'
    process.exit(['failed', 'exception'].includes(finalState) ? 1 : 0)
  } catch (e) {
    console.log(`\n💥 Fatal Error: ${e.message}`)
    console.log(e.stack)
    process.exit(1)
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n\x1b[31;1mUNHANDLED REJECTION:\x1b[39;22m', reason)
})
main().catch(err => { console.error(err); process.exit(1) })

} catch (e) {
  console.error("\n\x1b[31;1mCRITICAL ERROR:\x1b[39;22m")
  console.error(e)
  process.exit(1)
}

function getBasal(filename) {
  const parts = filename.split('.')
  const testIdx = parts.findIndex(p => ['t', 'test', 'tuit', 'integration', 'rendering'].includes(p))
  if (testIdx > 0) return parts.slice(0, testIdx).join('.')
  return parts[0]
}

function findSourceFile(absTestPath) {
  const dir = path.dirname(absTestPath)
  const base = path.basename(absTestPath)
  const variants = [
    base.replace(/\.(integration|rendering)\.t\.(js|ts)$/, '.js'),
    base.replace(/\.t\.(js|ts)$/, '.js'),
    base.replace(/\.test\.(js|ts)$/, '.js'),
  ].filter((v, i, a) => v !== base && a.indexOf(v) === i)
  for (const v of variants) {
    const full = path.join(dir, v)
    if (fs.existsSync(full)) return full
  }
  return absTestPath
}

function suppressConsole(verbosity) {
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info }
  console.log = (...args) => {
    if (verbosity >= 2 && args.some(a => typeof a === 'string' && a.match(/\[utest\]/))) {
      return orig.log(...args)
    }
    // Suppress others
  }
  console.error = console.warn = console.info = () => {}
  return orig
}

function restoreConsole(orig) {
  if (orig) Object.assign(console, orig)
}
