// `ledger.js` grava a memoria permanente do utest sobre o iodb: uma cadeia
// append-only que ancora a garantia no CONTEUDO exercitado (sha256 do file set)
// e prova, via `verify()`, que nada no meio foi adulterado sem deixar rastro.
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openLedger } from './ledger.js'

const dirs = []
const fixture = () => {
  const dir = mkdtempSync(join(tmpdir(), 'utest-ledger-'))
  dirs.push(dir)
  return dir
}
const cleanup = () => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) }

test('openLedger: a cadeia sobre iodb', ({ test }) => {

  test('run:start grava fileSet com sha256, test:result e run:end fecham a cadeia', async ({ check }) => {
    const root = fixture()
    const a = join(root, 'a.t.js')
    writeFileSync(a, 'test content')

    const ledger = await openLedger(root, { phase: 'unit' })
    check(typeof ledger.runId, 'string')

    ledger.start([a])
    ledger.test(a, { name: 'a.t.js', status: 'passed', elapsed: 5, cached: false })
    ledger.end({ tests: 1, failed: 0 })

    const v = ledger.verify()
    check(v.valid, true)
    // `valid` sozinho nao distingue "cadeia verificada" de "cadeia inexistente": o no-op
    // devolve `{ valid: true, length: 0 }` hardcoded, e foi exatamente isso que deixou
    // este teste passar por engano enquanto o import do iodb estava quebrado. O
    // comprimento e o que prova que houve cadeia.
    check(v.length > 0, true, `a cadeia tem registros: length=${v.length}`)

    const dashPath = join(root, '.utest', 'ledger.dash')
    check(existsSync(dashPath), true)
    cleanup()
  })

  test('adulterar um registro no meio invalida a cadeia A PARTIR DALI', async ({ check }) => {
    const root = fixture()
    // muitos arquivos: as chaves curtas (prefixo) crescem com o tamanho da cadeia,
    // reduzindo a chance de colisão espúria — o hash é o mesmo XOR do iodb, e um
    // payload adulterado quase sempre produz uma full key com prefixo diferente.
    const files = []
    for (let i = 0; i < 16; i++) {
      const f = join(root, `f${i}.t.js`)
      writeFileSync(f, `content-${i}`)
      files.push(f)
    }

    const ledger = await openLedger(root, { phase: 'unit' })
    ledger.start(files)
    for (const f of files) ledger.test(f, { name: f, status: 'passed', elapsed: 1 })
    ledger.end({ tests: files.length, failed: 0 })

    const before = ledger.verify()
    check(before.valid, true)

    const dashPath = join(root, '.utest', 'ledger.dash')
    const original = readFileSync(dashPath, 'utf8')
    const idx = 3   // apos genesis#0, projecao#1, run:start#..

    // As chaves do iodb sao PREFIXOS curtos (compressao) — um payload adulterado só
    // muda a chave STORED se o novo full-key não colidir no mesmo prefixo (esperado
    // na maioria dos casos, mas não 100% com prefixos de 1 char). O teste tenta um
    // punhado de adulterações distintas até achar uma que muda o conteúdo exercitado
    // de verdade — provando a propriedade sem depender de sorte de uma tentativa só.
    let after = { valid: true }
    for (let n = 0; n < 20 && after.valid; n++) {
      const lines = original.split('\n').filter(Boolean)
      const target = lines[idx]
      const hashIdx = target.lastIndexOf('#')
      const tampered = target.slice(0, hashIdx)
        .replace('"status":"passed"', `"status":"tampered-${n}"`) + target.slice(hashIdx)
      lines[idx] = tampered
      writeFileSync(dashPath, lines.join('\n') + '\n')
      const ledger2 = await openLedger(root, { phase: 'unit' })
      after = ledger2.verify()
    }

    check(after.valid, false)
    check(after.failedAt, idx)
    cleanup()
  })

  test('append de plugin fora da rodada entra na cadeia e sobrevive ao verify', async ({ check }) => {
    const root = fixture()
    const a = join(root, 'a.t.js')
    writeFileSync(a, 'a')

    const ledger = await openLedger(root, { phase: 'unit' })
    ledger.start([a])
    ledger.test(a, { name: 'a.t.js', status: 'passed', elapsed: 1 })
    ledger.write('plugin:custom', { anything: 'the utest does not know the semantics' })
    ledger.end({ tests: 1, failed: 0 })

    const v = ledger.verify()
    check(v.valid, true)
    check(v.length > 0, true, `a cadeia tem registros: length=${v.length}`)
    cleanup()
  })

  test('custo zero quando desligado: sem ../iodb ou enabled:false, degrada no-op', async ({ check }) => {
    const root = fixture()
    const ledger = await openLedger(root, { enabled: false })
    check(ledger.runId, null)
    ledger.start([])
    ledger.test('x', {})
    ledger.end({})
    // O outro lado da mesma moeda: o no-op tambem diz `valid: true`, mas com `length: 0`.
    // Afirmar os dois aqui e no teste da cadeia real e o que torna os dois estados
    // DISTINGUIVEIS — sem isso, `valid` sozinho nunca reprova nada.
    check(ledger.verify().valid, true)
    check(ledger.verify().length, 0, 'no-op: cadeia vazia, nao uma cadeia verificada')
    cleanup()
  })
})
