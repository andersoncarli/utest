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

  test('grafo', ({ test }) => {

    test('a aresta separa o contexto — dois callers da mesma função', ({ check }) => {
      const reg = {
        shared: (n) => n,
        a: null, b: null,
      }
      reg.a = () => { reg.shared(1); reg.shared(1) }
      reg.b = () => { reg.shared(1) }
      probe(reg)
      reg.a(); reg.a(); reg.b()
      const callers = probe.callers('shared')
      check(Object.keys(callers).sort().join(','), 'a,b', 'shared foi chamada de a e de b')
      check(callers.a.calls, 4, 'a chamou shared 2×2')
      check(callers.b.calls, 1, 'b chamou shared 1×')
      probe.restore()
    })

    test('report() continua idêntico com o wrap novo', ({ check }) => {
      const obj = { slow: () => sleep(15), fast: () => sleep(1) }
      probe(obj, 'slow'); probe(obj, 'fast')
      obj.slow(); obj.fast()
      let out = ''
      probe.report({ write: (s) => { out += s } })
      check(out.includes('slow'), true)
      check(out.indexOf('slow') < out.indexOf('fast'), true, 'flat: o mais lento primeiro')
      check(out.includes('TOTAL'), true, 'flat: rodapé TOTAL')
      check(out.includes('% self'), true, 'flat: cabeçalho da tabela intacto')
      check(out.includes('↻'), false, 'flat não é a árvore — sem marca de ciclo')
      probe.restore()
    })

    test('tree() imprime o mesmo callee sob dois callers — duas linhas', ({ check }) => {
      const reg = { shared: () => 1, a: null, b: null }
      reg.a = () => reg.shared()
      reg.b = () => reg.shared()
      probe(reg)
      reg.a(); reg.b()
      let out = ''
      probe.tree({ write: (s) => { out += s } })
      const sharedLines = out.split('\n').filter((l) => l.includes('shared'))
      check(sharedLines.length, 2, 'shared aparece uma vez por caller')
      check(out.includes('  shared'), true, 'indentada sob o caller')
      probe.restore()
    })

    test('ciclo — aresta f▸f conta os frames, tree() corta com ↻', ({ check }) => {
      const obj = {
        f(n) { if (n > 0) this.f(n - 1) },
      }
      probe(obj, 'f')
      obj.f(4)
      const callers = probe.callers('f')
      check(callers['(root)'].calls, 1, 'uma entrada de (root)')
      check(callers.f.calls, 4, 'quatro re-entradas recursivas')
      let out = ''
      probe.tree({ write: (s) => { out += s } })
      check(out.includes('↻'), true, 'a árvore marca o ciclo e não estoura')
      probe.restore()
    })

    test('self de aresta = self de stats quando há um caller só', ({ check }) => {
      const obj = { only: () => sleep(10) }
      probe(obj, 'only')
      obj.only(); obj.only()
      const [s] = probe.stats()
      const [e] = probe.edges()
      check(Math.abs(s.selfMs - e.selfMs) < 1, true, `stats.self ${s.selfMs.toFixed(1)} ≈ edge.self ${e.selfMs.toFixed(1)}`)
      check(e.caller, '(root)')
      check(e.callee, 'only')
      probe.restore()
    })

    test('reset zera as arestas, mantém a observação', ({ check }) => {
      const obj = { f: () => 1 }
      probe(obj, 'f')
      obj.f(); obj.f()
      check(probe.edges().length, 1, 'uma aresta antes do reset')
      probe.reset()
      check(probe.edges().length, 0, 'sem arestas depois do reset')
      obj.f()
      check(probe.edges().length, 1, 'ainda observando — a aresta volta')
      probe.restore()
    })

    test('restore limpa as arestas também', ({ check }) => {
      const obj = { f: () => 1 }
      probe(obj, 'f')
      obj.f()
      probe.restore()
      check(probe.edges().length, 0)
    })
  })
})
