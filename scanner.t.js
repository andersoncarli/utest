// `scan()` decide o que É teste, o que cada teste MEDE e o que ficou sem
// cobertura. Errar aqui não deixa rastro: um arquivo fora do include some da
// suíte sem nunca aparecer como falha.
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative } from 'path'
import { scan, findTarget } from './scanner.js'

const dirs = []
const fixture = (files = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'utest-scan-'))
  dirs.push(dir)
  for (const [name, body] of Object.entries(files)) {
    const full = join(dir, name)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return dir
}
const cleanup = () => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) }

const YAML = 'exclude:\n  - node_modules/**\nunit:\n  include:\n    - "**/*.t.js"\n    - "**/*.test.js"\n'
const run = (dir, yaml = YAML, phase = 'unit') => {
  writeFileSync(join(dir, 'TEST.yaml'), yaml)
  const r = scan(dir, join(dir, 'TEST.yaml'), phase)
  return {
    ...r,
    names: r.entries.map(e => relative(dir, e.path)).sort(),
    pairs: Object.fromEntries(r.entries.map(e =>
      [relative(dir, e.path), e.target ? relative(dir, e.target) : null])),
    uncoveredNames: r.uncovered.map(f => relative(dir, f)).sort(),
  }
}

test('findTarget: o alvo que um teste mede', ({ test }) => {

  test('o par direto, .t.js e .test.js', ({ check }) => {
    const d = fixture({ 'm.js': '', 'm.t.js': '', 'n.js': '', 'n.test.js': '' })
    check(findTarget(join(d, 'm.t.js')), join(d, 'm.js'))
    check(findTarget(join(d, 'n.test.js')), join(d, 'n.js'))
    cleanup()
  })

  test('descasca ponto a ponto até achar', ({ check }) => {
    // `pixel.classes.t.js` mede `pixel.js`: é assim que N testes dividem um
    // alvo, cada um cobrindo uma face dele.
    const d = fixture({ 'pixel.js': '', 'pixel.classes.t.js': '' })
    check(findTarget(join(d, 'pixel.classes.t.js')), join(d, 'pixel.js'))
    cleanup()
  })

  test('prefere o par exato ao descascado', ({ check }) => {
    const d = fixture({ 'a.js': '', 'a.b.js': '', 'a.b.t.js': '' })
    check(findTarget(join(d, 'a.b.t.js')), join(d, 'a.b.js'))
    cleanup()
  })

  test('sem alvo no disco, devolve null', ({ check }) => {
    const d = fixture({ 'orfao.t.js': '' })
    check(findTarget(join(d, 'orfao.t.js')), null)
    cleanup()
  })

  test('não atravessa pasta: o alvo é irmão', ({ check }) => {
    const d = fixture({ 'm.js': '', 'sub/m.t.js': '' })
    check(findTarget(join(d, 'sub', 'm.t.js')), null)
    cleanup()
  })

  test('.eval.js pareia com o .js de mesmo nome-base', ({ check }) => {
    // `slider.eval.js` prova `slider.js` — a mesma regra do `.t.js`.
    const d = fixture({ 'slider.js': '', 'slider.eval.js': '' })
    check(findTarget(join(d, 'slider.eval.js')), join(d, 'slider.js'))
    cleanup()
  })

  test('.eval.js de feature (sem .js irmão) pareia com o N.F-*.md', ({ check }) => {
    // Um roteiro de feature nomeia o assunto como string em `render()`; o alvo é
    // o `.md` da feature, e o `files:` dele é o grafo de dep que o cache caminha.
    const d = fixture({ '1.1-geometria-nao-destrutiva.md': '# f\n', '1.1.eval.js': '' })
    check(findTarget(join(d, '1.1.eval.js')), join(d, '1.1-geometria-nao-destrutiva.md'))
    cleanup()
  })

  test('.eval.js sem .js nem .md casando devolve null', ({ check }) => {
    const d = fixture({ '9.9.eval.js': '' })
    check(findTarget(join(d, '9.9.eval.js')), null)
    cleanup()
  })

  test('.eval.js NÃO pareia com o próprio arquivo', ({ check }) => {
    // O strip progressivo `1.1.eval.js` → `1.1.eval` + `.js` daria o próprio
    // arquivo; a variante `.eval.js` → `.js` e o guard `v === name` impedem.
    const d = fixture({ '1.1.eval.js': '' })
    check(findTarget(join(d, '1.1.eval.js')), null)
    cleanup()
  })
})

test('scan: o que entra na suíte', ({ test }) => {

  test('acha teste em qualquer profundidade', ({ check }) => {
    const d = fixture({ 'a.t.js': '', 'sub/b.t.js': '', 'sub/mais/c.t.js': '' })
    check(run(d).names, ['a.t.js', 'sub/b.t.js', 'sub/mais/c.t.js'])
    cleanup()
  })

  test('fonte não é teste, e vira cobertura pendente', ({ check }) => {
    const d = fixture({ 'm.js': '', 'm.t.js': '', 'sozinho.js': '' })
    const r = run(d)
    check(r.names, ['m.t.js'])
    // `m.js` tem teste; `sozinho.js` não — e é isso que `--uncovered` mostra.
    check(r.uncoveredNames.includes('sozinho.js'), true)
    check(r.uncoveredNames.includes('m.js'), false)
    cleanup()
  })

  test('um include largo não faz a fonte sumir da cobertura', ({ check }) => {
    // `include: '**/*.js'` (a fase `unit` deste repo) casa a FONTE junto do teste. Quem
    // decide o que é teste é o kind, não o include — mandar a fonte para `tests` a fazia
    // ser filtrada por `isTest` depois e sumir das duas listas: cobertura sempre 100%.
    const d = fixture({ 'm.js': '', 'm.t.js': '', 'sozinho.js': '' })
    const r = run(d, 'exclude:\n  - node_modules/**\nunit:\n  include:\n    - "**/*.js"\n')
    check(r.names, ['m.t.js'])
    check(r.uncoveredNames, ['sozinho.js'])
    cleanup()
  })

  test('o exclude global tira do caminho', ({ check }) => {
    const d = fixture({ 'a.t.js': '', 'node_modules/lib/b.t.js': '' })
    check(run(d).names, ['a.t.js'])
    cleanup()
  })

  test('o exclude da FASE soma ao global', ({ check }) => {
    const d = fixture({ 'a.t.js': '', 'lento.live.t.js': '' })
    const yaml = YAML + '  exclude:\n    - "**/*.live.t.js"\n'
    check(run(d, yaml).names, ['a.t.js'])
    cleanup()
  })

  test('cada fase enxerga o seu conjunto', ({ check }) => {
    const d = fixture({ 'a.t.js': '', 'b.int.t.js': '' })
    const yaml = 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n  exclude:\n    - "**/*.int.t.js"\nintegration:\n  include:\n    - "**/*.int.t.js"\n'
    check(run(d, yaml, 'unit').names, ['a.t.js'])
    check(run(d, yaml, 'integration').names, ['b.int.t.js'])
    cleanup()
  })

  test('o par é resolvido na entrada', ({ check }) => {
    const d = fixture({ 'm.js': '', 'm.t.js': '', 'orfao.t.js': '' })
    check(run(d).pairs, { 'm.t.js': 'm.js', 'orfao.t.js': null })
    cleanup()
  })

  test('toda entrada nasce com o veredito do cache', ({ check }) => {
    // Nada carimbado ainda: `cache` é null e o arquivo roda. Um `undefined`
    // aqui seria pior que null — passaria por "cacheado" num `if (entry.cache)`.
    const d = fixture({ 'm.js': '', 'm.t.js': '' })
    check(run(d).entries[0].cache, null)
    cleanup()
  })

  test('devolve o cache da raiz para quem for gravar', ({ check }) => {
    const d = fixture({ 'm.js': '', 'm.t.js': '' })
    const { cache } = run(d)
    // É por aqui que os runners gravam sem nunca importar `cache.js`.
    check(typeof cache?.write, 'function')
    check(typeof cache?.read, 'function')
    check(typeof cache?.bust, 'function')
    cleanup()
  })

  test('uma raiz sem teste nenhum devolve vazio, não quebra', ({ check }) => {
    const d = fixture({ 'leiame.md': '' })
    const r = run(d)
    check(r.entries, [])
    check(r.names, [])
    cleanup()
  })

  test('sem a chave da fase, cai no include padrão', ({ check }) => {
    const d = fixture({ 'a.t.js': '' })
    check(run(d, 'exclude: []\n').names, ['a.t.js'])
    cleanup()
  })
})
