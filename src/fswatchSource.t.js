// A prova da 8.3: a arvore pode vir do baseline do `iodb/fswatch` ou do `readdirSync`,
// e as DUAS listas tem que ser identicas. O que garante isso e a classificacao ser
// compartilhada (`makeFilter`/`testRe()`), nao reimplementada de cada lado.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join, relative } from 'path'
import { tmpdir } from 'os'
import { scan, makeFilter } from './scanner.js'
import { openFswatchSource } from './fswatchSource.js'

const dirs = []
const fixture = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'utest-fsw-'))
  dirs.push(dir)
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return dir
}
const cleanup = () => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) }

const YAML = 'exclude:\n  - node_modules/**\nunit:\n  include:\n    - "**/*.t.js"\n'
const rels = (dir, list) => list.map(f => relative(dir, f)).sort()

// O sibling pode nao estar la (um clone so do utest). Sem ele a feature inteira e um
// no-op por design, e o teste que a mede nao tem o que afirmar — entao ele se declara.
const haveFswatch = existsSync(join(import.meta.dir, '..', 'iodb', 'fswatch', 'fswatch.js'))

test('fswatchSource: o baseline e uma FONTE, nao uma classificacao', ({ test }) => {

  test('desligado devolve null — quem chama cai no walk()', async ({ check }) => {
    check(await openFswatchSource(process.cwd(), { enabled: false }), null)
    check(await openFswatchSource(process.cwd(), {}), null)
  })

  test('sem o sibling iodb, degrada para null em vez de quebrar', async ({ check }) => {
    if (haveFswatch) return check(true, true)
    check(await openFswatchSource(process.cwd(), { enabled: true }), null)
  })

  test('os dois caminhos devolvem os MESMOS testFiles e sourceFiles', async ({ check }) => {
    if (!haveFswatch) return check(true, true)
    const d = fixture({
      'a.t.js': '', 'a.js': '', 'sub/b.t.js': '', 'sub/b.js': '',
      'sub/mais/c.js': '', 'node_modules/x/y.js': '',
    })
    writeFileSync(join(d, 'TEST.yaml'), YAML)

    const base = await scan(d, join(d, 'TEST.yaml'), 'unit')
    const fsw  = await scan(d, join(d, 'TEST.yaml'), 'unit', { fswatch: true })

    check(rels(d, fsw.entries.map(e => e.path)), rels(d, base.entries.map(e => e.path)))
    check(rels(d, fsw.uncovered), rels(d, base.uncovered))
    cleanup()
  })

  test('o exclude poda pelo caminho do fswatch tambem', async ({ check }) => {
    if (!haveFswatch) return check(true, true)
    const d = fixture({ 'a.t.js': '', 'node_modules/p/mod.t.js': '', 'node_modules/p/mod.js': '' })
    writeFileSync(join(d, 'TEST.yaml'), YAML)
    const fsw = await scan(d, join(d, 'TEST.yaml'), 'unit', { fswatch: true })
    check(rels(d, fsw.entries.map(e => e.path)), ['a.t.js'])
    cleanup()
  })

  test('o proprio .fswatch nao entra na arvore que ele indexa', async ({ check }) => {
    if (!haveFswatch) return check(true, true)
    const d = fixture({ 'a.t.js': '', 'a.js': '' })
    writeFileSync(join(d, 'TEST.yaml'), YAML)
    const r = await scan(d, join(d, 'TEST.yaml'), 'unit', { fswatch: true })
    const all = [...r.entries.map(e => e.path), ...r.uncovered]
    check(all.some(f => f.includes('.fswatch')), false)
    cleanup()
  })

  test('baseline ilegivel nao derruba a corrida: cai no walk()', async ({ check }) => {
    if (!haveFswatch) return check(true, true)
    const d = fixture({ 'a.t.js': '', 'a.js': '' })
    writeFileSync(join(d, 'TEST.yaml'), YAML)
    // Uma config corrompida faz o `FSWatch()` estourar; o modulo tem que devolver `null`.
    mkdirSync(join(d, '.fswatch'), { recursive: true })
    writeFileSync(join(d, '.fswatch', 'PROJECT.yaml'), ':::\x00 nao e yaml :::')
    const r = await scan(d, join(d, 'TEST.yaml'), 'unit', { fswatch: true })
    check(rels(d, r.entries.map(e => e.path)), ['a.t.js'])
    cleanup()
  })
})

test('coverage: um kind nunca e alvo de cobertura (4.7)', ({ test }) => {

  test('.eval.js e .int.js ficam fora do denominador', async ({ check }) => {
    const d = fixture({ 'a.t.js': '', 'a.js': '', 'x.eval.js': '', 'y.int.js': '', 'z.tui': '' })
    writeFileSync(join(d, 'TEST.yaml'), YAML)
    const r = await scan(d, join(d, 'TEST.yaml'), 'unit')
    // `a.js` e alvo de `a.t.js`, entao esta coberto; roteiro e adapter nao contam.
    check(rels(d, r.uncovered), [])
    cleanup()
  })
})
