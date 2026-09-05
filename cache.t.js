// A regra do cache vive nos timestamps do inode, então testá-la exige disco de
// verdade: um mock de `fs` provaria só que o mock concorda consigo mesmo. Cada
// caso monta um alvo, seus testes e suas deps num diretório próprio.
import { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync, utimesSync, mkdirSync, existsSync } from 'fs'
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

// Toda falha comum cacheia igual ao verde — o que atualiza o cache é sempre a
// ÚLTIMA execução real (passou ou falhou), e só uma mudança de verdade (mtime do
// alvo/teste/dep) ou `--force` dispara outra. Exceção é a ÚNICA categoria que
// nunca cacheia (ver bloco `cache: EXCEÇÃO nunca cacheia` mais abaixo).
test('cache: falha comum cacheia — mesma regra do verde, resposta oposta', ({ test }) => {

  test('exceção nunca cacheia — sempre re-roda', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 0, exception: true })
    check(cache.read(at('m.t.js'), at('m.js')), null, 'exceção: null, re-roda')
    cleanup()
  })

  test('falha comum é reusada e vem com failed:true', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 0, exception: false })
    const hit = cache.read(at('m.t.js'), at('m.js'))
    check(hit?.failed, true, 'o cache diz falhou')
    check(hit?.checks, 0)
    check(ms(at('m.js')), 1, 'o alvo continua marcado 1ms — o conjunto não vale como verde')
    cleanup()
  })

  test('o alvo reeditado invalida o vermelho cacheado', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 0 })
    check(cache.read(at('m.t.js'), at('m.js'))?.failed, true)
    // alguém edita o alvo → sai do segundo+1ms em que o sidecar foi carimbado
    const future = new Date(Date.now() + 5000)
    utimesSync(at('m.js'), future, future)
    check(cache.read(at('m.t.js'), at('m.js')), null, 'alvo mexeu: re-roda')
    cleanup()
  })

  test('uma dep mexida invalida o vermelho cacheado', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 0 })
    check(cache.read(at('m.t.js'), at('m.js'))?.failed, true)
    const future = new Date(Date.now() + 5000)
    utimesSync(at('dep.js'), future, future)   // dep transitiva de m.t.js
    check(cache.read(at('m.t.js'), at('m.js')), null, 'dep mexeu: re-roda')
    cleanup()
  })

  test('conserto: passar limpa o sidecar de falha', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 0 })
    check(cache.read(at('m.t.js'), at('m.js'))?.failed, true)
    cache.write(at('m.t.js'), at('m.js'), { checks: 5 })   // agora passa
    const hit = cache.read(at('m.t.js'), at('m.js'))
    check(hit?.checks, 5, 'verde')
    check(hit?.failed ?? false, false, 'sem resquício de failed')
    cleanup()
  })

  test('extraDeps também governam o vermelho cacheado', ({ check }) => {
    const { at, cache } = fixture({ ...SET, 'far.js': 'export const F = 1\n' })
    cache.write(at('m.t.js'), at('m.js'), { checks: 0 }, { extraDeps: [at('far.js')] })
    check(cache.read(at('m.t.js'), at('m.js'), { extraDeps: [at('far.js')] })?.failed, true)
    const future = new Date(Date.now() + 5000)
    utimesSync(at('far.js'), future, future)
    check(cache.read(at('m.t.js'), at('m.js'), { extraDeps: [at('far.js')] }), null, 'extraDep mexeu: re-roda')
    cleanup()
  })

  test('--force é decisão de FORA — cache.read continua servindo o vermelho cacheado', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 0 })
    const hit = cache.read(at('m.t.js'), at('m.js'))
    check(hit?.failed, true, 'o veredito em si é HIT — quem decide ignorar é utest.js sob --force')
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

  test('extraRoots ampliam o walk — o alvo cujas deps não são `import`', ({ check }) => {
    // Um `.eval.js` cujo assunto é uma string passada a `render()`: o grafo
    // estático dele é vazio, e o `files:` do `.md` de feature entra por aqui.
    const { at, cache, dir } = fixture({
      'sub.js':  'export const S = 1\n',
      'feat.js': "import './sub.js'\n",
      'e.eval.js': "export default (t) => {}\n",   // não importa nada
    })
    check(cache.deps(at('e.eval.js')), [], 'sem extraRoots, grafo vazio')
    const d = cache.deps(at('e.eval.js'), [join(dir, 'feat.js')]).sort()
    check(d, [join(dir, 'feat.js'), join(dir, 'sub.js')].sort(), 'extraRoot + o que ele importa')
    cleanup()
  })
})

test('cache: alvo pareado com extraDeps — o modelo do `.eval.js`', ({ test }) => {
  // O alvo é um `.md` de feature (não importa nada); o grafo real vem do
  // `files:` do frontmatter, passado como `extraDeps`. O crava do `.md` continua
  // sendo o "segundo comum" do protocolo — `extraDeps` só amplia o teste de deps.
  const EVAL_SET = {
    'feat.md':   '# feature\n',
    'sub.js':    'export const S = 1\n',
    'src.js':    "import './sub.js'\nexport const V = 1\n",
    'f.eval.js': "export default (t) => {}\n",
  }

  test('grava e relê com extraDeps fresco', ({ check }) => {
    const { at, cache } = fixture(EVAL_SET)
    cache.write(at('f.eval.js'), at('feat.md'), { checks: 4 }, { extraDeps: [at('src.js')] })
    check(cache.read(at('f.eval.js'), at('feat.md'), { extraDeps: [at('src.js')] })?.checks, 4)
    check(ms(at('feat.md')), 0, 'o .md cravado no segundo')
    cleanup()
  })

  test('uma dep de extraDeps editada invalida', ({ check }) => {
    const { at, cache } = fixture(EVAL_SET)
    cache.write(at('f.eval.js'), at('feat.md'), { checks: 4 }, { extraDeps: [at('src.js')] })
    writeFileSync(at('src.js'), "import './sub.js'\nexport const V = 2\n")
    check(cache.read(at('f.eval.js'), at('feat.md'), { extraDeps: [at('src.js')] }), null)
    cleanup()
  })

  test('uma dep TRANSITIVA de extraDeps invalida', ({ check }) => {
    const { at, cache } = fixture(EVAL_SET)
    cache.write(at('f.eval.js'), at('feat.md'), { checks: 4 }, { extraDeps: [at('src.js')] })
    writeFileSync(at('sub.js'), 'export const S = 2\n')   // dois saltos: src.js → sub.js
    check(cache.read(at('f.eval.js'), at('feat.md'), { extraDeps: [at('src.js')] }), null)
    cleanup()
  })

  test('um arquivo de extraDeps que sumiu do disco invalida', ({ check }) => {
    // O provider (`utest-phase.js`) filtra `files:` inexistente ANTES de chamar
    // o cache; mas um `files:` que some ENTRE gravar e reler é sinal real — a
    // feature apagou algo que declara tocar. Mesma regra que já vale para deps.
    const { at, cache } = fixture(EVAL_SET)
    cache.write(at('f.eval.js'), at('feat.md'), { checks: 4 }, { extraDeps: [at('src.js')] })
    rmSync(at('src.js'))
    check(cache.read(at('f.eval.js'), at('feat.md'), { extraDeps: [at('src.js')] }), null)
    cleanup()
  })

  test('extraDeps vazio = protocolo pareado puro (o `.t.js` comum)', ({ check }) => {
    const { at, cache } = fixture(EVAL_SET)
    cache.write(at('f.eval.js'), at('feat.md'), { checks: 4 })
    check(cache.read(at('f.eval.js'), at('feat.md'))?.checks, 4)
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

  test('checks:0 sem exceção CACHEIA como vermelho — falha comum não é mais especial', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 0 })
    const hit = cache.read(at('m.t.js'), at('m.js'))
    check(hit?.failed, true, 'vermelho reusável enquanto nada mudar')
    check(hit?.exception, false)
    cleanup()
  })

  test('results — store hierárquico por fase, get/record/flush/fresh', ({ check }) => {
    const { dir, at, cache } = fixture(SET)
    check(cache.results.get('unit', at('m.t.js')), null, 'vazio no início')
    cache.results.record('unit', at('m.t.js'), { ms: 42, tests: 3, checks: 9, failCount: 1, state: 'failed' })
    const r = cache.results.get('unit', at('m.t.js'))
    check(r.ms, 42); check(r.tests, 3); check(r.checks, 9); check(r.state, 'failed')
    check(cache.results.fresh('unit', at('m.t.js')), true, 'recém-gravado bate com o disco')
    check(cache.results.get('eval', at('m.t.js')), null, 'outra fase não vê o registro')
    cache.results.flush()
    // o arquivo mora na raiz-do-projeto (aqui o tmpdir não tem `.git`/`TEST.yaml`, então
    // `findProjectRoot` cai no próprio `dir`), sob `.utest/results.json`
    check(existsSync(join(dir, '.utest', 'results.json')), true, 'flush escreveu o arquivo')
    // uma nova instância relê o que foi persistido
    const c2 = TestCache(dir)
    check(c2.results.get('unit', at('m.t.js'))?.ms, 42, 'persistiu entre instâncias')
    cleanup()
  })

  test('results.fresh — falso quando o teste foi reeditado', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.results.record('unit', at('m.t.js'), { ms: 10, tests: 1, checks: 1, state: 'passed' })
    check(cache.results.fresh('unit', at('m.t.js')), true)
    const future = new Date(Date.now() + 5000)
    utimesSync(at('m.t.js'), future, future)
    check(cache.results.fresh('unit', at('m.t.js')), false, 'mtime mudou → stale')
    cleanup()
  })

  test('results.list — o índice: chaves por fase, ou de todas', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.results.record('unit', at('a.t.js'), { ms: 1, state: 'passed' })
    cache.results.record('unit', at('b.t.js'), { ms: 2, state: 'passed' })
    cache.results.record('eval', at('a.t.js'), { ms: 3, state: 'passed' })
    const uni = cache.results.list('unit')
    check(uni.length, 2, 'só a fase unit')
    check(uni.every(e => e.phase === 'unit' && e.abspath.endsWith(e.relpath)), true, 'phase/relpath/abspath')
    const all = cache.results.list()
    check(all.length, 3, 'sem fase → todas')
    check(new Set(all.map(e => e.relpath)).size, 2, 'a.t.js aparece em 2 fases, b.t.js em 1')
    cleanup()
  })
})

test('cache: a árbitro — results.json cruza o veredito do mtime cravado', ({ test }) => {

  test('caminho feliz: os dois concordam em HIT', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    check(cache.read(at('m.t.js'), at('m.js'))?.checks, 7)
    cleanup()
  })

  test('mtime diz HIT, results.json não tem record para esta fase → MISS', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 }, { phase: 'unit' })
    check(cache.read(at('m.t.js'), at('m.js'), { phase: 'eval' }), null, 'fase diferente não tem histórico')
    cleanup()
  })

  test('mtime diz HIT, results.json diverge (record aponta pra outro mtime) → MISS', ({ check }) => {
    const { dir, at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    cache.results.flush()
    // Edita o `results.json` no disco pra simular um histórico que ficou pra trás
    // (ex.: uma cópia/checkout trouxe um resultado antigo) — sem tocar em nada
    // no disco além do JSON. Uma NOVA instância relê esse arquivo editado.
    const resultsFile = join(dir, '.utest', 'results.json')
    const raw = JSON.parse(readFileSync(resultsFile, 'utf8'))
    raw.phases.unit.files['m.t.js'].mtime = 1   // valor que nunca bate com o disco real
    writeFileSync(resultsFile, JSON.stringify(raw))
    const c2 = TestCache(dir)
    check(c2.read(at('m.t.js'), at('m.js')), null, 'mtime cravado dizia HIT, histórico discorda → MISS')
    cleanup()
  })

  test('mtime diz MISS por segundo dessincronizado, results.json confirma → promove a HIT', ({ check }) => {
    const { dir, at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    cache.results.flush()
    // Dessincroniza SÓ o mtime cravado do alvo (fração não-zero — "destravado"),
    // sem editar o CONTEÚDO. `results.json` já tem o `targetMtime` gravado —
    // sincroniza ele TAMBÉM pro mesmo valor dessincronizado, simulando o caso
    // real (o histórico sabe que aquele exato mtime já foi visto e aprovado).
    const targetPath = at('m.js')
    const before = statSync(targetPath).mtimeMs
    const drifted = before + 0.7
    utimesSync(targetPath, drifted / 1000, drifted / 1000)
    const resultsFile = join(dir, '.utest', 'results.json')
    const raw = JSON.parse(readFileSync(resultsFile, 'utf8'))
    raw.phases.unit.files['m.t.js'].targetMtime = statSync(targetPath).mtimeMs
    writeFileSync(resultsFile, JSON.stringify(raw))
    const c2 = TestCache(dir)
    const hit = c2.read(at('m.t.js'), targetPath)
    check(hit?.checks, 7, 'mtime cravado dizia MISS (destravado), histórico confirma alvo/teste intactos → promove')
    cleanup()
  })

  test('mtime diz MISS por dessincronia, mas o CONTEÚDO mudou de verdade → continua MISS', ({ check }) => {
    const { dir, at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    cache.results.flush()
    // Edita o alvo de verdade — mtime muda para um valor que NEM o disco nem o
    // `results.json` antecipavam. Diferente do teste acima, aqui não sincronizamos
    // `results.json` com o novo mtime: o histórico não pode confirmar nada.
    writeFileSync(at('m.js'), 'export const add = (a, b) => a - b\n')
    const c2 = TestCache(dir)
    check(c2.read(at('m.t.js'), at('m.js')), null, 'edição real — MISS nos dois, nada promove')
    cleanup()
  })

  test('mtime diz MISS (arquivo editado de verdade) permanece MISS mesmo se o histórico não notou', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    writeFileSync(at('m.t.js'), "test('outro', () => {})\n")
    check(cache.read(at('m.t.js'), at('m.js')), null, 'teste editado — MISS definitivo, histórico não é consultado pra reverter')
    cleanup()
  })

  test('chamada sem phase usa o default "unit" — grava e lê no mesmo lugar', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    check(cache.results.get('unit', at('m.t.js')) !== null, true, 'default é unit')
    check(cache.read(at('m.t.js'), at('m.js'))?.checks, 7)
    cleanup()
  })

  test('falha comum É promovida quando o histórico confirma — falha não é mais especial', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 0, failed: true, failCount: 1 })
    const hit = cache.read(at('m.t.js'), at('m.js'))
    check(hit?.failed, true, 'vermelho comum cacheia igual ao verde, enquanto nada mudar')
    cleanup()
  })

  test('EXCEÇÃO nunca é promovida, mesmo com histórico intacto — sempre re-roda', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 0, exception: true, failCount: 1 })
    check(cache.read(at('m.t.js'), at('m.js')), null, 'exceção sempre re-roda, sem exceção a essa regra')
    cleanup()
  })

  test('record do formato ANTIGO (sem `exception`) nunca promove — lado seguro é tratar como exceção', ({ check }) => {
    // Regressão real (~bot): um record gravado ANTES do campo `exception` existir
    // não tem como a árbitro saber se era um vermelho comum (promovível) ou uma
    // exceção (nunca promovível) — `plan.integration.t.js` era uma exceção e foi
    // promovida indevidamente até esta checagem existir. O campo ausente é tratado
    // como "pode ser exceção": nunca promove, mesmo que o `state` diga `'failed'`.
    // Mesma primeira-rodada-de-migração que já vale pra `targetMtime`.
    const { dir, at, cache } = fixture(SET)
    cache.results.record('unit', at('m.t.js'), {
      state: 'failed', checks: 0, failCount: 1, targetPath: at('m.js'),
    })
    cache.results.flush()
    const resultsFile = join(dir, '.utest', 'results.json')
    const raw = JSON.parse(readFileSync(resultsFile, 'utf8'))
    delete raw.phases.unit.files['m.t.js'].exception
    writeFileSync(resultsFile, JSON.stringify(raw))
    const c2 = TestCache(dir)
    check(c2.read(at('m.t.js'), at('m.js'), { phase: 'unit' }), null, 'sem `exception` explícito, nunca promove')
    cleanup()
  })

  test('EXCEÇÃO gravada com state:"exception" (não "failed") também nunca promove', ({ check }) => {
    // Regressão real: `utest.js#runPhase` grava `state: suite.state`, que pode ser
    // `'exception'` (não `'failed'`) — uma checagem em `arbitrate` que testasse só
    // `rec.state === 'failed' && rec.exception` nunca batia pra esse record e
    // promovia a exceção por engano (achado rodando ~/bot: `plan.integration.t.js`
    // sempre re-executava OU, pior, quase foi promovido com um stack antigo). A
    // árbitro tem que confiar só em `rec.exception`, nunca cruzar com `rec.state`.
    const { dir, at, cache } = fixture(SET)
    cache.results.record('unit', at('m.t.js'), {
      state: 'exception', exception: true, checks: 0, failCount: 1,
      targetPath: at('m.js'),
    })
    cache.results.flush()
    // mtime cravado nunca aconteceu pra este par (não passou por writePaired) —
    // simula o cenário real: mtime bate por acidente (nunca tocado), mas o
    // histórico tem uma exceção. A árbitro não pode promover isso.
    const c2 = TestCache(dir)
    check(c2.read(at('m.t.js'), at('m.js'), { phase: 'unit' }), null, 'nunca promove exceção, mesmo com state != "failed"')
    cleanup()
  })

  test('record do formato ANTIGO (sem targetMtime) não força re-rodar sozinho — HIT continua valendo', ({ check }) => {
    const { dir, at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    cache.results.flush()
    // Simula um `results.json` gravado por uma versão ANTERIOR à árbitro: apaga só
    // o campo novo, sem tocar mtime/depsNewest/disco. `undefined` (campo nunca
    // existiu) é diferente de um valor gravado que diverge — só o migrado-e-
    // desatualizado (`--force` popula o campo) deveria cair aqui, nunca a mera
    // ausência de informação numa migração pendente.
    const resultsFile = join(dir, '.utest', 'results.json')
    const raw = JSON.parse(readFileSync(resultsFile, 'utf8'))
    delete raw.phases.unit.files['m.t.js'].targetMtime
    writeFileSync(resultsFile, JSON.stringify(raw))
    const c2 = TestCache(dir)
    check(c2.read(at('m.t.js'), at('m.js'))?.checks, 7, 'formato antigo não é motivo de MISS por si só')
    cleanup()
  })

  test('record do formato antigo, mas o ALVO mudou de verdade → continua invalidando pelo mtime cravado', ({ check }) => {
    const { dir, at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    cache.results.flush()
    const resultsFile = join(dir, '.utest', 'results.json')
    const raw = JSON.parse(readFileSync(resultsFile, 'utf8'))
    delete raw.phases.unit.files['m.t.js'].targetMtime
    writeFileSync(resultsFile, JSON.stringify(raw))
    // Edita o alvo de verdade — o mtime cravado já detecta isso sozinho (sem
    // precisar da árbitro), então mesmo sem `targetMtime` no histórico, o veredito
    // continua sendo MISS.
    writeFileSync(at('m.js'), 'export const add = (a, b) => a * b\n')
    const c2 = TestCache(dir)
    check(c2.read(at('m.t.js'), at('m.js')), null, 'edição real sempre invalida, com ou sem targetMtime no histórico')
    cleanup()
  })

  test('vermelho sem alvo (sidecar puro) também cacheia — mesma regra generalizada', ({ check }) => {
    const { at, cache } = fixture({ ...SET, 'solo.eval.js': "test('e', () => {})\n" })
    cache.write(at('solo.eval.js'), null, {
      checks: 0, failed: true, failCount: 1,
    })
    const hit = cache.read(at('solo.eval.js'), null)
    check(hit?.failed, true)
    cleanup()
  })
})

// `cache.read` nunca sabe de `--force` — quem decide ignorar um HIT é SEMPRE quem
// chama (`utest.js`, checando a flag antes de consultar o cache). Este bloco prova
// o contrapositivo, fora do caminho feliz: uma vez que mtime cravado e results.json
// CONCORDAM, nenhuma leitura repetida, nenhuma instância nova, nenhum flush redundante,
// nenhuma mutação IRRELEVANTE ao par derruba o HIT sozinho — só uma mudança real no
// teste/alvo/deps (já coberta acima) ou o chamador ignorando o veredito por conta
// própria simula o efeito de `--force`.
test('cache: HIT confirmado é ESTÁVEL — nada além de --force real (ou mudança real) o derruba', ({ test }) => {

  test('ler 50x seguidas o mesmo par confirmado devolve sempre o mesmo HIT', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    for (let i = 0; i < 50; i++) {
      check(cache.read(at('m.t.js'), at('m.js'))?.checks, 7, `leitura #${i}`)
    }
    cleanup()
  })

  test('uma NOVA instância de TestCache, relendo o mesmo disco, também vê HIT', ({ check }) => {
    const { dir, at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    cache.results.flush()
    for (let i = 0; i < 5; i++) {
      const fresh = TestCache(dir)
      check(fresh.read(at('m.t.js'), at('m.js'))?.checks, 7, `instância #${i}`)
    }
    cleanup()
  })

  test('flush() redundante (sem write novo) não muda o veredito', ({ check }) => {
    const { dir, at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    cache.results.flush()
    cache.results.flush()
    cache.results.flush()
    const c2 = TestCache(dir)
    check(c2.read(at('m.t.js'), at('m.js'))?.checks, 7)
    cleanup()
  })

  test('tocar um arquivo IRRELEVANTE (fora do teste/alvo/grafo de deps) não invalida', ({ check }) => {
    const { dir, at, cache } = fixture({ ...SET, 'unrelated.js': 'export const U = 1\n' })
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    cache.results.flush()
    // `unrelated.js` não é importado por `m.t.js` nem é o alvo — mexer nele não deveria
    // aparecer em NENHUM dos dois mecanismos.
    const future = new Date(Date.now() + 60000)
    utimesSync(at('unrelated.js'), future, future)
    const c2 = TestCache(dir)
    check(c2.read(at('m.t.js'), at('m.js'))?.checks, 7, 'arquivo fora do grafo não deveria importar')
    cleanup()
  })

  test('reordenar leitura/flush várias vezes não degrada um HIT confirmado', ({ check }) => {
    const { dir, at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    check(cache.read(at('m.t.js'), at('m.js'))?.checks, 7, 'HIT antes do flush')
    cache.results.flush()
    check(cache.read(at('m.t.js'), at('m.js'))?.checks, 7, 'HIT depois do flush, mesma instância')
    const c2 = TestCache(dir)
    check(c2.read(at('m.t.js'), at('m.js'))?.checks, 7, 'HIT numa instância nova')
    check(c2.read(at('m.t.js'), at('m.js'))?.checks, 7, 'HIT de novo, mesma instância nova')
    cleanup()
  })

  test('ler outra FASE do mesmo par não contamina nem derruba o HIT original', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 }, { phase: 'unit' })
    // Uma leitura numa fase SEM histórico não deve, por efeito colateral, mexer no
    // record da fase 'unit' (nem via memoização de `deps`, nem via `store` em memória).
    check(cache.read(at('m.t.js'), at('m.js'), { phase: 'eval' }), null, 'fase eval não tem histórico')
    check(cache.read(at('m.t.js'), at('m.js'), { phase: 'unit' })?.checks, 7, 'fase unit continua intacta')
    cleanup()
  })

  test('só o CHAMADOR ignorando o veredito simula --force — cache.read nunca o faz sozinho', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    // `cache.read` não tem parâmetro de force: simular a flag é, por definição,
    // o CHAMADOR decidir não perguntar (o que `utest.js` faz quando `--force` está
    // ativo — pula a leitura do cache inteiramente, nunca invalida via cache.js).
    const wouldForce = true
    const hit = cache.read(at('m.t.js'), at('m.js'))
    check(hit?.checks, 7, 'o veredito em si continua HIT — force é decisão de FORA')
    const effectiveResult = wouldForce ? null : hit   // é isto que utest.js faz
    check(effectiveResult, null, 'só ignorar o HIT (fora de cache.js) produz o efeito de --force')
    cleanup()
  })

  test('re-write do MESMO resultado (idempotente) mantém HIT — não é preciso mudar nada pra reconfirmar', ({ check }) => {
    const { at, cache } = fixture(SET)
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })
    cache.write(at('m.t.js'), at('m.js'), { checks: 7 })   // re-roda de propósito, mesmo resultado
    check(cache.read(at('m.t.js'), at('m.js'))?.checks, 7)
    cleanup()
  })

  test('um par SEM alvo (sidecar) também é estável sob leituras repetidas', ({ check }) => {
    const { at, cache } = fixture({ 'solo.t.js': "test('s', () => {})\n" })
    cache.write(at('solo.t.js'), null, { checks: 5 })
    for (let i = 0; i < 20; i++) {
      check(cache.read(at('solo.t.js'), null)?.checks, 5, `leitura #${i}`)
    }
    cleanup()
  })
})
