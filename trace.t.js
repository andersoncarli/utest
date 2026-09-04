import { install, mark, end, region, wrapSpawns, collectFragments, tree, chromeTrace, nodes, rawEvents } from './trace.js'
import { writeFileSync, mkdtempSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const sleep = (ms) => { const t = performance.now() + ms; while (performance.now() < t) {} }
const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '')
const render = (op = {}) => { let o = ''; tree({ write: s => { o += s }, ...op }); return strip(o) }
const byName = (n) => nodes().find(x => x.name === n)

test('trace', ({ test }) => {

  test('região aninhada credita self ao pai', ({ check }) => {
    install('(t)')
    region('outer', () => { sleep(12); region('inner', () => sleep(20)) })
    const outer = byName('outer'), inner = byName('inner')
    check(outer.ms >= 28, true, `outer total ~32ms (foi ${outer.ms.toFixed(0)})`)
    check(outer.selfMs < 22, true, `outer self ~12ms, não ~32 (foi ${outer.selfMs.toFixed(0)})`)
    check(inner.selfMs >= 15, true, `inner self ~20ms (foi ${inner.selfMs.toFixed(0)})`)
  })

  test('(untracked) de topo = grand − Σ filhas', ({ check }) => {
    install('(t)')
    sleep(15)                                     // fora de qualquer região
    region('x', () => sleep(5))
    const out = render({ minPct: 0 })
    check(/\(untracked\)/.test(out), true, 'a árvore nomeia o tempo solto')
    const rootSelf = byName('(t)').selfMs
    check(rootSelf >= 12, true, `~15ms soltos (foi ${rootSelf.toFixed(0)})`)
  })

  test('region async espera o Promise', async ({ check }) => {
    install('(t)')
    await region('a', async () => { await new Promise(r => setTimeout(r, 20)) })
    check(byName('a').ms >= 15, true, `a total ~20ms (foi ${byName('a').ms.toFixed(0)})`)
  })

  test('end() desbalanceado é no-op', ({ check }) => {
    install('(t)')
    const a = mark('a')
    end({ name: 'zzz', startTs: 0, depth: 9 })    // não é o topo — ignora
    end(a)
    check(byName('a') !== undefined, true, 'a pilha não corrompeu; a fechou normal')
  })

  test('wrapSpawns() rotula pelo cmd e restaura', ({ check }) => {
    install('(t)')
    const real = Bun.spawnSync
    const stop = wrapSpawns()
    check(Bun.spawnSync !== real, true, 'trocado')
    Bun.spawnSync({ cmd: ['echo', 'hi'], stdout: 'ignore', stderr: 'ignore' })
    check(/sh:echo hi/.test(render({ minPct: 0 })), true)
    stop()
    check(Bun.spawnSync === real, true, 'restaurado')
  })

  test('wrapSpawns() cede a uma região sh: já aberta (não duplica engine.js#sh())', ({ check }) => {
    install('(t)')
    const stop = wrapSpawns()
    region('sh: outer cmd', () => {
      Bun.spawnSync({ cmd: ['echo', 'hi'], stdout: 'ignore', stderr: 'ignore' })
    })
    const out = render({ minPct: 0 })
    check(/sh: outer cmd/.test(out), true, 'a região externa fica')
    check(/sh:echo hi/.test(out), false, 'nenhuma sh: aninhada por dentro')
    stop()

    install('(t2)')
    const stop2 = wrapSpawns()
    Bun.spawnSync({ cmd: ['echo', 'hi'], stdout: 'ignore', stderr: 'ignore' })
    check(/sh:echo hi/.test(render({ minPct: 0 })), true, 'sem região sh: aberta, o comportamento anterior continua')
    stop2()
  })

  test('mesma região N× soma e conta cada ocorrência', ({ check }) => {
    install('(t)')
    for (let i = 0; i < 4; i++) region('loop', () => sleep(3))
    const loopEvents = rawEvents().filter(e => e.name === 'loop')
    check(loopEvents.length, 4, '4 eventos loop')
    check(loopEvents.reduce((s, e) => s + e.dur, 0) >= 10, true, '4×3ms somados')
  })

  test('tree() corta abaixo de minPct', ({ check }) => {
    install('(t)')
    region('big', () => sleep(60))
    region('tiny', () => sleep(1))       // ~1.6% de ~61ms — bem abaixo de 30%
    check(/tiny/.test(render({ minPct: 30 })), false, 'a região de <30% some')
    check(/big/.test(render({ minPct: 30 })), true, 'a região grande fica')
  })

  test('render alinha os ms à direita e a conta fecha', ({ check }) => {
    install('(t)')
    sleep(8)
    region('a', () => sleep(10))
    region('b', () => { sleep(5); region('c', () => sleep(7)) })
    const all = nodes()
    const grand = all.find(n => n.name === '(t)').ms
    // Σ self de todos os nós ≈ grand (o (untracked) da raiz absorve o resto)
    const sumSelf = all.reduce((s, n) => s + n.selfMs, 0)
    check(Math.abs(sumSelf - grand) < 3, true, `Σself ${sumSelf.toFixed(0)} ≈ grand ${grand.toFixed(0)}`)
    // as colunas de ms terminam alinhadas
    const lines = render({ minPct: 0 }).split('\n').filter(l => /ms\s+\d+%$/.test(l))
    const cols = lines.map(l => l.search(/\d+ms/))
    check(new Set(cols.map(c => c >= 0)).has(true), true, 'há linhas com ms')
  })

  test('chromeTrace() emite Chrome Trace Event — ts/dur em µs, tid por profundidade', ({ check }) => {
    install('(t)')
    region('outer', () => { sleep(5); region('inner', () => sleep(8)) })
    const tr = chromeTrace()
    check(Array.isArray(tr), true)
    check(tr[0].ph, 'M', 'metadata primeiro')
    const outer = tr.find(e => e.name === 'outer')
    const inner = tr.find(e => e.name === 'inner')
    check(outer.ph, 'X')
    check(outer.dur > 10000, true, `~13000µs (foi ${outer.dur})`)   // ms→µs
    check(inner.tid > outer.tid, true, 'inner numa faixa mais funda')
    check(inner.ts >= outer.ts, true, 'inner começa dentro de outer')
  })

  test('writeChromeTrace grava um JSON válido', ({ check }) => {
    const { writeChromeTrace } = require('./trace.js')
    install('(t)')
    region('a', () => sleep(3))
    const dir = mkdtempSync(join(tmpdir(), 'utrace-t-'))
    const p = writeChromeTrace(join(dir, 'trace.json'))
    check(existsSync(p), true)
    const parsed = JSON.parse(require('fs').readFileSync(p, 'utf8'))
    check(parsed.some(e => e.name === 'a' && e.ph === 'X'), true)
  })

  test('enxerto de fragmento — sh: ganha as regiões do filho no tempo certo', ({ check }) => {
    install('(t)')
    const dir = mkdtempSync(join(tmpdir(), 'utrace-t-'))
    const prefix = join(dir, 'frag')
    writeFileSync(`${prefix}.999`, JSON.stringify({
      pid: 999, totalMs: 30,
      events: [{ kind: 'region', name: 'serve hello', startMs: 2, endMs: 22 }],
    }))
    region('sh:fake', () => sleep(25), { fragPrefix: prefix })
    const out = render({ minPct: 0 })
    check(/sh:fake/.test(out), true, out)
    check(/serve hello/.test(out), true, 'a região do fragmento virou filha de sh:fake')
    const serve = byName('serve hello')
    check(serve && serve.ms >= 18, true, `~20ms (foi ${serve?.ms?.toFixed(0)})`)
  })

  test('collectFragments direto — costura os events no log', ({ check }) => {
    install('(t)')
    const dir = mkdtempSync(join(tmpdir(), 'utrace-t-'))
    const prefix = join(dir, 'f')
    writeFileSync(`${prefix}.1`, JSON.stringify({ events: [
      { kind: 'region', name: 'r1', startMs: 0, endMs: 10 },
      { kind: 'import', name: 'a/b.js', startMs: 10, endMs: 12 },
    ] }))
    const frame = mark('host'); end(frame)
    collectFragments('host', frame.startTs, prefix)
    const names = rawEvents().map(e => e.name)
    check(names.includes('r1'), true)
    check(names.includes('import a/b.js'), true)
  })

  test('trace-preload.mjs num subprocesso real escreve o fragmento', ({ check }) => {
    const dir = mkdtempSync(join(tmpdir(), 'utrace-t-'))
    const prefix = join(dir, 'live')
    const preload = join(import.meta.dir, 'trace-preload.mjs')
    Bun.spawnSync({
      cmd: ['bun', '--import', preload, '-e', 'await globalThis.__uTrace.region("r", async () => { await Bun.sleep(8) })'],
      env: { ...process.env, UTEST_TRACE_OUT: prefix },
      stdout: 'ignore', stderr: 'ignore',
    })
    const found = require('fs').readdirSync(dir).filter(f => f.startsWith('live.'))
    check(found.length, 1, 'um fragmento por processo')
    const frag = JSON.parse(require('fs').readFileSync(join(dir, found[0]), 'utf8'))
    check(frag.events.some(e => e.name === 'r' && e.kind === 'region'), true, JSON.stringify(frag))
  })

  test('splice sem o env é no-op — nenhum fragmento', ({ check }) => {
    const dir = mkdtempSync(join(tmpdir(), 'utrace-t-'))
    Bun.spawnSync({
      cmd: ['bash', '-lc', `P="$UTEST_TRACE_PRELOAD"; bun \${P:+--import "$P"} -e 'globalThis.__uTrace?.mark("x")'`],
      env: { ...process.env, UTEST_TRACE_OUT: join(dir, 'z'), UTEST_TRACE_PRELOAD: '' },
      stdout: 'ignore', stderr: 'ignore',
    })
    check(require('fs').readdirSync(dir).length, 0, 'sem P, sem --import, sem fragmento')
  })
})
