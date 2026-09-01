import { readFileSync, writeFileSync, statSync, utimesSync, mkdirSync } from 'fs'
import { join, relative, dirname, resolve } from 'path'

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

  const deps = entryPath => {
    const hit = depsMemo.get(entryPath)
    if (hit) return hit

    const seen  = new Set([entryPath])
    const stack = [entryPath]

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
    depsMemo.set(entryPath, out)
    return out
  }

  const newestDep = testPath =>
    deps(testPath).reduce((mx, d) => Math.max(mx, mtimeOf(d) ?? 0), 0)

  // Uma dep tocada depois da gravação re-roda; uma que sumiu do disco também.
  const depsFresh = (testPath, seen) =>
    deps(testPath).every(d => {
      const ms = mtimeOf(d)
      return ms !== null && ms <= seen
    })

  // ── Conjunto pareado: o alvo é o dono do veredito ────────────────────────
  const readPaired = (testPath, targetPath) => {
    const st = (() => { try { return statSync(testPath) } catch { return null } })()
    const targetMs = mtimeOf(targetPath)
    if (!st || targetMs === null) return null

    if (targetMs % 1000 !== 0) return null            // destravado, ou marcado 1ms
    if (!Number.isInteger(st.mtimeMs)) return null    // escrito, não carimbado
    if (Math.floor(st.mtimeMs / 1000) * 1000 !== targetMs) return null

    const checks = st.mtimeMs % 1000
    if (checks === 0) return null
    if (!depsFresh(testPath, st.atimeMs)) return null

    return { checks, tests: 0, exception: false }
  }

  const writePaired = (testPath, targetPath, { checks, exception }) => {
    const targetMs = mtimeOf(targetPath)
    if (targetMs === null) return
    const second = Math.floor(targetMs / 1000) * 1000

    // Um teste que não passou marca o ALVO: o conjunto inteiro deixa de valer,
    // e nenhum irmão dele é pulado enquanto a falha estiver de pé.
    if (exception || !checks) {
      const failed = new Date(second + FAILED_MARK)
      utimesSync(targetPath, failed, failed)
      return bust(testPath)
    }

    if (targetMs !== second) utimesSync(targetPath, new Date(second), new Date(second))
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
    const seen = newestDep(testPath)
    utimesSync(testPath, seen / 1000, (second + Math.min(checks, CHECKS_MAX)) / 1000)
  }

  // ── Sem alvo: não há segundo comum para sincronizar, então o resultado vai
  //    para um sidecar. O grafo de deps continua valendo.
  const selfFile = testPath =>
    join(root, '.bot', '.utest', relative(root, testPath).replace(/[/\\]/g, '__') + '.json')

  const readSelf = testPath => {
    try {
      const data = JSON.parse(readFileSync(selfFile(testPath), 'utf8'))
      if (data.mtime !== statSync(testPath).mtimeMs) return null
      // Contra `seen` — a idade da dep mais nova na gravação —, e não contra o
      // mtime do teste: o teste é ANTERIOR às deps, então medir por ele deixava
      // qualquer dep editada passar por intacta.
      if (!depsFresh(testPath, data.seen ?? 0)) return null
      return data
    } catch { return null }
  }

  const writeSelf = (testPath, data) => {
    try {
      const f = selfFile(testPath)
      mkdirSync(dirname(f), { recursive: true })
      writeFileSync(f, JSON.stringify({
        mtime: statSync(testPath).mtimeMs, seen: newestDep(testPath), ...data,
      }))
    } catch {}
  }

  const bust = testPath => {
    try { utimesSync(testPath, new Date(0), new Date(0)) } catch {}
  }

  // O alvo decide qual protocolo vale; quem chama não precisa saber de nenhum.
  return {
    deps,
    bust,
    read: (testPath, targetPath) =>
      targetPath ? readPaired(testPath, targetPath) : readSelf(testPath),
    write: (testPath, targetPath, result) => {
      try {
        if (targetPath) writePaired(testPath, targetPath, result)
        else if (result.exception || !result.checks) bust(testPath)
        else writeSelf(testPath, result)
      } catch {}
    },
  }
}

export default TestCache
