// A regra do cache vive nos timestamps do inode, então testá-la exige disco de
// verdade: um mock de `fs` provaria só que o mock concorda consigo mesmo. Cada
// caso monta um alvo, seus testes e suas deps num diretório próprio.
import { mkdtempSync, rmSync, writeFileSync, statSync, utimesSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { TestCache } from './cache.js'

const fixtures = []
const fixture = (files = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'utest-cache-'))
  fixtures.push(dir)
  for (const [name, body] of Object.entries(files)) {
    const full = join(dir, name)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return { dir, at: name => join(dir, name), cache: TestCache(dir) }
}

const cleanup = () => { for (const d of fixtures.splice(0)) rmSync(d, { recursive: true, force: true }) }

const SET = {
  'm.js':   'export const add = (a, b) => a + b\n',
  'dep.js': 'export const K = 1\n',
  'deep.js': "import { K } from './dep.js'\nexport const D = K\n",
  'm.t.js': "import { D } from './deep.js'\ntest('m', () => {})\n",
}

const ms = p => statSync(p).mtimeMs % 1000

test('cache: a regra do conjunto', ({ test }) => {

  test('grava e relê a contagem do próprio teste', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    check(cache.read(at('m.t.js'), at('m.js'))?.checks, 7)
    // O alvo cravado no segundo É o sinal de que o conjunto está verde.
    check(ms(at('m.js')), 0, 'alvo cravado no segundo')
    cleanup()
  })

  test('N testes dividem um alvo, cada um com a PRÓPRIA contagem', ({ check }) => {
    const { at, cache } = fixture({ ...SET,
      'm.extra.t.js': "test('e', () => {})\n",
      'm.more.t.js':  "test('o', () => {})\n" })

    cache.write(at('m.t.js'),     at('m.js'), { checks: 7 })
    cache.write(at('m.extra.t.js'), at('m.js'), { checks: 3 })
    cache.write(at('m.more.t.js'),  at('m.js'), { checks: 191 })

    check(cache.read(at('m.t.js'),      at('m.js'))?.checks, 7)
    check(cache.read(at('m.extra.t.js'), at('m.js'))?.checks, 3)
    check(cache.read(at('m.more.t.js'),  at('m.js'))?.checks, 191)
    cleanup()
  })

  test('uma falha marca o ALVO e derruba o conjunto inteiro', ({ check }) => {
    const { at, cache } = fixture({ ...SET, 'm.extra.t.js': "test('e', () => {})\n" })
    cache.write(at('m.t.js'),     at('m.js'), { checks: 7 })
    cache.write(at('m.extra.t.js'), at('m.js'), { checks: 3 })
    check(!!cache.read(at('m.extra.t.js'), at('m.js')), true, 'irmão verde antes')

    cache.write(at('m.t.js'), at('m.js'), { checks: 0, exception: true })

    check(ms(at('m.js')), 1, 'alvo marcado com 1ms')
    check(cache.read(at('m.t.js'),      at('m.js')), null, 'quem falhou não vale')
    // O irmão PASSOU e mesmo assim é invalidado: enquanto a falha está de pé,
    // nenhum teste do alvo é pulado.
    check(cache.read(at('m.extra.t.js'), at('m.js')), null, 'e o irmão que passou também não')
    cleanup()
  })

  test('conserto: o conjunto volta a valer quando todos passam', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 0, exception: true })
    check(ms(at('m.js')), 1)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    check(ms(at('m.js')), 0)
    check(cache.read(at('m.t.js'), at('m.js'))?.checks, 7)
    cleanup()
  })
})

test('cache: o que precisa INVALIDAR', ({ test }) => {

  const mutated = mutate => {
    const f = fixture(SET)
    f.cache.write(f.at('m.t.js'), f.at('m.js'), { checks: 7 })
    mutate(f)
    return f.cache.read(f.at('m.t.js'), f.at('m.js'))
  }

  test('o ALVO editado — mesmo dentro do mesmo segundo', ({ check }) => {
    // Era este o furo do bucket de MINUTO: o alvo mudava, o bucket não, e o
    // teste era pulado como verde sobre código já quebrado.
    check(mutated(f => writeFileSync(f.at('m.js'), 'export const add = (a,b) => a*b\n')), null)
    cleanup()
  })

  test('o TESTE editado — o ms fracionário o denuncia', ({ check }) => {
    // Um arquivo ESCRITO cai em ms fracionário; `utimesSync` grava inteiro.
    // Sem essa checagem, o ms real da edição virava "contagem" e o cache
    // devolvia um número que nunca rodou.
    check(mutated(f => writeFileSync(f.at('m.t.js'), "test('x', () => {})\n")), null)
    cleanup()
  })

  test('uma dep DIRETA editada', ({ check }) => {
    check(mutated(f => writeFileSync(f.at('deep.js'), 'export const D = 9\n')), null)
    cleanup()
  })

  test('uma dep TRANSITIVA, a dois saltos', ({ check }) => {
    // O caso `PANEL_BORDER`: o `export` sumiu em scl/theme-params.js, dois
    // saltos além do alvo pareado, e o cache servia verde sobre a árvore morta.
    check(mutated(f => writeFileSync(f.at('dep.js'), 'export const K = 2\n')), null)
    cleanup()
  })

  test('uma dep que SUMIU do disco', ({ check }) => {
    check(mutated(f => rmSync(f.at('dep.js'))), null)
    cleanup()
  })

  test('o alvo destravado por quem não é o runner', ({ check }) => {
    check(mutated(f => {
      const t = new Date(Date.now() + 3000)
      utimesSync(f.at('m.js'), t, t)
    }), null, 'ms ≠ 0 significa tocado pelo mundo')
    cleanup()
  })

  test('bust() invalida na hora', ({ check }) => {
    check(mutated(f => f.cache.bust(f.at('m.t.js'))), null)
    cleanup()
  })

  test('quem falha volta para o PRESENTE, não para uma sentinela', ({ check }) => {
    // A regra: uma falha devolve o teste ao agora, e o agora está fora do
    // segundo cravado do conjunto — então ele deixa de casar pelo mesmo
    // critério que vale para todo o resto, sem valor mágico a decorar.
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    const antes = Date.now()
    cache.bust(at('m.t.js'))
    const depois = statSync(at('m.t.js')).mtimeMs

    check(depois >= antes, true, 'o carimbo é o presente')
    check(Number.isInteger(depois), false, 'com fração: não é um carimbo do runner')
    check(cache.read(at('m.t.js'), at('m.js')), null, 'e portanto não vale')
    cleanup()
  })

  test('um alvo que nunca foi carimbado não vale', ({ check }) => {
    const { at, cache } = fixture(SET)
    check(cache.read(at('m.t.js'), at('m.js')), null)
    cleanup()
  })
})

test('cache: o grafo de dependências', ({ test }) => {

  test('segue import de EFEITO COLATERAL, sem `from`', ({ check }) => {
    // A forma dominante neste repo — é assim que um plugin se registra. O
    // regex antigo só via `... from '...'`, e `scl/button.t.js` ficava com
    // ZERO deps: nada do que ele carrega invalidava nada.
    const { at, cache, dir } = fixture({
      'plug.js': 'globalThis.x = 1\n',
      'a.t.js':  "import './plug.js'\ntest('a', () => {})\n",
    })
    check(cache.deps(at('a.t.js')), [join(dir, 'plug.js')])
    cleanup()
  })

  test('segue `from`, dinâmico e re-export', ({ check }) => {
    const { at, cache } = fixture({
      'x.js': 'export const x = 1\n',
      'y.js': 'export const y = 2\n',
      'z.js': 'export const z = 3\n',
      'a.t.js': "import { x } from './x.js'\nexport * from './y.js'\nconst p = () => import('./z.js')\ntest('a', () => {})\n",
    })
    check(cache.deps(at('a.t.js')).length, 3)
    cleanup()
  })

  test('atravessa vários saltos e não repete', ({ check }) => {
    const { at, cache } = fixture(SET)
    const d = cache.deps(at('m.t.js')).sort()
    check(d.length, 2, 'deep.js e dep.js')
    check(new Set(d).size, d.length, 'sem duplicata')
    cleanup()
  })

  test('um ciclo não trava a caminhada', ({ check }) => {
    const { at, cache } = fixture({
      'a.js': "import './b.js'\n",
      'b.js': "import './a.js'\n",
      'a.t.js': "import './a.js'\ntest('a', () => {})\n",
    })
    check(cache.deps(at('a.t.js')).length, 2)
    cleanup()
  })

  test('ignora pacote externo e caminho fora da raiz', ({ check }) => {
    const { at, cache } = fixture({
      'a.t.js': "import 'minimatch'\nimport '../fora.js'\ntest('a', () => {})\n",
    })
    check(cache.deps(at('a.t.js')), [])
    cleanup()
  })

  test('um import que não resolve não quebra nem entra', ({ check }) => {
    const { at, cache } = fixture({
      'a.t.js': "import './sumiu.js'\ntest('a', () => {})\n",
    })
    check(cache.deps(at('a.t.js')), [])
    cleanup()
  })
})

test('cache: sem alvo, o resultado vai para o sidecar', ({ test }) => {

  test('grava e relê', ({ check }) => {
    const { at, cache } = fixture({ 'solo.t.js': "test('s', () => {})\n" })
    cache.write(at('solo.t.js'), null, { checks: 5, tests: 1 })
    check(cache.read(at('solo.t.js'), null)?.checks, 5)
    cleanup()
  })

  test('editar o teste invalida', ({ check }) => {
    const { at, cache } = fixture({ 'solo.t.js': "test('s', () => {})\n" })
    cache.write(at('solo.t.js'), null, { checks: 5, tests: 1 })
    writeFileSync(at('solo.t.js'), "test('outro', () => {})\n")
    check(cache.read(at('solo.t.js'), null), null)
    cleanup()
  })

  test('uma dep editada invalida', ({ check }) => {
    const { at, cache } = fixture({
      'lib.js': 'export const L = 1\n',
      'solo.t.js': "import './lib.js'\ntest('s', () => {})\n",
    })
    cache.write(at('solo.t.js'), null, { checks: 5, tests: 1 })
    writeFileSync(at('lib.js'), 'export const L = 2\n')
    check(cache.read(at('solo.t.js'), null), null)
    cleanup()
  })

  test('exceção não vira cache', ({ check }) => {
    const { at, cache } = fixture({ 'solo.t.js': "test('s', () => {})\n" })
    cache.write(at('solo.t.js'), null, { checks: 0, exception: true })
    check(cache.read(at('solo.t.js'), null), null)
    cleanup()
  })
})

test('cache: bordas que não podem derrubar o runner', ({ test }) => {

  test('ler o que não existe devolve null, não lança', ({ check }) => {
    const { at, cache } = fixture(SET)
    check(cache.read(at('nao-existe.t.js'), at('m.js')), null)
    check(cache.read(at('m.t.js'), at('nao-existe.js')), null)
    cleanup()
  })

  test('gravar contra alvo inexistente não lança', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('nao-existe.js'), { checks: 7 })
    check(true, 'sobreviveu')
    cleanup()
  })

  test('a contagem satura no teto do campo', ({ check }) => {
    // 999 é o teto do ms. Acima disso o cache reporta MENOS do que rodou — o
    // preço de caber no mtime. O furo só encolhe um número exibido; nunca
    // pinta de verde o que falhou.
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 5000 })
    check(cache.read(at('m.t.js'), at('m.js'))?.checks, 999)
    cleanup()
  })

  test('checks:0 sem exceção também não cacheia', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 0 })
    check(cache.read(at('m.t.js'), at('m.js')), null)
    cleanup()
  })
})
