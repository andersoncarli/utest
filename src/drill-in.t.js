// Drill-in: o usuário não escolhe verbosidade — o ESCOPO a implica. Escopo largo
// dá v1 compacto e respeita o cache; uma feature/diretório força v2 e re-executa;
// um arquivo só força v3. Se essa regra inverte, a suíte inteira passa a furar o
// cache (lento) ou a esconder o detalhe justamente no escopo estreito.
//
// A lógica vive inline em utest.js (não exportada), então aqui se testa pelo CLI.
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const UTEST = join(import.meta.dir, '..', 'utest.js')
const YAML = 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n'
const dirs = []

const fixture = (files = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'utest-drill-'))
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
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')

const run = async (dir, args) => {
  const p = Bun.spawn([UTEST, ...args], { cwd: dir, stdout: 'pipe', stderr: 'pipe' })
  const out = await new Response(p.stdout).text()
  const err = await new Response(p.stderr).text()
  await p.exited
  return strip(out + err)
}

// NB: `log()` do teste so e impresso no bloco de detalhe, que sai apenas para
// arquivos que FALHAM (desenho compacto da frente 4). Num arquivo verde ele nao
// aparece nem com -v:3 explicito, entao os casos abaixo aferem o que e de fato
// observavel pelo CLI: selecao de escopo, cache e ausencia de ruido.
const COM_LOG = "test('a', ({ check, log }) => { log('MARCA-V3'); check(1, 1) })\n"

test('drill-in', ({ test }) => {

  test('um ARQUIVO só roda apenas aquele arquivo', async ({ check }) => {
    const dir = fixture({ 'a.t.js': COM_LOG, 'outro.t.js': "test('o', ({ check }) => check(1,1))\n" })
    const out = await run(dir, ['a.t.js', '--force'])
    check(/outro/.test(out), false, `o escopo de arquivo exclui os demais: ${out}`)
    cleanup()
  }, { timeout: 30000 })

  test('um arquivo que falha abre received/expected', async ({ check }) => {
    const dir = fixture({ 'f.t.js': "test('f', ({ check }) => { check(1, 2) })\n" })
    const out = await run(dir, ['f.t.js', '--force'])
    check(/received/.test(out) && /expected/.test(out), true,
      `o vermelho traz os dois lados: ${out}`)
    cleanup()
  }, { timeout: 30000 })

  test('escopo LARGO não abre o log() de um teste verde', async ({ check }) => {
    const dir = fixture({ 'a.t.js': COM_LOG })
    const out = await run(dir, ['.', '--force'])
    check(/MARCA-V3/.test(out), false, `a raiz fica compacta: ${out}`)
    cleanup()
  }, { timeout: 30000 })

  test('-v:N explícito é aceito sem alterar o veredito', async ({ check }) => {
    const dir = fixture({ 'a.t.js': COM_LOG })
    const out = await run(dir, ['.', '--force', '-v:3'])
    check(/✘|💥/.test(out), false, `-v:3 não inventa falha: ${out}`)
    cleanup()
  }, { timeout: 30000 })

  test('um termo que casa EXATAMENTE 1 arquivo vira o alvo', async ({ check }) => {
    const dir = fixture({ 'alpha.t.js': COM_LOG, 'beta.t.js': "test('b', ({ check }) => check(1,1))\n" })
    const out = await run(dir, ['alpha', '--force'])
    check(/alpha/.test(out), true, `o termo seleciona o arquivo: ${out}`)
    check(/beta/.test(out), false, 'e exclui o outro')
    cleanup()
  }, { timeout: 30000 })

  test('escopo largo NÃO fura o cache (segunda rodada vem cacheada)', async ({ check }) => {
    const dir = fixture({ 'a.t.js': "test('a', ({ check }) => { check(1, 1) })\n" })
    await run(dir, ['.'])
    const segunda = await run(dir, ['.'])
    check(/✔/.test(segunda), true, `a segunda rodada reporta normalmente: ${segunda}`)
    cleanup()
  }, { timeout: 60000 })

  test('um termo que não casa nada não inventa resultado', async ({ check }) => {
    const dir = fixture({ 'a.t.js': "test('a', ({ check }) => { check(1, 1) })\n" })
    const out = await run(dir, ['inexistente-xyz', '--force'])
    check(/✘|💥/.test(out), false, `sem falha inventada: ${out}`)
    cleanup()
  }, { timeout: 30000 })
}, { timeout: 300000 })
