// `kinds.js` é o vocabulário de sufixos, declarado uma vez. Um tipo que não é
// reconhecido aqui não dá erro: o arquivo simplesmente SOME da suíte, ou entra
// sem o shim. É a falha mais silenciosa que o runner tem.
import { register, kinds, testRe, loaderFilter, stripKind, kindOf, resetRegistry,
         registerExecutor, executorFor, registerEntries, entriesFor,
         registerPhaseSetup, phaseSetupFor } from './kinds.js'

test('kinds', ({ test }) => {

  test('reconhece o vocabulário inicial', ({ check }) => {
    check(kindOf('a.t.js'), 't', '.t.js')
    check(kindOf('a.test.js'), 'test', '.test.js')
    check(kindOf('a.it.js'), 'it', '.it.js')
    check(kindOf('a.tuit'), 'tuit', '.tuit — sem extensão de linguagem depois do tipo')
  })

  test('aceita .ts tanto quanto .js', ({ check }) => {
    check(kindOf('a.t.ts'), 't', '.t.ts')
    check(kindOf('a.test.ts'), 'test', '.test.ts')
  })

  test('um nome que não é teste devolve null', ({ check }) => {
    check(kindOf('a.js'), null, 'fonte comum')
    check(kindOf('atuit'), null, 'sem o ponto não casa')
    check(kindOf('a.t.js.bak'), null, 'o sufixo tem que estar no FIM')
  })

  test('stripKind tira só o sufixo de tipo', ({ check }) => {
    check(stripKind('pixel.classes.t.js'), 'pixel.classes', 'preserva pontos internos')
    check(stripKind('a.tuit'), 'a', '.tuit')
    check(stripKind('a.js'), 'a.js', 'nome que não é teste volta intacto')
  })

  test('register acrescenta um tipo às DUAS pontas', ({ check }) => {
    check(kindOf('a.eval.js'), null, 'antes de registrar, .eval.js não é teste')
    register('eval')
    check(kindOf('a.eval.js'), 'eval', 'depois passa a ser reconhecido')
    check(loaderFilter().test('a.eval.js'), true, 'e o filtro do onLoad também o vê')
    check(testRe().test('a.eval.js'), true, 'o regex de nome idem')
    resetRegistry()
    check(kindOf('a.eval.js'), null, 'resetRegistry devolve o vocabulário inicial')
  })

  test('testRe/loaderFilter são construídos a cada leitura', ({ check }) => {
    const antes = testRe()
    register('zz')
    const depois = testRe()
    check(antes.source === depois.source, false,
      'um regex guardado em const congelaria o vocabulário no import')
    resetRegistry()
  })

  test('kinds() lista o conjunto corrente', ({ check }) => {
    const base = kinds()
    check(base.includes('t') && base.includes('tuit'), true, 'traz os iniciais')
    register('zz')
    check(kinds().includes('zz'), true, 'e o que foi registrado')
    resetRegistry()
    check(kinds().includes('zz'), false, 'reset limpa')
  })

  test('executor por tipo: registra e recupera', ({ check }) => {
    const fn = async () => []
    check(executorFor('tuit'), null, 'sem executor registrado devolve null')
    registerExecutor('tuit', fn)
    check(executorFor('tuit') === fn, true, 'recupera o que foi registrado')
    resetRegistry()
    check(executorFor('tuit'), null, 'reset limpa o executor')
  })

  test('entries e phaseSetup por fase', ({ check }) => {
    const e = async () => []
    const s = async () => {}
    check(entriesFor('eval'), null, 'sem provider')
    registerEntries('eval', e)
    registerPhaseSetup('eval', s)
    check(entriesFor('eval') === e, true, 'entries recuperado')
    check(phaseSetupFor('eval') === s, true, 'phaseSetup recuperado')
    resetRegistry()
    check(entriesFor('eval'), null, 'reset limpa')
  })
})
