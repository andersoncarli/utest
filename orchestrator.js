// orchestrator.js — Orchestrate parallel test execution using workers.

import path from 'path'
import { fileURLToPath } from 'url'
import { prepareReport } from './runner.js'

export async function runManifest(manifest, options = {}) {
  const { force = false, stopOnException = false, onResult, workers = 4 } = options
  const cwd = manifest._TARGET || process.cwd()
  const isTest = n => /\.(t|test|tuit|it)\.(js|ts)$/.test(n)

  const filesToRun = []
  const results = { state: 'passed', duration: 0, stats: null, suites: [] }
  const start = process.hrtime.bigint()

  const cachedTest = (name, abs, checkCount) => {
    return { name, address: abs, state: 'passed', cached: true, checkCount, tests: [], checks: [], output: [] }
  }

  for (const [rel, entry] of Object.entries(manifest)) {
    if (rel.startsWith('_')) continue
    if (entry.tests) {
      const dir = path.dirname(path.resolve(cwd, rel))
      for (const [testName, info] of Object.entries(entry.tests)) {
        const abs = path.join(dir, testName)
        if (typeof info.cache === 'number' && !force) {
          const t = cachedTest(testName, abs, info.cache)
          const suite = prepareReport({ tests: [t] }).suites[0]
          results.suites.push(suite)
          if (onResult) onResult(suite)
        } else filesToRun.push(abs)
      }
    } else if (isTest(rel) || typeof entry.cache === 'number') {
      const abs = path.resolve(cwd, rel)
      if (typeof entry.cache === 'number' && !force) {
        const t = cachedTest(path.basename(rel), abs, entry.cache)
        const suite = prepareReport({ tests: [t] }).suites[0]
        results.suites.push(suite)
        if (onResult) onResult(suite)
      } else filesToRun.push(abs)
    }
  }

  if (filesToRun.length > 0) {
    const queue = [...filesToRun]
    const active = new Set()
    const workerCount = Math.min(workers, queue.length)
    
    await new Promise((resolve) => {
      const spawnWorker = async () => {
        if (queue.length === 0) {
          if (active.size === 0) resolve()
          return
        }
        const abs = queue.shift()
        const proc = Bun.spawn(['bun', fileURLToPath(new URL('./child-worker.js', import.meta.url)), abs], {
          stdout: 'pipe',
          stderr: 'inherit'
        })
        active.add(proc)
        
        try {
          const text = await new Response(proc.stdout).text()
          if (text) {
            const msg = JSON.parse(text)
            if (msg.type === 'result') {
              const suite = prepareReport(msg.results).suites[0]
              if (suite) {
                results.suites.push(suite)
                if (onResult) onResult(suite)
              }
            } else if (msg.type === 'error') {
              console.log(`[utest:runner] Worker error for ${msg.abs}:`, msg.error.message)
            }
          }
        } catch (e) {
          console.log(`[utest:runner] Failed to parse worker output for ${abs}:`, e.message)
        }
        
        active.delete(proc)
        spawnWorker()
      }
      for (let i = 0; i < workerCount; i++) spawnWorker()
    })
  }

  results.duration = Number(process.hrtime.bigint() - start) / 1e6
  
  const entries = Object.entries(manifest).filter(([k]) => !k.startsWith('_'))
  const allRel = entries.map(([k]) => k)
  const fCount = allRel.filter(n => !isTest(n)).length
  const cCount = entries.filter(([, v]) => v.tests || typeof v.cache === 'number').length

  const rawTree = { 
    state: results.suites.some(s => s && ['failed', 'exception'].includes(s.state)) ? 'failed' : 'passed',
    duration: results.duration,
    tests: results.suites.filter(Boolean).map(s => ({ ...s, state: s.state })),
    _coverage: { files: fCount, covered: cCount, uncovered: fCount - cCount }
  }
  
  const finalReport = prepareReport(rawTree)
  finalReport.suites = results.suites
  return finalReport
}
