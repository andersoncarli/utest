// `migrate.js` converte uma suíte jest/bun:test em check() nativo. Um codemod
// que erra silenciosamente reescreve o teste do usuário com semântica trocada —
// o dano só aparece quando o teste convertido passa a mentir.
//
// migrate.js não exporta nada (roda o CLI no import), então a superfície testada
// é o CLI com --dry, que é o contrato declarado: "--dry só reporta".
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const MIGRATE = join(import.meta.dir, 'migrate.js')
const dirs = []

const fixture = (files = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'utest-migrate-'))
  dirs.push(dir)
  for (const [name, body] of Object.entries(files)) {
    const full = join(dir, name)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return dir
}
const cleanup = () => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) }

// roda o codemod de verdade; devolve { out, file } com o conteúdo pós-migração
const run = async (dir, args = []) => {
  const p = Bun.spawn(['bun', MIGRATE, ...args, dir], { cwd: dir, stdout: 'pipe', stderr: 'pipe' })
  const out = await new Response(p.stdout).text()
  const err = await new Response(p.stderr).text()
  await p.exited
  return { out: out + err }
}

test('migrate', ({ test }) => {

  test('--dry não escreve no arquivo', async ({ check }) => {
    const before = "test('x', ({ check }) => { expect(1).toBe(1) })\n"
    const dir = fixture({ 'a.t.js': before })
    await run(dir, ['--dry'])
    check(readFileSync(join(dir, 'a.t.js'), 'utf8'), before, '--dry preserva o arquivo byte a byte')
    cleanup()
  })

  test('sem --dry reescreve o arquivo', async ({ check }) => {
    const dir = fixture({ 'a.t.js': "test('x', ({ check }) => { expect(1).toBe(1) })\n" })
    await run(dir)
    const after = readFileSync(join(dir, 'a.t.js'), 'utf8')
    check(/check\(1, 1\)/.test(after), true, `toBe vira check(a, b): ${JSON.stringify(after)}`)
    cleanup()
  })

  test('tabela de matchers converte cada forma', async ({ check }) => {
    const dir = fixture({
      'm.t.js': [
        "expect(a).toBe(1)",
        "expect(b).toEqual([1])",
        "expect(c).toContain('x')",
        "expect(d).toHaveLength(3)",
        "expect(e).toBeGreaterThan(2)",
        "expect(f).toBeInstanceOf(Error)",
        "expect(g).toBeTypeOf('string')",
        "expect(h).toBeTruthy()",
        "expect(i).toBeNull()",
        "expect(j).toBeUndefined()",
        "expect(k).toBeDefined()",
      ].join('\n') + '\n',
    })
    await run(dir)
    const s = readFileSync(join(dir, 'm.t.js'), 'utf8')
    check(/check\(a, 1\)/.test(s), true, `toBe: ${s}`)
    check(/check\(b, \[1\]\)/.test(s), true, `toEqual: ${s}`)
    check(/includes\?\.\('x'\)/.test(s), true, `toContain vira includes: ${s}`)
    check(/check\(\(d\)\?\.length, 3\)/.test(s), true, `toHaveLength: ${s}`)
    check(/check\(\(e\) > 2\)/.test(s), true, `toBeGreaterThan vira operador: ${s}`)
    check(/check\(\(f\) instanceof Error\)/.test(s), true, `toBeInstanceOf: ${s}`)
    check(/check\(typeof \(g\), 'string'\)/.test(s), true, `toBeTypeOf: ${s}`)
    check(/check\(h\)/.test(s), true, `toBeTruthy: ${s}`)
    check(/check\(i, null\)/.test(s), true, `toBeNull: ${s}`)
    check(/check\(j, undefined\)/.test(s), true, `toBeUndefined: ${s}`)
    check(/check\(\(k\) !== undefined\)/.test(s), true, `toBeDefined: ${s}`)
    cleanup()
  })

  test('.not vira checkFail ou a negação conforme o matcher', async ({ check }) => {
    const dir = fixture({
      'n.t.js': [
        "expect(a).not.toBe(1)",
        "expect(b).not.toContain('x')",
        "expect(c).not.toBeNull()",
        "expect(d).not.toBeTruthy()",
      ].join('\n') + '\n',
    })
    await run(dir)
    const s = readFileSync(join(dir, 'n.t.js'), 'utf8')
    check(/checkFail\(a, 1\)/.test(s), true, `.not.toBe vira checkFail: ${s}`)
    check(/check\(!\(\(b\)\?\.includes\?\.\('x'\)\)\)/.test(s), true, `.not.toContain nega: ${s}`)
    check(/check\(\(c\) !== null\)/.test(s), true, `.not.toBeNull: ${s}`)
    check(/check\(!\(d\)\)/.test(s), true, `.not.toBeTruthy: ${s}`)
    cleanup()
  })

  test('toHaveProperty aceita key e key,value', async ({ check }) => {
    const dir = fixture({
      'p.t.js': "expect(o).toHaveProperty('k')\nexpect(o).toHaveProperty('k', 2)\n",
    })
    await run(dir)
    const s = readFileSync(join(dir, 'p.t.js'), 'utf8')
    check(/check\('k' in \(\(o\) \|\| \{\}\)\)/.test(s), true, `só a chave: ${s}`)
    check(/check\(\(o\)\?\.\['k'\], 2\)/.test(s), true, `chave e valor: ${s}`)
    cleanup()
  })

  test('subject com parênteses aninhados é extraído inteiro', async ({ check }) => {
    const dir = fixture({ 'b.t.js': "expect(f(g(1), h(2))).toBe(3)\n" })
    await run(dir)
    const s = readFileSync(join(dir, 'b.t.js'), 'utf8')
    check(/check\(f\(g\(1\), h\(2\)\), 3\)/.test(s), true, `parênteses balanceados: ${s}`)
    cleanup()
  })

  test('arquivo com describe/lifecycle é PULADO inteiro', async ({ check }) => {
    const before = "describe('d', () => { test('x', () => { expect(1).toBe(1) }) })\n"
    const dir = fixture({ 'd.t.js': before })
    const r = await run(dir)
    check(readFileSync(join(dir, 'd.t.js'), 'utf8'), before,
      'describe exige trabalho manual — o codemod não toca')
    check(/skipped/.test(r.out), true, `reporta como skipped: ${r.out}`)
    cleanup()
  })

  test('beforeEach também barra o arquivo', async ({ check }) => {
    const before = "beforeEach(() => {})\nexpect(1).toBe(1)\n"
    const dir = fixture({ 'e.t.js': before })
    await run(dir)
    check(readFileSync(join(dir, 'e.t.js'), 'utf8'), before, 'lifecycle hook barra a conversão')
    cleanup()
  })

  test('strip do import de bun:test e it( -> test(', async ({ check }) => {
    const dir = fixture({
      'i.t.js': "import { test, expect } from 'bun:test'\nit('x', () => { expect(1).toBe(1) })\n",
    })
    await run(dir)
    const s = readFileSync(join(dir, 'i.t.js'), 'utf8')
    check(/bun:test/.test(s), false, `o import some: ${s}`)
    check(/test\('x'/.test(s), true, `it( vira test(: ${s}`)
    cleanup()
  })

  test('matcher desconhecido é deixado intacto', async ({ check }) => {
    const before = "expect(a).toBeWeirdCustomThing(1)\n"
    const dir = fixture({ 'u.t.js': before })
    await run(dir)
    check(readFileSync(join(dir, 'u.t.js'), 'utf8'), before,
      'o que não está na tabela não é convertido às cegas')
    cleanup()
  })

  test('arquivo sem nada a fazer é pulado', async ({ check }) => {
    const before = "test('x', ({ check }) => { check(1, 1) })\n"
    const dir = fixture({ 'z.t.js': before })
    const r = await run(dir)
    check(readFileSync(join(dir, 'z.t.js'), 'utf8'), before, 'já nativo, nada muda')
    check(/skipped/.test(r.out), true, `contabilizado como skipped: ${r.out}`)
    cleanup()
  })
})
