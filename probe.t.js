import { probe } from './probe.js'

const sleep = (ms) => { const end = performance.now() + ms; while (performance.now() < end) {} }

test('probe', ({ test }) => {

  test('forma 1 — envolve uma função, conta chamadas', ({ check }) => {
    const p = probe((a, b) => a + b)
    check(p(2, 3), 5, 'passa retorno')
    p(1, 1)
    const [s] = probe.stats()
    check(s.calls, 2)
    probe.restore()
  })

  test('forma 2 — troca obj.method no lugar, restaura', ({ check }) => {
    const obj = { double: (n) => n * 2 }
    const original = obj.double
    probe(obj, 'double')
    check(obj.double !== original, true, 'método trocado')
    check(obj.double(21), 42, 'ainda funciona')
    probe.restore()
    check(obj.double === original, true, 'restaurado')
  })

  test('forma 3 — envolve todo valor-função de um Map', ({ check }) => {
    const reg = new Map([['a', () => 1], ['b', () => 2], ['c', 'não-função']])
    probe(reg)
    reg.get('a')(); reg.get('a')(); reg.get('b')()
    const stats = probe.stats()
    check(stats.length, 2, 'só as duas funções entraram')
    check(stats.find((s) => s.name === 'a').calls, 2)
    check(stats.find((s) => s.name === 'b').calls, 1)
    probe.restore()
  })

  test('self-time não conta chamada aninhada duas vezes', ({ check }) => {
    const obj = {
      inner: () => sleep(20),
      outer() { sleep(10); this.inner() },
    }
    probe(obj, 'inner')
    probe(obj, 'outer')
    obj.outer()
    const stats = probe.stats()
    const outer = stats.find((s) => s.name === 'outer')
    const inner = stats.find((s) => s.name === 'inner')
    // outer: ~30ms de relógio, mas ~10ms de self (os outros 20 são do inner)
    check(outer.totalMs >= 25, true, `outer total ~30ms (foi ${outer.totalMs.toFixed(0)})`)
    check(outer.selfMs < 20, true, `outer self ~10ms, não ~30 (foi ${outer.selfMs.toFixed(0)})`)
    check(inner.selfMs >= 15, true, `inner self ~20ms (foi ${inner.selfMs.toFixed(0)})`)
    probe.restore()
  })

  test('probe duas vezes o mesmo alvo é idempotente', ({ check }) => {
    const obj = { f: () => 1 }
    const p1 = probe(obj, 'f')
    const p2 = probe(obj, 'f')
    check(p1 === p2, true)
    obj.f()
    check(probe.stats()[0].calls, 1, 'uma camada, uma contagem')
    probe.restore()
  })

  test('reset zera contadores mas mantém a observação', ({ check }) => {
    const obj = { f: () => 1 }
    probe(obj, 'f')
    obj.f(); obj.f()
    probe.reset()
    check(probe.stats().length, 0, 'sem chamadas depois do reset')
    obj.f()
    check(probe.stats()[0].calls, 1, 'ainda observando')
    probe.restore()
  })

  test('report escreve uma tabela ordenada por self-time', ({ check }) => {
    const obj = { slow: () => sleep(15), fast: () => sleep(1) }
    probe(obj, 'slow')
    probe(obj, 'fast')
    obj.slow(); obj.fast()
    let out = ''
    probe.report({ write: (s) => { out += s } })
    check(out.includes('slow'), true)
    check(out.indexOf('slow') < out.indexOf('fast'), true, 'o mais lento primeiro')
    check(out.includes('TOTAL'), true)
    probe.restore()
  })

  test('restore limpa tudo — stats vazio depois', ({ check }) => {
    const obj = { f: () => 1 }
    probe(obj, 'f')
    obj.f()
    probe.restore()
    check(probe.stats().length, 0)
  })
})
