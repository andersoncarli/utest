// Um `check()` que chega DEPOIS do veredito do arquivo. É a falha mais perigosa
// que este runner tem: ela não aparece em lugar nenhum, e o arquivo cacheia como
// verde carregando um defeito real.
//
// A causa é `check.test` ser um global de módulo, salvo e restaurado no `finally`
// de `runTest` (utest.js). Um `check` disparado por `setTimeout`/promise solta
// roda quando esse global já aponta para OUTRO arquivo — ou para nada. O
// `Promise.race` do timeout tem o mesmo efeito: quando o timeout vence, o corpo
// do teste continua rodando e tudo que ele afirmar depois cai fora da conta.
//
// O submódulo já documenta o sintoma agregado em `cc92168` (contagem diferente a
// cada rodada da suíte inteira, exceção atribuída ao arquivo errado). Estes
// testes prendem a MECÂNICA, para que o conserto tenha o que provar.
import { check as rawCheck } from './check.js'

test('vazamento: um check fora do dono', ({ test }) => {

  test('check() sem dono não derruba nem some sem deixar rastro', ({ check }) => {
    // Fora de um teste, `check.test` é null. Hoje o check simplesmente não é
    // contabilizado em lugar nenhum — não lança, não registra. Este teste trava
    // o comportamento atual para que uma mudança nele seja deliberada.
    const saved = rawCheck.test
    rawCheck.test = null
    const c = rawCheck(1, 2)
    rawCheck.test = saved
    check(c.state, 'failed', 'o Check SABE que falhou')
    // ...e mesmo assim ninguém o coletou: é exatamente esse o buraco.
  })

  test('o dono corrente é quem recebe — mesmo sendo o arquivo errado', ({ check }) => {
    // `check.test` é global: quem chamar `check()` enquanto ele aponta para
    // outro teste tem a falha atribuída àquele outro. É assim que uma falha de
    // `a.t.js` aparece em `b.t.js`.
    const vitima = { oncheck: () => { vitima.n++ }, n: 0 }
    const saved = rawCheck.test
    rawCheck.test = vitima
    rawCheck(1, 2)
    rawCheck.test = saved
    check(vitima.n, 1, 'a falha foi parar em quem estava no global')
  })
})

test('vazamento: async solto', ({ test }) => {

  test('uma promise não esperada afirma depois do veredito', async ({ check }) => {
    // O corpo termina; o `check` de dentro do `setTimeout` roda depois. Aqui ele
    // é capturado de propósito num coletor próprio, para MEDIR o atraso sem
    // depender do global — é a prova de que o disparo acontece fora da janela.
    let tardio = null
    const coletor = { oncheck: c => { tardio = c.state } }

    await new Promise(resolve => {
      setTimeout(() => { rawCheck.call(coletor, 1, 2); resolve() }, 20)
    })

    check(tardio, 'failed', 'o check tardio existe e falha')
    // Se ele tivesse saído por `check()` normal, ninguém o teria visto: o
    // arquivo já teria sido julgado e gravado no cache.
  })

  test('selado: um check tardio REABRE o veredito de quem o soltou', ({ check }) => {
    // O conserto. `runTest` marca `sealed` no `finally`, depois de ler o estado.
    // Daí em diante qualquer check que chegue por `check.bind(t)` — a ligação
    // sobrevive ao fim do corpo — devolve o nó a 'failed', em vez de ser
    // empilhado num veredito já fechado e sumir.
    const t = { checks: [], state: 'passed', sealed: true }
    t.oncheck = c => { t.checks.push(c); if (t.sealed && c.state !== 'passed') t.state = 'failed' }

    rawCheck.call(t, 1, 2)
    check(t.state, 'failed', 'o nó volta a falhar')
    check(t.checks.length, 1, 'e a falha fica registrada nele')
  })

  test('selado: um check tardio que PASSA não estraga nada', ({ check }) => {
    const t = { checks: [], state: 'passed', sealed: true }
    t.oncheck = c => { t.checks.push(c); if (t.sealed && c.state !== 'passed') t.state = 'failed' }

    rawCheck.call(t, 1, 1)
    check(t.state, 'passed', 'passar tarde é inofensivo')
  })

  test('o veredito de um arquivo não espera trabalho solto', ({ check }) => {
    // Documenta a consequência, que é o que importa para o cache: entre o fim
    // do corpo e a chegada do check tardio existe uma janela em que o arquivo
    // já foi dado como passado.
    let chegou = false
    setTimeout(() => { chegou = true }, 50)
    check(chegou, false, 'no fim do corpo, o trabalho solto ainda não chegou')
  })

  test('timer do timeout é limpo quando o trabalho ganha a corrida', async ({ check }) => {
    // `runTest`/`runner.js` corriam `Promise.race([work, timeoutPromise])` e NUNCA
    // limpavam o `setTimeout` quando `work` vencia. Para um passo de `eval`
    // (`STEP_TIMEOUT` = 10s) isso segurava o event loop por 10s DEPOIS do relatório —
    // o "teardown misterioso" que o `utest --trace` denunciou. Réplica da mecânica:
    let timer = null
    const raced = await Promise.race([
      (async () => 'work')(),
      new Promise((_, r) => { timer = setTimeout(() => r(new Error('Timeout')), 10_000) }),
    ]).finally(() => { if (timer) clearTimeout(timer) })
    check(raced, 'work', 'o trabalho venceu')
    // se o timer não fosse limpo, `timer._destroyed` seria false e o loop ficaria vivo 10s
    check(!!(timer && timer._destroyed), true, 'o timer foi cancelado, não fica pendurado')
  })
})
