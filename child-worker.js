import './setup.js'

const abs = process.argv[2]
if (!abs) process.exit(1)

try {
  const { test } = await import('./test.js')
  const { loadFile, run } = await import('./runner.js')
  const { G } = await import('../utils/globals.d.js')
  await G._ready
  await G('../utils/globals.d.js')
  
  test.main.tests = []
  test.main.state = 'pending'
  
  await loadFile(abs)
  const results = await run(test.main)
  
  process.stdout.write(JSON.stringify({ type: 'result', abs, results }))
} catch (e) {
  process.stdout.write(JSON.stringify({ type: 'error', abs, error: { message: e.message, stack: e.stack } }))
}
process.exit(0)
