import './setup.js'
import { test } from './test.js'
import { loadFile, run } from './runner.js'

const abs     = process.argv[2]
const timeout = parseInt(process.argv[3] || '1000')
if (!abs) process.exit(1)

try {
  test.main.tests = []
  test.main.state = 'pending'

  await loadFile(abs)
  const results = await run(test.main, { timeout })

  process.stdout.write(JSON.stringify({ type: 'result', abs, results }))
} catch (e) {
  process.stdout.write(JSON.stringify({ type: 'error', abs, error: { message: e.message, stack: e.stack } }))
}
process.exit(0)
