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
 *
 * ── A segunda checagem: results.json como árbitro ───────────────────────────
 *
 * O cache de tempo acima não tem furo SEGUIDO À RISCA — mas fora do controle
 * do runner, timestamps colidem: um `git checkout`, uma cópia, uma race entre
 * dois processos gravando quase junto, podem deixar alvo e teste em SEGUNDOS
 * diferentes sem que nenhum dos dois tenha sido editado de verdade. O cache de
 * tempo sozinho não distingue essa dessincronia de uma edição real — os dois
 * casos parecem idênticos do lado de fora (o segundo comum quebrou).
 *
 * `results.json` já grava, a cada rodada real, o mtime do teste e a idade da
 * dependência mais nova (`depsNewest`) — o mesmo par de fatos que o cache de
 * tempo usa, só que por outro caminho, e sobrevivendo em disco fora do inode
 * do arquivo do usuário. `readPaired`/`readSelf` agora CONSULTAM esse registro
 * antes do veredito final, nos dois sentidos:
 *
 *   HIT  do mtime, `results.json` DISCORDA (teste/target/deps mudaram desde o
 *        último record) → vira MISS. O cache de tempo achou parecido, o
 *        histórico prova que não é.
 *   MISS do mtime (segundo dessincronizado, alvo destravado, teste fracionário)
 *        mas `results.json` CONFIRMA que teste, target e deps são
 *        BYTE-A-BYTE os mesmos mtimes do último record que passou → promove
 *        a HIT. A dessincronia era do relógio, não do conteúdo.
 *
 * Nenhum dos dois mecanismos é removido nem vira autoridade única — cada um
 * detecta um tipo de furo que o outro não vê sozinho, e a checagem cruzada é
 * só uma comparação de números já em memória (sem I/O extra: `results.json`
 * já está carregado no mesmo `TestCache`). `phase` (default `'unit'`) escolhe
 * qual fatia do histórico consultar.
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

  // ── utest/depgraph.json — os IMPORTS DIRETOS de cada arquivo, entre processos ──
  // `deps()` (mais abaixo) monta o fechamento transitivo por BFS em memória — isso
  // já é rápido (é só travessia de um grafo pequeno). O CARO é descobrir os imports
  // DIRETOS de cada arquivo: `readFileSync` + `IMPORT_RE.exec` em CADA arquivo do
  // projeto, toda vez. A memoização de `depsMemo` só vive dentro de UM processo —
  // cada `utest ~/projeto` novo (a forma normal de chamar) recomeça do zero, e num
  // projeto de centenas de arquivos isso sozinho já custa ~1s, mesmo com tudo em
  // cache-hit (achado rodando ~/soml: 920ms só pra reler+parsear 258 arquivos que
  // não mudaram). Este storage persiste, por arquivo, `{ mtime, imports }` — os
  // imports DIRETOS resolvidos na última vez que o arquivo foi lido, válidos
  // enquanto o mtime dele não mudar. Ler um arquivo do disco continua acontecendo
  // (stat é barato); reabrir e reparsear o CONTEÚDO é o que se evita.
  const depgraphFile = join(projectRoot, '.utest', 'depgraph.json')
  let depgraphStore = null
  let depgraphDirty = false
  const depgraphLoad = () => {
    if (depgraphStore) return depgraphStore
    try {
      const raw = JSON.parse(readFileSync(depgraphFile, 'utf8'))
      depgraphStore = raw && raw.version === 1 && raw.files ? raw : { version: 1, files: {} }
    } catch { depgraphStore = { version: 1, files: {} } }
    return depgraphStore
  }
  const depgraphFlush = () => {
    if (!depgraphDirty) return
    try {
      mkdirSync(dirname(depgraphFile), { recursive: true })
      writeFileSync(depgraphFile, JSON.stringify(depgraphLoad()))
      depgraphDirty = false
    } catch {}
  }
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
    record: (phase, p, { ms, tests, checks, failCount, state, exception = false, failLines, extraDeps = [], targetPath = null } = {}) => {
      phaseFiles(phase)[relative(projectRoot, p)] = {
        ms: Math.round(ms || 0),
        tests: tests ?? 0,
        checks: checks ?? 0,
        failCount: failCount ?? 0,
        state: state || 'passed',
        // Uma EXCEÇÃO nunca é promovível (MISS do tempo → HIT): sem sidecar nem
        // estrutura fixa pra reconstruir o stack, um vermelho de exceção sempre
        // precisa rodar de verdade — `arbitrate` confere este campo antes de
        // promover qualquer `state:'failed'`.
        exception: !!exception,
        // O bloco de erro JÁ RENDERIZADO da última execução real. Um vermelho reusado do
        // cache não tem `checks`/`error` vivos para reconstruir, e sem isto o `-v:2`
        // degradava para o `-v:1` silenciosamente — a linha compacta e mais nada.
        failLines: failLines?.length ? failLines : undefined,
        mtime: mtimeOf(p),
        // O mtime do ALVO pareado, gravado à parte de `depsNewest`: o alvo de um
        // `.eval.js` (o `.md` da feature) não é um `import`, então nunca entraria no
        // grafo estático — sem isto a árbitro (abaixo) não tinha como confirmar que o
        // alvo específico não mudou, só as deps.
        targetMtime: targetPath ? mtimeOf(targetPath) : null,
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
      // Mesmo gatilho que já persiste `results.json` — `utest.js` chama
      // `results.flush()` incondicionalmente ao fim de cada fase, então não
      // precisa de mais um ponto de chamada pra não esquecer de persistir o grafo.
      depgraphFlush()
    },
    // O histórico ainda bate com a realidade do disco? (mesmo mtime do teste, o
    // mesmo mtime do alvo pareado se houver um, e nenhuma dep mais nova que quando
    // gravamos). MESMA pergunta que a regra do cache de tempo responde por outro
    // caminho — as duas discordarem para o mesmo arquivo é sinal de furo numa delas,
    // e é exatamente essa discordância que `arbitrate` (abaixo) usa para decidir
    // quem vence.
    fresh: (phase, p, extraDeps = [], targetPath = null) => {
      const r = phaseFiles(phase)[relative(projectRoot, p)]
      if (!r) return false
      if (r.mtime !== mtimeOf(p)) return false
      // `targetMtime` só existe em records gravados por esta versão (a árbitro).
      // Um record do formato ANTERIOR (sem o campo) não tem como confirmar nem
      // discordar do alvo — tratar `undefined` como "diverge" forçava toda a
      // árvore de um projeto pré-existente a re-rodar na primeira leitura pós-
      // upgrade, mascarado de bug de cache. `undefined` não é sinal de nada: só
      // um valor GRAVADO que não bate é divergência de verdade. A cura desse
      // formato antigo é `--force` (decisão de fora, como sempre foi), não um
      // rebaixamento silencioso daqui.
      if (targetPath && r.targetMtime !== undefined && r.targetMtime !== mtimeOf(targetPath)) return false
      // Uma dep SUMIDA do disco não pode passar por "não ficou mais nova que
      // depsNewest" — `newestDep` trata ausência como `0` (pra não quebrar o
      // reduce), o que a leitura ingênua confundiria com "nunca mudou". Mesma
      // regra que `depsFresh` já aplica no cache de tempo.
      if (deps(p, extraDeps).some(d => mtimeOf(d) === null)) return false
      return newestDep(p, extraDeps) <= (r.depsNewest ?? 0)
    },
  }

  // Os imports DIRETOS de UM arquivo — persistidos em `depgraph.json` por mtime.
  // Se o mtime do arquivo bate com o que foi gravado da última vez, reusa a lista
  // sem tocar o CONTEÚDO; só quando o arquivo mudou de verdade é que `readFileSync`
  // + `IMPORT_RE` rodam de novo. O disco continua sendo consultado (um `statSync`
  // é ordens de magnitude mais barato que reabrir e reparsear o arquivo inteiro).
  const directImportsOf = (file) => {
    const mt = mtimeOf(file)
    if (mt === null) return []
    const store = depgraphLoad()
    const key = relative(projectRoot, file)
    const cached = store.files[key]
    if (cached && cached.mtime === mt) return cached.imports.map(p => join(projectRoot, p))

    let src
    try { src = readFileSync(file, 'utf8') } catch { return [] }
    const imports = []
    IMPORT_RE.lastIndex = 0
    for (let m; (m = IMPORT_RE.exec(src));) {
      const dep = resolveImport(m[1] ?? m[2] ?? m[3], dirname(file), root)
      if (dep) imports.push(dep)
    }
    store.files[key] = { mtime: mt, imports: imports.map(p => relative(projectRoot, p)) }
    depgraphDirty = true
    return imports
  }

  // `extraRoots` são pontos de partida ADICIONAIS do walk, para o teste cujo
  // alvo declara suas dependências fora de um `import` — um `.eval.js` cujo
  // assunto é uma string passada a `render()`, e cujo `.md` de feature lista os
  // arquivos afetados em `files:`. O grafo estático do próprio teste continua
  // valendo; `extraRoots` só o amplia. O FECHAMENTO transitivo (o BFS abaixo)
  // continua recalculado a cada chamada — é travessia em memória sobre imports já
  // resolvidos, barata mesmo em grafos grandes; só a LEITURA de cada arquivo
  // individual (`directImportsOf`) é que persiste entre processos.
  const deps = (entryPath, extraRoots = []) => {
    const key = extraRoots.length ? entryPath + '\0' + extraRoots.join('\0') : entryPath
    const hit = depsMemo.get(key)
    if (hit) return hit

    const seen  = new Set([entryPath, ...extraRoots])
    const stack = [entryPath, ...extraRoots]

    while (stack.length) {
      const file = stack.pop()
      for (const dep of directImportsOf(file)) {
        if (!seen.has(dep)) { seen.add(dep); stack.push(dep) }
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
  // O cache de tempo decide sozinho primeiro (`timeVerdict`); `arbitrate` (mais
  // abaixo) cruza esse veredito com `results.json` nos dois sentidos antes do
  // retorno final — ver o comment-block do topo ("A segunda checagem").
  const readPaired = (testPath, targetPath, extraDeps = [], phase = 'unit') => {
    const timeVerdict = readPairedByTime(testPath, targetPath, extraDeps)
    return arbitrate(phase, testPath, extraDeps, targetPath, timeVerdict)
  }

  const readPairedByTime = (testPath, targetPath, extraDeps = []) => {
    const st = (() => { try { return statSync(testPath) } catch { return null } })()
    const targetMs = mtimeOf(targetPath)
    if (!st || targetMs === null) return null

    // Alvo marcado 1ms = o conjunto FALHOU. O veredito vermelho é reusável enquanto
    // o alvo e o grafo não mudarem — MESMA pergunta que o verde faz, resposta
    // oposta: um vermelho que nunca re-roda até algo mudar de verdade é tão barato
    // quanto um verde cacheado, e reconfirmar um teste caro (`real`/`linear`, que
    // spawna processo) só para reexibir o mesmo vermelho é o custo que este cache
    // existe para evitar. Antes só cacheava quando quem chamava marcava
    // `cacheFailure` explícito (sandbox puro, nunca `real`) — generalizado: TODO
    // vermelho cacheia, e só `--force` ou uma mudança real de mtime re-roda.
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

  const writePaired = (testPath, targetPath, { checks, failCount, exception, failed, tests }, extraDeps = []) => {
    const targetMs = mtimeOf(targetPath)
    if (targetMs === null) return
    const second = Math.floor(targetMs / 1000) * 1000

    // Um teste que não passou marca o ALVO: o conjunto inteiro deixa de valer,
    // e nenhum irmão dele é pulado enquanto a falha estiver de pé. `failed` é
    // EXPLÍCITO — uma suíte parcial (`s.passed>0` e `s.failed>0`) ainda tem
    // `checks>0`, e inferir por `!checks` a cacheava como verde.
    if (exception || failed || !checks) {
      const failedAt = new Date(second + FAILED_MARK)
      utimesSync(targetPath, failedAt, failedAt)
      bust(testPath)
      // O vermelho é gravado num sidecar carimbado com o segundo+1ms do alvo —
      // `readPaired` só o reusa enquanto `targetSecond` bater E as deps não
      // tiverem mexido; um alvo reeditado sai desse segundo e o sidecar deixa de
      // casar sozinho. Toda falha grava (não só `cacheFailure` — ver comment-block
      // do topo). Uma EXCEÇÃO continua sem sidecar: sem estrutura fixa pra
      // reconstruir o stack, um vermelho de exceção sempre re-roda por completo.
      if (!exception) {
        writeSelf(testPath, {
          failed: true, exception: false,
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
  //    para um sidecar em `.utest/`, junto do `results.json`. O grafo de deps continua
  //    valendo.
  const selfFile = testPath =>
    join(root, '.utest', relative(root, testPath).replace(/[/\\]/g, '__') + '.json')

  // Puro mtime/sidecar, sem árbitro — usado internamente por `readPairedByTime`
  // (o caso de falha reproduzível) para não recursar na arbitragem duas vezes.
  // Quem chama de fora (`read`, sem alvo) passa por `readSelfArbitrated` abaixo.
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

  const readSelfArbitrated = (testPath, extraDeps = [], phase = 'unit') => {
    const timeVerdict = readSelf(testPath, extraDeps)
    return arbitrate(phase, testPath, extraDeps, null, timeVerdict)
  }

  // ── A árbitro: cruza o veredito do cache de tempo com `results.json` ────────
  // Ver "A segunda checagem" no comment-block do topo. Os dois mecanismos leem
  // dados já em memória (nenhum I/O extra) — `results` já é carregado no mesmo
  // `TestCache`. `timeVerdict` é o que `readPairedByTime`/`readSelf` decidiram
  // sozinhos; `null` ali significa MISS do cache de tempo, não "sem opinião".
  const diag = msg => {
    if ((globalThis.utestVerbosity ?? 0) >= 2) process.stderr.write(`\x1b[33m[cache] ${msg}\x1b[39m\n`)
  }

  const arbitrate = (phase, testPath, extraDeps, targetPath, timeVerdict) => {
    const historyFresh = results.fresh(phase, testPath, extraDeps, targetPath)
    const rel = () => relative(root, testPath)

    if (timeVerdict) {
      // HIT do tempo, histórico discorda (teste/alvo/deps mudaram desde o
      // último record) → rebaixa a MISS. O cache de tempo achou parecido; o
      // histórico prova que não é.
      if (!historyFresh) {
        diag(`${rel()}: cache de tempo dizia HIT, results.json discorda (mtime/alvo/deps mudaram desde o último record) → re-rodando`)
        return null
      }
      return timeVerdict
    }

    // MISS do tempo — só promove a HIT se o histórico CONFIRMA, byte-a-byte
    // nos mtimes, que teste/alvo/deps são os mesmos de um record que passou
    // (ou de um vermelho reproduzível). Sem isso, uma edição real continua MISS.
    if (!historyFresh) return null
    const rec = results.get(phase, testPath)
    if (!rec) return null
    // Promover exige CONFIRMAR o alvo especificamente — um record do formato
    // ANTERIOR (sem `targetMtime`) não tem essa informação, e sem ela não dá pra
    // distinguir "o alvo não mudou" de "o alvo mudou e o histórico é cego pra
    // isso". Rebaixar tolera o campo ausente (não é sinal de nada); promover
    // exige o campo presente E batendo — a assimetria é proposital: o lado
    // arriscado é sempre o menos permissivo. Sem confirmação, a primeira leitura
    // fica MISS, roda de verdade, e grava `targetMtime` — dali em diante já
    // promove normalmente, sem precisar de `--force`.
    if (targetPath && rec.targetMtime === undefined) return null
    // Exceção nunca promove — sem sidecar, o stack fresco sempre vale mais que o
    // segundo economizado. Um record do formato ANTERIOR (sem o campo `exception`
    // explícito) é tratado como se FOSSE exceção — o lado seguro quando falta
    // informação: `rec.state === 'exception'` cobre quem já usava esse valor;
    // `rec.exception === undefined` cobre qualquer record antigo cujo `state` só
    // dizia `'failed'`/`'passed'` sem dizer se era exceção. Checar só
    // `rec.exception` (truthy) deixava passar ambos os casos SEM o campo,
    // promovendo uma exceção antiga por engano — achado rodando ~/bot.
    if (rec.state === 'exception' || rec.exception !== false) return null
    diag(`${rel()}: cache de tempo dizia MISS (segundo dessincronizado?), results.json confirma teste/alvo/deps intactos → aproveitando`)
    return {
      checks: rec.checks ?? 0, tests: rec.tests ?? 0,
      failCount: rec.failCount ?? 0, exception: false,
      failed: rec.state === 'failed',
    }
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
  // `phase` (opcional, default `'unit'`): qual fatia de `results.json` a árbitro
  // consulta — sem isto, cai na fase mais comum, mesmo default que `scanner.js` usa
  // pro `include` de um `TEST.yaml` sem seção própria.
  return {
    deps,
    bust,
    results,
    read: (testPath, targetPath, { extraDeps = [], phase = 'unit' } = {}) =>
      targetPath ? readPaired(testPath, targetPath, extraDeps, phase) : readSelfArbitrated(testPath, extraDeps, phase),
    write: (testPath, targetPath, result, { extraDeps = [], phase = 'unit' } = {}) => {
      try {
        if (targetPath) writePaired(testPath, targetPath, result, extraDeps)
        else if (result.exception) {
          // Exceção não tem estrutura fixa pra reconstruir (stack fresco vale mais
          // que o segundo economizado) — sempre re-roda, sem sidecar.
          bust(testPath)
        } else if (result.failed || !result.checks) {
          // Vermelho comum agora CACHEIA igual ao verde: o sidecar guarda o
          // resultado e o mtime ATUAL do teste (sem alvo, não há segundo comum pra
          // recravar) — a próxima leitura só re-roda se o teste ou uma dep mudar de
          // verdade, ou sob `--force`. O que atualiza o cache é sempre a ÚLTIMA
          // execução real, passe ou falhe: um vermelho que virou verde limpa o
          // sidecar (branch `else` abaixo, via `writeSelf` do resultado passado).
          writeSelf(testPath, {
            failed: true, exception: false,
            checks: result.checks ?? 0, failCount: result.failCount ?? 1, tests: result.tests ?? 0,
          }, extraDeps)
        }
        else writeSelf(testPath, result, extraDeps)
      } catch {}
      // `results.record` roda SEMPRE, verde ou vermelho, e DEPOIS do bloco acima —
      // `writePaired` recrava o mtime do alvo (o segundo comum), e `targetMtime`
      // precisa capturar esse valor já atualizado, ou a árbitro acusaria stale na
      // rodada seguinte mesmo sem nada ter mudado. Ponto único de escrita: quem usa
      // `cache.write` (testes inclusive) nunca precisa lembrar de gravar os dois
      // lados. Uma EXCEÇÃO ainda vira `state:'failed'` aqui — mas sem sidecar (o
      // branch acima não gravou um), e sem sidecar `readPairedByTime`/`readSelf`
      // nunca confirmam o veredito de tempo sozinhos, então a árbitro nunca chega a
      // promover uma exceção mesmo com o record de histórico presente.
      try {
        results.record(phase, testPath, {
          ms: result.ms, tests: result.tests, checks: result.checks,
          failCount: result.failCount, failLines: result.failLines,
          state: (result.exception || result.failed || !result.checks) ? 'failed' : 'passed',
          exception: !!result.exception,
          extraDeps, targetPath,
        })
      } catch {}
    },
  }
}

export default TestCache
