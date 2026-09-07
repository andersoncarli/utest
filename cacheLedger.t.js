// O árbitro por CONTEÚDO exige disco de verdade pelo mesmo motivo que `cache.t.js`: o que
// se prova aqui é a relação entre bytes no disco, sha256 e o veredito de frescor. Um mock
// provaria só que o mock concorda consigo mesmo.
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, utimesSync, statSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openCacheLedger } from './cacheLedger.js'
import { TestCache } from './cache.js'

const fixtures = []
const fixture = (files = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'utest-cledger-'))
  fixtures.push(dir)
  // `TEST.yaml` marca a raiz do projeto — é por ele que `findProjectRoot` para aqui em vez
  // de subir até `~/utest` e escrever no ledger de verdade durante o teste.
  writeFileSync(join(dir, 'TEST.yaml'), 'exclude: []\n')
  for (const [name, body] of Object.entries(files)) {
    const full = join(dir, name)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return { dir, at: name => join(dir, name) }
}
const cleanup = () => { for (const d of fixtures.splice(0)) rmSync(d, { recursive: true, force: true }) }

const SET = {
  'm.js': 'export const add = (a, b) => a + b\n',
  'm.t.js': "test('m', () => {})\n",
}

// O ledger sem `../iodb` degrada para no-op, e um no-op não tem o que projetar. Estes casos
// precisam de uma stream de verdade, então montam um handle FAKE com a mesma forma que
// `openLedger` devolve — a superfície que o `cacheLedger` consome é `state()` e `verify()`,
// e é ela que está sob teste, não o iodb (que tem os próprios testes).
const fakeLedger = (events = []) => ({
  runId: 'test-run', state: () => events,
  verify: () => ({ valid: true, length: events.length }),
})

const startEvent = (files) => ({ event: 'run:start', fileSet: files })
const resultEvent = (file, extra = {}) => ({
  event: 'test:result', file, phase: 'unit', status: 'passed',
  checks: 3, tests: 1, failCount: 0, exception: false, ...extra,
})

test('cacheLedger: o árbitro por conteúdo', ({ test }) => {

  test('degrada para no-op sem ../iodb — enabled false, results.json continua mandando', async ({ check }) => {
    const { dir } = fixture(SET)
    // `enabled: false` é o mesmo caminho de código que a ausência de `../iodb` toma:
    // ambos devolvem o no-op, e o `TestCache` fica no `results.json`.
    const l = await openCacheLedger(dir, { enabled: false })
    check(l.enabled, false, 'desligado não arbitra')
    check(l.fresh('unit', join(dir, 'm.t.js')), false, 'no-op nunca diz fresh')
    check(l.get('unit', join(dir, 'm.t.js')), null, 'no-op não tem record')
    cleanup()
  })

  test('projeta a stream num índice: run:start dá o sha, test:result dá o veredito', async ({ check }) => {
    const { dir, at } = fixture(SET)
    const { createHash } = await import('crypto')
    const { readFileSync } = await import('fs')
    const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex')

    const l = await openCacheLedger(dir, {
      ledger: fakeLedger([
        startEvent([{ file: 'm.t.js', sha256: sha(at('m.t.js')) }, { file: 'm.js', sha256: sha(at('m.js')) }]),
        resultEvent('m.t.js'),
      ]),
    })
    check(l.enabled, true, 'com stream, arbitra')
    check(l.get('unit', at('m.t.js'))?.checks, 3, 'o record veio da projeção')
    check(l.get('unit', at('m.t.js'))?.state, 'passed')
    cleanup()
  })

  test('fresh: verde quando o conteúdo bate, vermelho quando muda', async ({ check }) => {
    const { dir, at } = fixture(SET)
    const { createHash } = await import('crypto')
    const { readFileSync } = await import('fs')
    const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex')

    const l = await openCacheLedger(dir, {
      ledger: fakeLedger([
        startEvent([{ file: 'm.t.js', sha256: sha(at('m.t.js')) }]),
        resultEvent('m.t.js'),
      ]),
    })
    check(l.fresh('unit', at('m.t.js')), true, 'conteúdo intacto → fresh')

    writeFileSync(at('m.t.js'), "test('m', () => { 1 })\n")
    check(l.fresh('unit', at('m.t.js')), false, 'conteúdo mudou → stale')
    cleanup()
  })

  test('O GANHO: touch sem editar é fresh no ledger e stale no results.json', async ({ check }) => {
    const { dir, at } = fixture(SET)
    const { createHash } = await import('crypto')
    const { readFileSync } = await import('fs')
    const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex')

    const l = await openCacheLedger(dir, {
      ledger: fakeLedger([
        startEvent([{ file: 'm.t.js', sha256: sha(at('m.t.js')) }]),
        resultEvent('m.t.js'),
      ]),
    })

    // O `results.json` grava o mtime da hora do record; o ledger grava o sha do conteúdo.
    const cache = TestCache(dir)
    cache.write(at('m.t.js'), at('m.js'), { checks: 3 }, { phase: 'unit' })

    // `touch`: o inode muda, os bytes não. É o caso do `git checkout` que devolve os mesmos
    // bytes com mtime novo — e a única divergência esperada entre os dois árbitros.
    const future = Date.now() / 1000 + 10
    utimesSync(at('m.t.js'), future, future)

    check(l.fresh('unit', at('m.t.js')), true, 'ledger: os bytes são os mesmos → fresh')
    check(cache.results.fresh('unit', at('m.t.js'), [], at('m.js')), false,
      'results.json: o mtime mudou → stale')
    cleanup()
  })

  test('fresh confirma o ALVO e as deps extras, não só o teste', async ({ check }) => {
    const { dir, at } = fixture(SET)
    const { createHash } = await import('crypto')
    const { readFileSync } = await import('fs')
    const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex')

    const l = await openCacheLedger(dir, {
      ledger: fakeLedger([
        startEvent([
          { file: 'm.t.js', sha256: sha(at('m.t.js')) },
          { file: 'm.js', sha256: sha(at('m.js')) },
        ]),
        resultEvent('m.t.js'),
      ]),
    })
    check(l.fresh('unit', at('m.t.js'), [], at('m.js')), true, 'alvo intacto → fresh')

    writeFileSync(at('m.js'), 'export const add = (a, b) => a - b\n')
    check(l.fresh('unit', at('m.t.js'), [], at('m.js')), false,
      'o TESTE não mudou, mas o alvo sim → stale')
    cleanup()
  })

  test('um arquivo que o ledger nunca viu nunca é fresh', async ({ check }) => {
    const { dir, at } = fixture(SET)
    const l = await openCacheLedger(dir, { ledger: fakeLedger([]) })
    // Não saber nunca promove — a mesma assimetria do `arbitrate` do `cache.js`: o lado
    // arriscado é sempre o menos permissivo.
    check(l.fresh('unit', at('m.t.js')), false)
    check(l.get('unit', at('m.t.js')), null)
    cleanup()
  })

  test('record mantém a projeção coerente DENTRO da mesma rodada', async ({ check }) => {
    const { dir, at } = fixture(SET)
    const l = await openCacheLedger(dir, { ledger: fakeLedger([]) })
    check(l.fresh('unit', at('m.t.js')), false, 'antes de rodar, nada')

    // Um teste que acabou de rodar não pode ser lido como stale por outra consulta na
    // mesma rodada — o registro durável já foi ao disco pelo `ledger.test`.
    l.record('unit', at('m.t.js'), { state: 'passed', checks: 5, tests: 1, targetPath: at('m.js') })
    check(l.fresh('unit', at('m.t.js')), true, 'depois de rodar, fresh')
    check(l.get('unit', at('m.t.js'))?.checks, 5)
    cleanup()
  })

  test('TestCache troca o árbitro sem mudar assinatura pública', async ({ check }) => {
    const { dir, at } = fixture(SET)
    // Sem opts: o comportamento de sempre, o `results.json` arbitrando.
    check(typeof TestCache(dir).read, 'function', 'TestCache(root) continua válido')
    const l = await openCacheLedger(dir, { ledger: fakeLedger([]) })
    const cache = TestCache(dir, { ledger: l })
    check(typeof cache.read, 'function', 'TestCache(root, {ledger}) tem a mesma forma')
    cleanup()
  })

  test('as duas persistências rodam em PARALELO: results.json é escrito mesmo com o ledger arbitrando', async ({ check }) => {
    const { dir, at } = fixture(SET)
    const l = await openCacheLedger(dir, { ledger: fakeLedger([]) })
    const cache = TestCache(dir, { ledger: l })
    cache.write(at('m.t.js'), at('m.js'), { checks: 4, tests: 1 }, { phase: 'unit' })
    cache.results.flush()
    // O critério do requisito: o ledger arbitra, mas o `results.json` continua existindo e
    // atualizado. Parar de escrevê-lo é a convergência, sprint futuro.
    check(existsSync(join(dir, '.utest', 'results.json')), true, '.utest/results.json existe')
    check(cache.results.get('unit', at('m.t.js'))?.checks, 4, 'e está atualizado')
    // E a projeção do ledger também recebeu — os dois viram a mesma rodada.
    check(l.get('unit', at('m.t.js'))?.checks, 4, 'o ledger também')
    cleanup()
  })
})
