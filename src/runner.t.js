// `src/runner.js` é o runner MODULAR: o caminho do subprocesso e o que a fase
// `eval` do soml usa (via apps/eval/engine.js). Ele é uma segunda implementação
// ao lado do runTest inline de utest.js — um desvio entre os dois faz a mesma
// suíte dar veredito diferente conforme quem a rodou.
import { summary, runTest } from './runner.js'

// um nó de teste mínimo, no formato que o runner consome
// O nó real (src/test.js) traz um `oncheck` que empilha em t.checks — é ele que
// o check() bindado chama. Sem isso o veredito nunca ve os checks do corpo.
const node = (over = {}) => ({
  name: 'n', state: 'pending', checks: [], tests: [], output: [], op: {},
  oncheck(c) { this.checks.push(c) },
  ...over,
})
const chk = (state) => ({ state })

test('runner', ({ test }) => {

  test('summary conta os checks do próprio nó', ({ check }) => {
    const s = summary(node({ checks: [chk('passed'), chk('failed'), chk('passed')] }))
    check(s.passed, 2, 'passados')
    check(s.failed, 1, 'falhados')
    check(s.total, 3, 'total')
  })

  test('summary recursa nos filhos', ({ check }) => {
    const t = node({ tests: [
      node({ checks: [chk('passed')] }),
      node({ checks: [chk('failed'), chk('passed')] }),
    ]})
    const s = summary(t)
    check(s.passed, 2, 'soma os passados das filhas')
    check(s.failed, 1, 'e os falhados')
    check(s.total, 3, 'total agregado')
  })

  test('um leaf SEM checks herda o próprio state', ({ check }) => {
    check(summary(node({ state: 'passed' })).passed, 1, 'leaf verde conta 1 passado')
    check(summary(node({ state: 'failed' })).failed, 1, 'leaf vermelho conta 1 falhado')
    check(summary(node({ state: 'exception' })).exception, 1, 'leaf que estourou conta exceção')
  })

  test('um leaf pendente/rodando não conta', ({ check }) => {
    check(summary(node({ state: 'pending' })).total, 0, 'pending não entra na conta')
    check(summary(node({ state: 'running' })).total, 0, 'running idem')
  })

  test('exceção de leaf COM checks conta a exceção também', ({ check }) => {
    const s = summary(node({ state: 'exception', checks: [chk('passed')] }))
    check(s.passed, 1, 'o check que passou conta')
    check(s.exception, 1, 'e a exceção não some')
  })

  test('um nó com filhos ignora o próprio state', ({ check }) => {
    const s = summary(node({ state: 'failed', tests: [node({ checks: [chk('passed')] })] }))
    check(s.failed, 0, 'o state do pai não é contado quando há filhos')
    check(s.passed, 1, 'só o que veio de baixo')
  })

  test('árvore profunda soma em todos os níveis', ({ check }) => {
    const t = node({ tests: [ node({ tests: [ node({ checks: [chk('passed'), chk('failed')] }) ] }) ] })
    const s = summary(t)
    check(s.total, 2, 'atravessa os níveis')
    check(s.failed, 1, 'e preserva o veredito')
  })

  test('runTest só roda um nó pendente', async ({ check }) => {
    const t = node({ state: 'passed', fn: () => { throw new Error('não deveria rodar') } })
    const r = await runTest(t)
    check(r.state, 'passed', 'um nó já julgado não é reexecutado')
  })

  test('runTest injeta check/test/log no contexto', async ({ check }) => {
    let visto = null
    const t = node({ fn: (ctx) => { visto = Object.keys(ctx) } })
    await runTest(t)
    check(visto?.includes('check'), true, 'check é injetado')
    check(visto?.includes('checkFail'), true, 'checkFail também')
    check(visto?.includes('checkException'), true, 'checkException também')
    check(visto?.includes('log'), true, 'log é injetado')
  })

  test('runTest marca o veredito a partir dos checks do corpo', async ({ check }) => {
    const verde = node({ fn: ({ check: c }) => { c(1, 1) } })
    await runTest(verde)
    check(verde.state, 'passed', 'só checks verdes -> passed')

    const vermelho = node({ fn: ({ check: c }) => { c(1, 2) } })
    await runTest(vermelho)
    check(vermelho.state, 'failed', 'um check vermelho -> failed')
  })

  test('uma exceção no corpo vira state exception', async ({ check }) => {
    const t = node({ fn: () => { throw new Error('boom') } })
    await runTest(t, { stopOnException: false })
    check(t.state, 'exception', 'o corpo que estoura é exceção, não falha comum')
    check(/boom/.test(t.error?.message || ''), true, 'o erro é preservado')
  })

  test('log() do contexto vai para t.output, não para o stdout', async ({ check }) => {
    const t = node({ fn: ({ log }) => { log('oi') } })
    await runTest(t)
    check(t.output.length, 1, 'a linha foi capturada')
    check(t.output[0][0], 'log', 'com o canal')
  })

  test('console.log dentro do teste também é capturado', async ({ check }) => {
    const t = node({ fn: () => { console.log('vazou?') } })
    await runTest(t)
    check(t.output.some(([k]) => k === 'log'), true,
      'console.* não escapa de um teste verde')
  })
})
