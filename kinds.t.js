// O vocabulário de sufixos é o que decide se um arquivo entra na suíte e se ele
// recebe o shim. Estava duplicado em cinco lugares; um esquecido não dá erro —
// o arquivo só some, ou entra sem shim.
import { testRe, loaderFilter, stripKind, kinds, register, registerExecutor, executorFor, registerEntries, entriesFor, registerPhaseSetup, phaseSetupFor, resetRegistry } from './kinds.js'

test('kinds: o vocabulário reconhecido', ({ test }) => {

  test('os quatro tipos de sempre', ({ check }) => {
    const re = testRe()
    check(re.test('a.t.js'), true)
    check(re.test('a.test.js'), true)
    check(re.test('a.it.js'), true)
    check(re.test('a.t.ts'), true, 'TypeScript também')
  })

  test('`.tuit` casa SEM extensão de linguagem depois', ({ check }) => {
    // O regex antigo listava `tuit` na alternância mas exigia `.js|.ts` depois,
    // então um `.tuit` puro — que é o formato de snapshot — nunca casava.
    check(testRe().test('layout.tuit'), true)
  })

  test('fonte comum não é teste', ({ check }) => {
    const re = testRe()
    check(re.test('pixel.js'), false)
    check(re.test('button.md'), false)
    check(re.test('nao.eval.js'), false, 'eval não é do vocabulário base')
  })

  test('o filtro do loader tem o mesmo alcance do matcher', ({ check }) => {
    // As duas pontas precisam concordar: um arquivo que o scanner colhe e o
    // plugin não carrega roda sem shim.
    const a = testRe(), b = loaderFilter()
    for (const n of ['a.t.js', 'a.tuit', 'a.test.ts', 'pixel.js'])
      check(a.test(n), b.test(n), n)
  })

  test('stripKind tira só o sufixo de tipo', ({ check }) => {
    check(stripKind('pixel.classes.t.js'), 'pixel.classes')
    check(stripKind('m.test.js'), 'm')
    check(stripKind('layout.tuit'), 'layout')
  })
})

test('kinds: o gancho de extensão', ({ test }) => {

  test('register() abre um tipo novo nas DUAS pontas', ({ check }) => {
    // É por aqui que um consumidor externo (o `sprint eval`, que roda
    // `.eval.js`) reusa o runner sem forkar o regex.
    check(testRe().test('5.33.eval.js'), false, 'antes: não reconhecido')
    register('eval')
    check(testRe().test('5.33.eval.js'), true, 'depois: matcher reconhece')
    check(loaderFilter().test('5.33.eval.js'), true, 'e o loader também')
    check(kinds().includes('eval'), true)
  })

  test('register() é idempotente', ({ check }) => {
    const antes = kinds().length
    register('eval')
    register('eval')
    check(kinds().length, antes, 'não duplica um tipo já registrado')
  })

  test('registerPhaseSetup — um recurso que a fase monta 1×', ({ check }) => {
    check(phaseSetupFor('bogus'), null, 'fase sem setup → null')
    const fn = async () => () => {}
    registerPhaseSetup('demo', fn)
    check(phaseSetupFor('demo'), fn, 'depois de registrar, devolve a fn')
  })

  test('resetRegistry — devolve o registry ao estado do import', ({ check }) => {
    // A rede de segurança do `utest.js` entre fases: um `*.t.js` da fase `unit` pode ter
    // chamado `register*` por conta própria (o `.t.js` do adapter da fase `eval` faz
    // `registerEvalPhase({ entries })`), e sem reset a fase `eval` seguinte pega o
    // provider-fixture (0 entries) — e some do relatório de `utest .`.
    register('reg-demo')
    registerExecutor('reg-demo', () => [])
    registerEntries('reg-demo', async () => [])
    registerPhaseSetup('reg-demo', async () => {})
    check(kinds().includes('reg-demo'), true, 'antes do reset: registrado')
    check(typeof executorFor('reg-demo'), 'function')
    check(typeof entriesFor('reg-demo'), 'function')
    check(typeof phaseSetupFor('reg-demo'), 'function')

    resetRegistry()

    // O vocabulário inicial, não o que os testes acima deixaram (`eval`): o reset volta ao
    // conjunto do import, e é isso que garante que a fase seguinte parte limpa.
    check(kinds().slice().sort(), ['it', 't', 'test', 'tuit'], 'KINDS volta ao vocabulário inicial')
    check(executorFor('reg-demo'), null, 'executor limpo')
    check(entriesFor('reg-demo'), null, 'entry-provider limpo')
    check(phaseSetupFor('reg-demo'), null, 'phase-setup limpo')
    check(phaseSetupFor('demo'), null, 'e o `demo` do teste anterior também foi zerado')
  })
})

// `register()` muda estado de módulo; `resetRegistry()` é o único jeito de desfazer, e é o
// que o `utest.js` chama entre fases. O bloco de extensão ainda vem por último porque os
// testes que afirmam o vocabulário base não devem correr depois de um `register` solto.
