// `state.js` guarda o histórico de rodadas de scan (`.utest/STATE.jsonl` +
// projeção `.utest/STATE.yaml`) e detecta quando `TEST.yaml` mudou desde o último
// registro — o sinal que diz "o domínio mudou, considere `--force`".
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openState } from './state.js'

const dirs = []
const fixture = (yaml = 'exclude: []\nunit:\n  include: ["**/*.t.js"]\n') => {
  const dir = mkdtempSync(join(tmpdir(), 'utest-state-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'TEST.yaml'), yaml)
  return dir
}
const cleanup = () => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) }

test('openState: histórico de scans + deteção de mudança de config', ({ test }) => {

  test('primeira rodada: sem registro anterior, configChanged fica false', async ({ check }) => {
    const root = fixture()
    const state = await openState(root)
    check(state.configChanged, false)
    state.recordScan({ phase: 'unit', included: ['a.t.js'], excluded: [] })
    cleanup()
  })

  test('recordScan grava um registro por rodada; .utest/STATE.yaml projeta o último', async ({ check }) => {
    const root = fixture()
    const state = await openState(root)
    state.recordScan({ phase: 'unit', included: ['a.t.js', 'b.t.js'], excluded: ['node_modules/**'] })

    const yamlPath = join(root, '.utest', 'STATE.yaml')
    const projected = readFileSync(yamlPath, 'utf8')
    check(projected.includes('a.t.js'))
    check(projected.includes('node_modules'))
    cleanup()
  })

  test('TEST.yaml sem mudança entre rodadas: configChanged false', async ({ check }) => {
    const root = fixture()
    const state1 = await openState(root)
    state1.recordScan({ phase: 'unit', included: ['a.t.js'], excluded: [] })

    const state2 = await openState(root)
    check(state2.configChanged, false)
    cleanup()
  })

  test('TEST.yaml mudou entre rodadas: configChanged true', async ({ check }) => {
    const root = fixture()
    const state1 = await openState(root)
    state1.recordScan({ phase: 'unit', included: ['a.t.js'], excluded: [] })

    writeFileSync(join(root, 'TEST.yaml'), 'exclude: []\nunit:\n  include: ["**/*.t.js", "**/*.test.js"]\n')

    const state2 = await openState(root)
    check(state2.configChanged, true)
    cleanup()
  })

  test('depois de registrar a nova config, a rodada seguinte não acusa mais mudança', async ({ check }) => {
    const root = fixture()
    const state1 = await openState(root)
    state1.recordScan({ phase: 'unit', included: ['a.t.js'], excluded: [] })

    writeFileSync(join(root, 'TEST.yaml'), 'exclude: []\nunit:\n  include: ["**/*.t.js", "**/*.test.js"]\n')

    const state2 = await openState(root)
    check(state2.configChanged, true)
    state2.recordScan({ phase: 'unit', included: ['a.t.js'], excluded: [] })   // --force revalidou

    const state3 = await openState(root)
    check(state3.configChanged, false)
    cleanup()
  })

  test('arquivo novo ganha um registro individual e uma chave (id) única na cadeia', async ({ check }) => {
    const root = fixture()
    const state = await openState(root)
    state.recordScan({ phase: 'unit', included: ['a.t.js'], excluded: [] })

    const id = state.fileId('a.t.js')
    check(typeof id, 'string')
    check(state.fileId('never-seen.t.js'), null)
    cleanup()
  })

  test('arquivo já visto não ganha novo registro nem muda de id entre rodadas', async ({ check }) => {
    const root = fixture()
    const state1 = await openState(root)
    state1.recordScan({ phase: 'unit', included: ['a.t.js'], excluded: [] })
    const id1 = state1.fileId('a.t.js')

    const state2 = await openState(root)
    state2.recordScan({ phase: 'unit', included: ['a.t.js', 'b.t.js'], excluded: [] })

    check(state2.fileId('a.t.js'), id1)
    check(typeof state2.fileId('b.t.js'), 'string')
    check(state2.fileId('b.t.js') !== id1)
    cleanup()
  })

  test('custo zero quando desligado: enabled:false degrada no-op', async ({ check }) => {
    const root = fixture()
    const state = await openState(root, { enabled: false })
    check(state.configChanged, false)
    state.recordScan({ phase: 'unit', included: [], excluded: [] })
    cleanup()
  })
})
