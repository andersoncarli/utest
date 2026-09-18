// `src/worker.js` é a base do isolamento real: 1 arquivo = 1 processo. Ele é o
// contrato entre o runner pai e o filho — se o JSON de saída mudar de forma, o
// pai lê `undefined` e o arquivo inteiro some da suíte sem virar falha.
//
// NB 1: a feature 7.1 (workers por arquivo) NAO esta ligada no caminho padrao —
// o runner de hoje e in-process. Estes casos exercitam o worker DIRETAMENTE, que
// e o que existe e funciona.
//
// NB 2: este arquivo NAO se chama `worker.t.js` de proposito. `src/worker.js` e
// um ENTRYPOINT sem guard `import.meta.main`: o pareamento teste<->alvo do utest
// importa o alvo, o worker roda dentro do runner e chama process.exit(0),
// derrubando a rodada. Mesmo defeito que `src/migrate.js` tinha. Enquanto o
// guard nao entrar (feature 7.1), o teste tem que usar um nome nao-pareado.
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const WORKER = join(import.meta.dir, 'worker.js')
const dirs = []

const arquivo = (nome, corpo) => {
  const dir = mkdtempSync(join(tmpdir(), 'utest-worker-'))
  dirs.push(dir)
  const p = join(dir, nome)
  writeFileSync(p, corpo)
  return p
}
const cleanup = () => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) }

const roda = async (abs, timeout) => {
  const args = [WORKER, abs]
  if (timeout) args.push(String(timeout))
  const p = Bun.spawn(['bun', ...args], { stdout: 'pipe', stderr: 'pipe' })
  const out = await new Response(p.stdout).text()
  const code = await p.exited
  let json = null
  try { json = JSON.parse(out) } catch {}
  return { out, code, json }
}

test('worker', ({ test }) => {

  test('emite um envelope JSON do tipo result', async ({ check }) => {
    const f = arquivo('a.t.js', "test('a', ({ check }) => { check(1, 1) })\n")
    const r = await roda(f)
    check(r.json?.type, 'result', `envelope de resultado: ${r.out}`)
    check(r.json?.abs, f, 'o caminho absoluto volta no envelope')
    cleanup()
  }, { timeout: 30000 })

  test('um arquivo verde volta com state passed', async ({ check }) => {
    const f = arquivo('a.t.js', "test('a', ({ check }) => { check(1, 1) })\n")
    const r = await roda(f)
    check(r.json?.results?.state, 'passed', `verde: ${r.out}`)
    cleanup()
  }, { timeout: 30000 })

  test('um arquivo vermelho volta com state failed', async ({ check }) => {
    const f = arquivo('a.t.js', "test('a', ({ check }) => { check(1, 2) })\n")
    const r = await roda(f)
    check(r.json?.results?.state, 'failed', `vermelho: ${r.out}`)
    cleanup()
  }, { timeout: 30000 })

  test('uma exceção no corpo não derruba o worker', async ({ check }) => {
    const f = arquivo('a.t.js', "test('a', () => { throw new Error('boom') })\n")
    const r = await roda(f)
    check(r.json !== null, true, `ainda assim devolve JSON: ${r.out}`)
    check(['failed', 'exception'].includes(r.json?.results?.state), true,
      `estado de erro: ${r.json?.results?.state}`)
    cleanup()
  }, { timeout: 30000 })

  test('um erro de import vira envelope, não crash mudo', async ({ check }) => {
    const f = arquivo('a.t.js', "import './nao-existe.js'\ntest('a', ({ check }) => check(1,1))\n")
    const r = await roda(f)
    check(r.json !== null, true, `o worker sempre fala JSON: ${r.out}`)
    cleanup()
  }, { timeout: 30000 })

  test('o worker sempre sai com código 0 (o veredito vai no JSON)', async ({ check }) => {
    const f = arquivo('a.t.js', "test('a', ({ check }) => { check(1, 2) })\n")
    const r = await roda(f)
    check(r.code, 0, 'o pai lê o veredito do envelope, não do exit code')
    cleanup()
  }, { timeout: 30000 })

  test('sem argumento de arquivo, sai com código 1', async ({ check }) => {
    const p = Bun.spawn(['bun', WORKER], { stdout: 'pipe', stderr: 'pipe' })
    const code = await p.exited
    check(code, 1, 'chamada sem alvo é erro de uso')
  }, { timeout: 30000 })

  test('o resultado serializado não carrega funções', async ({ check }) => {
    const f = arquivo('a.t.js', "test('a', ({ check }) => { check(1, 1) })\n")
    const r = await roda(f)
    check(/"fn"/.test(r.out), false, `serialize devolve POJO: ${r.out}`)
    cleanup()
  }, { timeout: 30000 })

  test('cada worker parte de test.main limpo', async ({ check }) => {
    const f = arquivo('a.t.js', "test('unico', ({ check }) => { check(1, 1) })\n")
    const r1 = await roda(f)
    const r2 = await roda(f)
    check(r1.json?.results?.tests?.length, r2.json?.results?.tests?.length,
      'duas execuções do mesmo arquivo dão a MESMA contagem (sem acúmulo entre processos)')
    cleanup()
  }, { timeout: 60000 })
}, { timeout: 300000 })
