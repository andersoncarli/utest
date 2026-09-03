// O vocabulário de sufixos é o que decide se um arquivo entra na suíte e se ele
// recebe o shim. Estava duplicado em cinco lugares; um esquecido não dá erro —
// o arquivo só some, ou entra sem shim.
import { testRe, loaderFilter, stripKind, kinds, register, registerPhaseSetup, phaseSetupFor } from './kinds.js'

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
})

// `register()` muda estado de módulo e não há como desfazer: por isso o bloco
// de extensão vem por último, depois de todo teste que afirma o vocabulário base.
