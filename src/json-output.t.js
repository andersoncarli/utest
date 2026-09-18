// `--json` é a saída de MÁQUINA: o `sprint eval --sweep` faz um `utest eval
// --json` e deriva o degrau de cada feature do veredito de cada `.eval.js`. Um
// campo que muda de nome ou some quebra o consumidor em silêncio — ele lê
// `undefined` e conclui o degrau errado.
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const UTEST = join(import.meta.dir, '..', 'utest.js')
const YAML = 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n'
const dirs = []

const fixture = (files = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'utest-json-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'TEST.yaml'), YAML)
  for (const [name, body] of Object.entries(files)) {
    const full = join(dir, name)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return dir
}
const cleanup = () => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) }

const runJson = async (dir, args = []) => {
  const p = Bun.spawn([UTEST, '.', '--json', '--force', ...args], { cwd: dir, stdout: 'pipe', stderr: 'pipe' })
  const out = await new Response(p.stdout).text()
  const err = await new Response(p.stderr).text()
  const code = await p.exited
  let parsed = null
  try { parsed = JSON.parse(out) } catch {}
  return { out, err, code, parsed }
}

test('--json', ({ test }) => {

  test('stdout é JSON puro e parseável', async ({ check }) => {
    const dir = fixture({ 'a.t.js': "test('a', ({ check }) => { check(1, 1) })\n" })
    const r = await runJson(dir)
    check(r.parsed !== null, true, `o stdout parseia como JSON: ${JSON.stringify(r.out)}`)
    check(Array.isArray(r.parsed), true, 'uma entrada por arquivo de teste')
    cleanup()
  }, { timeout: 30000 })

  test('o relatório humano é suprimido do stdout', async ({ check }) => {
    const dir = fixture({ 'a.t.js': "test('a', ({ check }) => { check(1, 1) })\n" })
    const r = await runJson(dir)
    check(/coverage:|utest results/.test(r.out), false,
      `nada de relatório humano no stdout: ${JSON.stringify(r.out)}`)
    cleanup()
  }, { timeout: 30000 })

  test('os campos do contrato estão todos presentes', async ({ check }) => {
    const dir = fixture({ 'a.t.js': "test('a', ({ check }) => { check(1, 1) })\n" })
    const r = await runJson(dir)
    const e = r.parsed?.[0] || {}
    for (const campo of ['phase', 'file', 'feature', 'state', 'cached', 'tests', 'checks', 'failCount', 'ms'])
      check(campo in e, true, `campo ${campo} presente: ${JSON.stringify(e)}`)
    cleanup()
  }, { timeout: 30000 })

  test('um arquivo verde reporta state passed e failCount 0', async ({ check }) => {
    const dir = fixture({ 'a.t.js': "test('a', ({ check }) => { check(1, 1) })\n" })
    const r = await runJson(dir)
    const e = r.parsed?.[0] || {}
    check(e.state, 'passed', 'verde')
    check(e.failCount, 0, 'sem falhas')
    check(r.code, 0, 'exit 0 quando tudo passa')
    cleanup()
  }, { timeout: 30000 })

  test('um arquivo vermelho reporta failed, failCount e exit 1', async ({ check }) => {
    const dir = fixture({ 'a.t.js': "test('a', ({ check }) => { check(1, 2) })\n" })
    const r = await runJson(dir)
    const e = r.parsed?.[0] || {}
    check(e.state, 'failed', 'vermelho')
    check(e.failCount > 0, true, `failCount conta a falha: ${e.failCount}`)
    check(r.code, 1, 'exit 1 quando há falha — o consumidor decide pelo código também')
    cleanup()
  }, { timeout: 30000 })

  test('fails[] traz linha e código nos vermelhos', async ({ check }) => {
    const dir = fixture({ 'a.t.js': "test('a', ({ check }) => { check(1, 2) })\n" })
    const r = await runJson(dir)
    const f = r.parsed?.[0]?.fails?.[0]
    check(!!f, true, `há uma entrada em fails[]: ${JSON.stringify(r.parsed?.[0])}`)
    check('line' in (f || {}), true, 'com a linha')
    check('code' in (f || {}), true, 'e o código da asserção')
    cleanup()
  }, { timeout: 30000 })

  test('um verde não carrega fails[] povoado', async ({ check }) => {
    const dir = fixture({ 'a.t.js': "test('a', ({ check }) => { check(1, 1) })\n" })
    const r = await runJson(dir)
    const fails = r.parsed?.[0]?.fails
    check(!fails || fails.length === 0, true, `sem fails no verde: ${JSON.stringify(fails)}`)
    cleanup()
  }, { timeout: 30000 })

  test('uma exceção também é reportada, não engolida', async ({ check }) => {
    const dir = fixture({ 'a.t.js': "test('a', () => { throw new Error('boom') })\n" })
    const r = await runJson(dir)
    const e = r.parsed?.[0] || {}
    check(['failed', 'exception'].includes(e.state), true, `estado de erro: ${e.state}`)
    check(r.code, 1, 'exit 1')
    cleanup()
  }, { timeout: 30000 })

  test('vários arquivos viram várias entradas', async ({ check }) => {
    const dir = fixture({
      'a.t.js': "test('a', ({ check }) => { check(1, 1) })\n",
      'b.t.js': "test('b', ({ check }) => { check(1, 1) })\n",
    })
    const r = await runJson(dir)
    check(r.parsed?.length, 2, 'uma entrada por arquivo')
    const nomes = (r.parsed || []).map(e => e.file).sort().join(',')
    check(/a\.t\.js/.test(nomes) && /b\.t\.js/.test(nomes), true, `os dois arquivos: ${nomes}`)
    cleanup()
  }, { timeout: 30000 })

  test('feature é derivada do basename N.F.eval.js, senão null', async ({ check }) => {
    const dir = fixture({ 'a.t.js': "test('a', ({ check }) => { check(1, 1) })\n" })
    const r = await runJson(dir)
    check(r.parsed?.[0]?.feature, null, 'um .t.js comum não tem feature')
    cleanup()
  }, { timeout: 30000 })

  test('phase traz a fase declarada no TEST.yaml', async ({ check }) => {
    const dir = fixture({ 'a.t.js': "test('a', ({ check }) => { check(1, 1) })\n" })
    const r = await runJson(dir)
    check(r.parsed?.[0]?.phase, 'unit', 'a fase do arquivo')
    cleanup()
  }, { timeout: 30000 })
}, { timeout: 300000 })
