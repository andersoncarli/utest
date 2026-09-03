import { readFileSync, writeFileSync, statSync, utimesSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join, relative, dirname, resolve, parse as parsePath } from 'path'

/**
 * cache.js — o cache do utest, e a regra que o torna confiável.
 *
 * A regra é uma só, e seguida à risca não tem furo. Ela vive inteira nos
 * timestamps que todo inode já tem — sem banco, sem sidecar, sem hash, sem um
 * segundo registro que possa divergir do primeiro:
 *
 *   ALVO   → mtime CRAVADO no segundo da sua última alteração: ms = 0 quando
 *            todos os seus testes passaram, ms = 1 quando algum não passou.
 *   TESTES → todos sincronizados com o segundo do alvo, cada um com os próprios
 *            MILISSEGUNDOS carregando a contagem de checks daquele arquivo.
 *
 * Um CONJUNTO é válido quando todos os participantes compartilham o mesmo ts
 * arredondado ao segundo E o alvo está cravado. Qualquer arquivo tocado pelo
 * mundo — editor, checkout, build — sai do segundo comum e derruba o conjunto,
 * que é exatamente o que se quer.
 *
 * O ms morar no TESTE, e não no alvo, é o que deixa N testes dividirem um alvo:
 * `pixel.js` serve `pixel.t.js`, `pixel.classes.t.js` e `pixel._resolveSize.t.js`,
 * cada um guardando a própria contagem, os três concordando no mesmo segundo.
 *
 * ── Os dois detalhes que fazem a regra fechar ───────────────────────────────
 *
 * O ms INTEIRO separa carimbo de edição. O filesystem grava mtime com precisão
 * de nanossegundo, então um arquivo ESCRITO cai em ms fracionário
 * (`...588601.1472`), enquanto `utimesSync` grava o inteiro exato pedido. Sem
 * isso, um teste editado dentro do mesmo segundo do alvo passaria por cacheado
 * e devolveria uma contagem que nunca rodou.
 *
 * As DEPS medem contra o `atime`, que guarda o instante real da gravação em
 * precisão cheia. O segundo cravado tem resolução de 1s, e uma dep tocada logo
 * depois da gravação cairia dentro dele — invisível. Foi essa a falha que
 * deixou um `export` removido em `scl/theme-params.js`, dois saltos além do
 * alvo pareado, ser servido como verde.
 */
const CHECKS_MAX  = 999
const FAILED_MARK = 1

// Três formas de import, e a terceira é a que domina este repo:
// `import './button.js'` sem `from` — efeito colateral, que é como um plugin se
// registra. Perdê-la deixava `scl/button.t.js` com ZERO deps.
const IMPORT_RE = /(?:^|[\s;}])(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|[^.\w])import\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|[\s;}])import\s+['"]([^'"]+)['"]/g
const DEP_EXTS = ['', '.js', '.ts', '/index.js', '/index.ts']

const mtimeOf = p => { try { return statSync(p).mtimeMs } catch { return null } }

function resolveImport(spec, fromDir, root) {
  if (!spec || !spec.startsWith('.')) return null
  const base = resolve(fromDir, spec)
  if (!base.startsWith(root)) return null
  for (const ext of DEP_EXTS) {
    const full = base + ext
    try { if (statSync(full).isFile()) return full } catch {}
  }
  return null
}

/**
 * TestCache(root) — o cache de UMA raiz, com o grafo de imports memoizado no
 * escopo do closure. `deps()` é chamado por arquivo a cada leitura e a cada
 * gravação; sem a memória, a mesma árvore seria caminhada N vezes por rodada.
 */
export function TestCache(root) {
  const depsMemo = new Map()

  // ── utest/results.json — o HISTÓRICO consolidado, hierárquico por FASE ───────
  // O cache de tempo (os timestamps de inode acima) decide se um arquivo re-roda;
  // ele carrega só a CONTAGEM de checks (o que cabe num mtime). Este arquivo é o
  // OUTRO lado: `phases[fase].files[relpath] = { ms, checks, failCount, state, mtime,
  // depsNewest, at }`, gravado a cada run de verdade. Serve a três coisas:
  //   1. output IDÊNTICO quente/frio — o render lê SEMPRE daqui, um registro é um
  //      registro, cache-hit e live convergem no mesmo formato.
  //   2. relatório — `(Nms)` do último run em vez de `0ms`, e a variação de tempo.
  //   3. verificação de 2º nível — `fresh()` compara o veredito do cache de tempo
  //      com o que o histórico diz (mesmo mtime? deps não mexeram?). Divergir é
  //      sinal de furo na regra do cache.
  // UM arquivo por PROJETO em `<raiz>/.utest/results.json`, não por `root`: um
  // `bun utest/utest.js apps/eval/` estreita o `root` para `apps/eval/`, e sem isto o
  // `results.json` nasceria lá dentro. Sobe de `root` até a raiz do projeto — o primeiro
  // diretório com `.git` ou `TEST.yaml` —, e o storage mora num `.utest/` dedicado ali,
  // sob a chave relativa a essa raiz. Um write por FASE (via `flush()`), não por arquivo.
  // Perdê-lo só custa uma rodada fria.
  const findProjectRoot = (from) => {
    for (let d = resolve(from); ; d = dirname(d)) {
      if (existsSync(join(d, '.git')) || existsSync(join(d, 'TEST.yaml'))) return d
      if (d === parsePath(d).root) return resolve(from)
    }
  }
  const projectRoot = findProjectRoot(root)
  const resultsFile = join(projectRoot, '.utest', 'results.json')
  let store = null
  const storeLoad = () => {
    if (store) return store
    try {
      const raw = JSON.parse(readFileSync(resultsFile, 'utf8'))
      store = raw && raw.version === 1 && raw.phases ? raw : { version: 1, phases: {} }
    } catch { store = { version: 1, phases: {} } }
    return store
  }
  const phaseFiles = (phase) => {
    const s = storeLoad()
    s.phases[phase] ??= { files: {} }
    return s.phases[phase].files
  }
  const results = {
    get: (phase, p) => phaseFiles(phase)[relative(projectRoot, p)] || null,
    // As chaves (relpaths) de uma fase, ou de todas. É o ÍNDICE: `utest 3.2` resolve o
    // arquivo daqui, sem escanear o repo. `{ phase, relpath, abspath }[]`.
    list: (phase) => {
      const s = storeLoad()
      const phs = phase ? [phase] : Object.keys(s.phases)
      return phs.flatMap(ph =>
        Object.keys(s.phases[ph]?.files || {}).map(relpath => ({
          phase: ph, relpath, abspath: join(projectRoot, relpath),
        })))
    },
    record: (phase, p, { ms, tests, checks, failCount, state, extraDeps = [] } = {}) => {
      phaseFiles(phase)[relative(projectRoot, p)] = {
        ms: Math.round(ms || 0),
        tests: tests ?? 0,
        checks: checks ?? 0,
        failCount: failCount ?? 0,
        state: state || 'passed',
        mtime: mtimeOf(p),
        depsNewest: newestDep(p, extraDeps),
        at: Date.now(),
      }
    },
    // Um write só, no fim da fase — não um por arquivo. Antes de escrever, poda as linhas
    // cujo arquivo sumiu do disco (renomeado/apagado): o storage é o índice E a verificação
    // de 2º nível, uma linha órfã suja as duas.
    flush: () => {
      try {
        const s = storeLoad()
        for (const ph of Object.values(s.phases))
          for (const rp of Object.keys(ph.files || {}))
            if (!existsSync(join(projectRoot, rp))) delete ph.files[rp]
        mkdirSync(dirname(resultsFile), { recursive: true })
        writeFileSync(resultsFile, JSON.stringify(s, null, 0))
      } catch {}
    },
    // O histórico ainda bate com a realidade do disco? (mesmo mtime do teste, e
    // nenhuma dep mais nova que quando gravamos). MESMA pergunta que a regra do
    // cache de tempo responde por outro caminho — as duas discordarem para o mesmo
    // arquivo é um furo em uma delas.
    fresh: (phase, p, extraDeps = []) => {
      const r = phaseFiles(phase)[relative(projectRoot, p)]
      if (!r) return false
      if (r.mtime !== mtimeOf(p)) return false
      return newestDep(p, extraDeps) <= (r.depsNewest ?? 0)
    },
  }

  // `extraRoots` são pontos de partida ADICIONAIS do walk, para o teste cujo
  // alvo declara suas dependências fora de um `import` — um `.eval.js` cujo
  // assunto é uma string passada a `render()`, e cujo `.md` de feature lista os
  // arquivos afetados em `files:`. O grafo estático do próprio teste continua
  // valendo; `extraRoots` só o amplia.
  const deps = (entryPath, extraRoots = []) => {
    const key = extraRoots.length ? entryPath + '\0' + extraRoots.join('\0') : entryPath
    const hit = depsMemo.get(key)
    if (hit) return hit

    const seen  = new Set([entryPath, ...extraRoots])
    const stack = [entryPath, ...extraRoots]

    while (stack.length) {
      const file = stack.pop()
      let src
      try { src = readFileSync(file, 'utf8') } catch { continue }

      IMPORT_RE.lastIndex = 0
      for (let m; (m = IMPORT_RE.exec(src));) {
        const dep = resolveImport(m[1] ?? m[2] ?? m[3], dirname(file), root)
        if (dep && !seen.has(dep)) { seen.add(dep); stack.push(dep) }
      }
    }

    seen.delete(entryPath)
    const out = [...seen]
    depsMemo.set(key, out)
    return out
  }

  const newestDep = (testPath, extra = []) =>
    deps(testPath, extra).reduce((mx, d) => Math.max(mx, mtimeOf(d) ?? 0), 0)

  // Uma dep tocada depois da gravação re-roda; uma que sumiu do disco também.
  const depsFresh = (testPath, seen, extra = []) =>
    deps(testPath, extra).every(d => {
      const ms = mtimeOf(d)
      return ms !== null && ms <= seen
    })

  // ── Conjunto pareado: o alvo é o dono do veredito ────────────────────────
  const readPaired = (testPath, targetPath, extraDeps = []) => {
    const st = (() => { try { return statSync(testPath) } catch { return null } })()
    const targetMs = mtimeOf(targetPath)
    if (!st || targetMs === null) return null

    // Alvo marcado 1ms = o conjunto FALHOU. Para um `.t.js` isso é "re-rode" (um
    // teste vermelho é barato e o output fresco vale). Para um passo caro que
    // OPTOU por cachear a falha (`cacheFailure`, só quando é 100% reproduzível —
    // eval sandbox, nunca `real`), o veredito vermelho é reusável enquanto o
    // alvo e o grafo não mudarem: mesma pergunta do verde, resposta oposta.
    if (targetMs % 1000 === FAILED_MARK) {
      const side = readSelf(testPath, extraDeps)
      if (side?.failed && side.targetSecond === targetMs) {
        return {
          checks: side.checks ?? 0, tests: side.tests ?? 0,
          failCount: side.failCount ?? 1, exception: !!side.exception, failed: true,
        }
      }
      return null
    }
    if (targetMs % 1000 !== 0) return null            // destravado
    if (!Number.isInteger(st.mtimeMs)) return null    // escrito, não carimbado
    if (Math.floor(st.mtimeMs / 1000) * 1000 !== targetMs) return null

    const checks = st.mtimeMs % 1000
    if (checks === 0) return null
    if (!depsFresh(testPath, st.atimeMs, extraDeps)) return null

    return { checks, tests: 0, exception: false }
  }

  const writePaired = (testPath, targetPath, { checks, failCount, exception, failed, tests, cacheFailure }, extraDeps = []) => {
    const targetMs = mtimeOf(targetPath)
    if (targetMs === null) return
    const second = Math.floor(targetMs / 1000) * 1000

    // Um teste que não passou marca o ALVO: o conjunto inteiro deixa de valer,
    // e nenhum irmão dele é pulado enquanto a falha estiver de pé. `failed` é
    // EXPLÍCITO — uma suíte parcial (`s.passed>0` e `s.failed>0`) ainda tem
    // `checks>0`, e inferir por `!checks` a cacheava como verde.
    if (exception || failed || !checks) {
      const failed = new Date(second + FAILED_MARK)
      utimesSync(targetPath, failed, failed)
      bust(testPath)
      // `cacheFailure`: o resultado vermelho é reproduzível, então grava-o num
      // sidecar carimbado com o segundo+1ms do alvo. `readPaired` só o reusa
      // enquanto `targetSecond` bater E as deps não tiverem mexido — um alvo
      // reeditado sai desse segundo e o sidecar deixa de casar sozinho.
      if (cacheFailure) {
        writeSelf(testPath, {
          failed: true, exception: !!exception,
          checks: checks ?? 0, failCount: failCount ?? 1, tests: tests ?? 0,
          targetSecond: second + FAILED_MARK,
        }, extraDeps)
      }
      return
    }

    if (targetMs !== second) utimesSync(targetPath, new Date(second), new Date(second))
    rmSelf(testPath)   // o conjunto voltou ao verde — um sidecar de falha antigo não tem mais função
    // mtime = a convenção (segundo do alvo + contagem); atime = o instante da
    // gravação, que é contra quem as deps são medidas.
    //
    // O atime guarda a IDADE DA DEP MAIS NOVA no momento da gravação, e não o
    // relógio: é essa a pergunta que `depsFresh` faz depois — "alguma dep é
    // mais nova do que era quando gravei?".
    //
    // Gravado como SEGUNDOS FRACIONÁRIOS, e não `new Date`: o construtor trunca
    // no ms inteiro, enquanto o mtime de uma dep tem precisão de nanossegundo.
    // Com o truncamento não havia régua boa — arredondar para baixo invalidava
    // um cache recém-gravado, e para cima cegava uma edição no mesmo ms. A
    // forma numérica preserva a fração e as duas pontas passam a medir igual.
    const seen = newestDep(testPath, extraDeps)
    utimesSync(testPath, seen / 1000, (second + Math.min(checks, CHECKS_MAX)) / 1000)
  }

  // ── Sem alvo: não há segundo comum para sincronizar, então o resultado vai
  //    para um sidecar. O grafo de deps continua valendo.
  const selfFile = testPath =>
    join(root, '.bot', '.utest', relative(root, testPath).replace(/[/\\]/g, '__') + '.json')

  const readSelf = (testPath, extraDeps = []) => {
    try {
      const data = JSON.parse(readFileSync(selfFile(testPath), 'utf8'))
      if (data.mtime !== statSync(testPath).mtimeMs) return null
      // Contra `seen` — a idade da dep mais nova na gravação —, e não contra o
      // mtime do teste: o teste é ANTERIOR às deps, então medir por ele deixava
      // qualquer dep editada passar por intacta.
      if (!depsFresh(testPath, data.seen ?? 0, extraDeps)) return null
      return data
    } catch { return null }
  }

  const rmSelf = testPath => {
    try { rmSync(selfFile(testPath)) } catch {}
  }

  const writeSelf = (testPath, data, extraDeps = []) => {
    try {
      const f = selfFile(testPath)
      mkdirSync(dirname(f), { recursive: true })
      writeFileSync(f, JSON.stringify({
        mtime: statSync(testPath).mtimeMs, seen: newestDep(testPath, extraDeps), ...data,
      }))
    } catch {}
  }

  // Um teste que falhou volta para o AGORA, e é só isso: o presente está fora do
  // segundo cravado do conjunto, então ele deixa de casar pela mesma regra que
  // vale para todo o resto — não há sentinela, nem caso especial a lembrar.
  //
  // Era `new Date(0)` (epoch), que funcionava por acidente do mesmo jeito e
  // custava duas coisas: apagava a idade real do arquivo, e obrigava quem lê a
  // conhecer um valor mágico para entender o que 1970 significa ali.
  const bust = testPath => {
    try {
      // Um carimbo é sempre um ms INTEIRO; a fração é a marca de "escrito pelo
      // mundo". Falhar devolve o arquivo a essa condição — meio ms adiante do
      // agora, para nunca coincidir com o segundo cravado do conjunto nem com
      // um inteiro que seria lido como contagem.
      const now = (Date.now() + 0.5) / 1000
      utimesSync(testPath, now, now)
    } catch {}
  }

  // O alvo decide qual protocolo vale; quem chama não precisa saber de nenhum.
  // `extraDeps` (opcional): raízes de dep além do grafo estático do teste — a
  // fase `eval` passa aqui o `files:` do `.md` de feature (ver `utest.js#runPhase`).
  return {
    deps,
    bust,
    results,
    read: (testPath, targetPath, { extraDeps = [] } = {}) =>
      targetPath ? readPaired(testPath, targetPath, extraDeps) : readSelf(testPath, extraDeps),
    write: (testPath, targetPath, result, { extraDeps = [] } = {}) => {
      try {
        if (targetPath) writePaired(testPath, targetPath, result, extraDeps)
        else if (result.exception || result.failed || !result.checks) {
          bust(testPath)
          if (result.cacheFailure) {
            writeSelf(testPath, {
              failed: true, exception: !!result.exception,
              checks: result.checks ?? 0, failCount: result.failCount ?? 1, tests: result.tests ?? 0,
            }, extraDeps)
          }
        }
        else writeSelf(testPath, result, extraDeps)
      } catch {}
    },
  }
}

export default TestCache
