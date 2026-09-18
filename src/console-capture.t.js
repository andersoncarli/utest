// `console.*` é global: se o runner não o restaurar, o vazamento contamina todo
// o resto da suíte — e um teste verde que imprime lixo no stdout estraga o
// relatório compacto, que é o desenho do utest.
import { captureConsole } from './console-capture.js'

const fakeT = () => ({ output: [] })

test('console-capture', ({ test }) => {

  test('redireciona log/error/warn/info para t.output', ({ check }) => {
    const t = fakeT()
    const release = captureConsole(t)
    console.log('a')
    console.error('b')
    console.warn('c')
    console.info('d')
    release()
    check(t.output.length, 4, 'os quatro canais são capturados')
    check(t.output[0][0], 'log', 'o canal é gravado junto')
    check(t.output[1][0], 'error', 'error')
    check(t.output[2][0], 'warn', 'warn')
    check(t.output[3][0], 'info', 'info')
  })

  test('preserva os argumentos da chamada', ({ check }) => {
    const t = fakeT()
    const release = captureConsole(t)
    console.log('x', 1, { k: 2 })
    release()
    check(t.output[0][1].length, 3, 'todos os argumentos chegam')
    check(t.output[0][1][0], 'x', 'primeiro argumento')
    check(t.output[0][1][1], 1, 'segundo argumento')
  })

  test('o release restaura o console original', ({ check }) => {
    const antes = console.log
    const release = captureConsole(fakeT())
    check(console.log === antes, false, 'durante a captura o console está trocado')
    release()
    check(console.log === antes, true, 'depois do release volta a ser o mesmo')
  })

  test('nada vaza para o console real durante a captura', ({ check }) => {
    const t = fakeT()
    let vazou = false
    const original = console.log
    console.log = () => { vazou = true }
    const release = captureConsole(t)
    console.log('não deve vazar')
    release()
    console.log = original
    check(vazou, false, 'o console de baixo não é chamado')
    check(t.output.length, 1, 'a linha foi para t.output')
  })

  test('capturas aninhadas restauram em ordem', ({ check }) => {
    const raiz = console.log
    const t1 = fakeT(), t2 = fakeT()
    const r1 = captureConsole(t1)
    const r2 = captureConsole(t2)
    console.log('interno')
    r2()
    console.log('externo')
    r1()
    check(console.log === raiz, true, 'o console volta ao original no fim')
    check(t2.output.length, 1, 'a captura interna pegou a sua linha')
    check(t1.output.length, 1, 'a externa pegou a dela depois do release interno')
  })

  test('restaura mesmo quando o corpo lança', ({ check }) => {
    const raiz = console.log
    const release = captureConsole(fakeT())
    try { throw new Error('boom') } catch {} finally { release() }
    check(console.log === raiz, true, 'o finally do chamador restaura')
  })
})
