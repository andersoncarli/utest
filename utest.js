#!/usr/bin/env bun
// utest.js — in-process test runner
//
// Architecture: scan → [import target → inject exports as ctx] → import test file
//               → runTest(t, ctx) in-process → stream/collect → cache → render
//
// Test bodies have no world outside their context argument:
//   test('hash53', ({ hash53, check }) => { check(hash53(''), 0) })
//   — hash53 comes from the target module, check from the runner. Zero imports needed.

import { G } from '../utils/globals.d.js'
await G._ready

import path from 'path'
import fs from 'fs'
import { plugin } from 'bun'
import { parse as parseYaml } from 'bun:yaml'

import test from './test.js'
import { check, checkFail, checkException } from './check.js'
import { scan, findTarget } from './scanner.js'
import { TestCache } from './cache.js'
import { view, fullView, failLines, failData, summary, glyphs, checkView, hogReport, failInfo, phaseLine, phaseMs, phaseHogSecs, progressBar, link, displayLen, HOG_MS } from './viewer.js'
import { expect, describe, it, spyOn, jest, vi, mock, beforeAll, afterAll,
         beforeEach, afterEach, withTempDir} from './shims.js'

import { busReset } from '../utils/src/bus.js'

import is from '../utils/src/is.js'
import toSource from '../utils/src/toSource.js'
import callstack from '../utils/src/callstack.js'
import normalize from '../utils/src/normalize.js'
import cl from '../utils/src/cl.js'
import forEach from '../utils/src/forEach.js'
import dotfill from '../utils/src/dotfill.js'
import hash53 from '../utils/src/hash53.js'
import { loaderFilter, kindOf, executorFor, entriesFor, phaseSetupFor } from './kinds.js'
import { captureConsole } from './console-capture.js'

const realProcessExit = process.exit.bind(process)
const realStdoutWrite = process.stdout.write.bind(process.stdout)

globalThis.utestAllowDestructiveOutput = false
function guardedStdoutWrite(chunk, ...args) {
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
  const destructive = /\x1b(?:c|\[(?:2J|3J|H|\?1049[hl]))/g
  if (destructive.test(text) && !globalThis.utestAllowDestructiveOutput) {
    const clean = text.replace(destructive, '')
    if (!clean) return true
    return realStdoutWrite(clean, ...args)
  }
  return realStdoutWrite(chunk, ...args)
}
process.stdout.write = guardedStdoutWrite

function installProcessExitTrap() {
  process.exit = (code = 0) => {
    const err = new Error(`process.exit(${code}) called during utest import/run`)
    err.name = 'UTestProcessExit'
    err.exitCode = code
    throw err
  }
}

// Needed by callstack.js and cl.js internally
globalThis.fs = fs
globalThis.path = path

// Wire checkView so standalone check() calls (outside test context) render properly
check.view = (c) => checkView(c, { width: process.stdout.columns || 80 })

// ─── Base context ─────────────────────────────────────────────────────────────
// Everything a test body might need except target exports (added per file).
// Mirrors setup.js globals so tests written for the subprocess runner also work in-process.
const baseCtx = { check, checkFail, checkException, expect,
  is, cl, toSource, callstack, normalize, hash53, forEach, dotfill,
  withTempDir, spyOn, jest, vi, mock }

// ─── Globals for fn.length===0 style and file-level code ─────────────────────
for (const [k, v] of Object.entries(baseCtx)) globalThis[k] = v
Object.assign(globalThis, {
  test, describe, it, spyOn, jest, vi, mock,
  beforeAll, afterAll, beforeEach, afterEach
})
globalThis.utest = true
globalThis.utestVerbosity = 1

// ─── Plugin: redirect built-in test imports to our shims ─────────────────────
const shimsPath = new URL('./shims.js', import.meta.url).pathname
plugin({
  name: 'bun-test-shim',
  setup(build) {
    build.onLoad({ filter: loaderFilter() }, async (args) => {
      let code = await fs.promises.readFile(args.path, 'utf8')
      const needsShim = code.includes('bun:test') || code.includes('node:test')
      // Files that don't use bun:test/node:test don't need shim injection.
      // Return content unchanged with loader:'js' so Bun uses the plain JS loader
      // (not its test runner) and preserves accurate source maps for stack traces.
      if (!needsShim) return { contents: code, loader: args.path.endsWith('.ts') ? 'ts' : 'js' }
      code = code.replace(/import\s+[\s\S]*?from\s+["'](?:bun:test|node:test)["'];?/g,
        m => m.split('\n').map(l => '// [utest-shim] ' + l).join('\n'))
      const isCjs = /\bmodule\.exports\b|\brequire\s*\(/.test(code)
      if (!isCjs) {
        const shebang = code.startsWith('#!')
          ? code.slice(0, code.indexOf('\n') + 1)
          : ''
        const body = shebang ? code.slice(shebang.length) : code
        code = shebang + `import { test, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, check } from ${JSON.stringify(shimsPath)};` + body
      }
      return { contents: code, loader: args.path.endsWith('.ts') ? 'ts' : 'js' }
    })
  }
})

// ─── In-process runner ───────────────────────────────────────────────────────
async function runTest(t, ctx, timeout = 1000) {
  if (t.state !== 'pending') return t
  t.state = 'running'
  const saved = check.test
  check.test = t
  const start = process.hrtime.bigint()

  // Build per-test context (binds check/log to this test node)
  const tCtx = {
    ...ctx,
    check: check.bind(t),
    checkFail: checkFail.bind(t),
    checkException: checkException.bind(t),
    test: test.bind(t),
    log: (...a) => t.output.push(['log', a]),
    debug: (...a) => t.output.push(['debug', a]),
  }

  let _timeoutTimer = null
  try {
    const eff = t.op?.timeout || timeout
    await Promise.race([
      (async () => {
        // Describe nodes: run beforeAll hooks, children, then afterAll hooks.
        if (t._describe) {
          for (const f of t._beforeAll || []) await f()
          for (const child of t.tests) await runTest(child, ctx, timeout)
          for (const f of t._afterAll || []) try { await f() } catch { }
          return
        }
        // Leaf tests with no pre-registered children call fn now.
        if (!t.tests?.length) {
          const chain = []
          for (let p = t.parent; p; p = p.parent) chain.unshift(p)
          for (const p of chain) for (const f of p._beforeEach || []) await f()
          let r
          const releaseConsole = captureConsole(t)
          try {
            if (t.fn.length === 0) {
              r = t.fn.call(t)
              if (r instanceof Promise) await r
            } else if (t.fn.length === 1) {
              // Detect style from first param: ({check}) → context; (done) → callback
              const firstParam = (t.fn.toString().match(/\(([^)]*)\)/) ?? [])[1]?.trim() ?? ''
              if (firstParam.startsWith('{') || firstParam.startsWith('[')) {
                r = t.fn.call(t, tCtx)
                if (r instanceof Promise) await r
              } else {
                // done-callback style: (done) => { setTimeout(() => done()) }
                const done = new Promise((res, rej) => { r = t.fn.call(t, (e) => e ? rej(e) : res()) })
                if (r instanceof Promise) await r
                else await done
              }
            } else {
              const done = new Promise((res, rej) => {
                r = t.fn.call(t, (e) => e ? rej(e) : res(), tCtx)
              })
              await done; return
            }
          } finally {
            releaseConsole()
            for (const p of [...chain].reverse()) for (const f of p._afterEach || []) await f()
          }
        }
        for (const child of t.tests) await runTest(child, ctx, timeout)
      })(),
      // O timer TEM que ser limpo quando o trabalho ganha a corrida — senão um
      // `setTimeout(…, 10000)` de um passo de `eval` já concluído segura o event loop
      // por 10s depois do relatório (o "teardown misterioso" que o `--trace` denunciava).
      new Promise((_, r) => { _timeoutTimer = setTimeout(() => r(new Error(`Timeout (${eff}ms)`)), eff) })
    ])

    if (t.state === 'running')
      t.state = (t.checks.some(c => c.state !== 'passed') || t.tests.some(c => ['failed', 'exception'].includes(c.state)))
        ? 'failed' : 'passed'
  } catch (e) {
    t.state = 'exception'; t.error = e
  } finally {
    if (_timeoutTimer) clearTimeout(_timeoutTimer)
    // O veredito acabou de ser dado, mas `check.bind(t)` continua válido: um
    // `setTimeout`/promise solta ainda pode empurrar checks para dentro de
    // `t.checks` DEPOIS desta linha. Sem selar, essa falha não conta para o
    // estado — o arquivo passa, cacheia verde, e o defeito some. Selado, ela
    // reabre o veredito de quem a soltou.
    t.sealed = true
    check.test = saved
    // Um passo cujo custo real já rodou ANTES do `test()` (a fase `eval`: `sweepFeature`
    // roda o `sh()` de verdade uma vez, e o `fn` deste nó só confere o veredito já pronto)
    // mede quase zero aqui — o tempo de verdade se perde, e `--hogs`/o `(Nms)` do viewer
    // ficam cegos exatamente pros passos que mais importa saber que são lentos. `op.realMs`
    // é o jeito do chamador dizer "o custo já aconteceu, foi ISTO".
    t.duration = typeof t.op?.realMs === 'number'
      ? t.op.realMs
      : Number(process.hrtime.bigint() - start) / 1e6
  }
  return t
}

// ─── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const hogs = args.includes('--hogs') || args.includes('-h')
let verbosity = 1
const _vArg = args.find(a => /^(-v)?:?([0123])$/.test(a))
const _vExplicit = !!_vArg
if (_vArg) verbosity = parseInt(_vArg.match(/([0123])$/)[1])
// `--hogs` é um MODO à parte, independente de `-v:N` — só tempo, cego a erro (nem os fails
// rápidos contam como hog). Sem isto, `-v:3` ainda estufaria a saída ANTES da lista final:
// o streaming por-teste roda durante a fase (`runPhase`), não no render — forçar `verbosity`
// aqui, antes do global, é o único jeito de calar aquilo sem duplicar a checagem em dois
// lugares.
if (hogs) verbosity = 1
globalThis.utestVerbosity = verbosity

let force = args.includes('--force') || args.includes('-f')
const watch = args.includes('--watch') || args.includes('-w')
const showUnc = args.includes('--uncovered') || args.includes('-u')
// `--json`: uma linha por arquivo de teste em JSON, e NADA mais no stdout — para um
// consumidor de máquina (o `sprint eval --sweep`, que mapeia verdicto→degrau). O relatório
// humano, os hogs e o total são suprimidos; o exit code segue a mesma regra (1 se há
// falha/exceção).
const asJson = args.includes('--json')
// `--trace` / `--trace=<path>`: apêndice ao relatório normal — a árvore de
// PARA-ONDE-FOI-A-PAREDE. Camada auto por fase: fase com provider (`eval`/`int`) →
// regiões de wall-time (`boot`, `provider`, `entry`, `sweepFeature`, cada `sh:`) + o
// interior do subprocesso via `--import trace-preload.mjs`; fase de motor in-process →
// `probe.tree()`. Essa DISSECAÇÃO é só em escopo filtrado (mesmo motivo do `-v:3` largo:
// re-executa). Escopo largo responde a outra pergunta — "que parte da suíte custa" — e a
// responde agregando por FRENTE/FEATURE o tempo já gravado, sem instrumentar nada. Com
// `=<path>` (ou um positional logo após), grava o `trace.json` no formato Chrome Trace
// Event — carregável em chrome://tracing e Perfetto.
const _traceArg = args.find(a => a === '--trace' || a.startsWith('--trace='))
const trace = !!_traceArg
const traceOut = _traceArg?.includes('=') ? _traceArg.slice('--trace='.length) : null
const timeoutArg = args.find(a => a.startsWith('--timeout=') || a.startsWith('-to='))
const timeout = timeoutArg ? parseInt(timeoutArg.split('=')[1]) : 1000
const positional = args.filter(a => !a.startsWith('-') && !/^(-v)?:?([0123])$/.test(a))
// Um positional que casa um NOME DE FASE declarada no TEST.yaml seleciona aquela fase e sai
// da lista de filtros — `utest.js eval` roda só a fase `eval`, cacheada, em vez de tratar
// `eval` como termo de nome (que furava o cache e ainda escaneava as outras fases). Os
// positionals restantes seguem como filtro de nome / path. A leitura é rasa (só as chaves
// de topo do YAML de `cwd`); a resolução completa de fase vem depois, com `cfgRaw`.
const _yamlNearCwd = path.resolve(process.cwd(), 'TEST.yaml')
const _declaredPhases = new Set(fs.existsSync(_yamlNearCwd)
  ? Object.keys(parseYaml(fs.readFileSync(_yamlNearCwd, 'utf8')) || {}).filter(k => k !== 'boot' && k !== 'exclude')
  : [])
const phaseArg = positional.find(a => _declaredPhases.has(a) && !fs.existsSync(a))
let filterTerms = positional.filter(a => a !== phaseArg && !fs.existsSync(a))
let rawTarget = positional.find(a => fs.existsSync(a))

// **O storage é o índice.** Um termo que NÃO é path (`utest 3.2`, `utest button`) é
// resolvido contra as chaves de `.utest/results.json` ANTES de qualquer scan: se casa
// EXATAMENTE um arquivo, ele vira o `rawTarget` e o termo some — a rodada acha e executa só
// aquele teste, sem varrer o repo. Casou vários (`utest eval` já é fase; `utest 2` casaria
// a frente toda) → segue como filtro, o scan resolve. Zero casos → segue como filtro
// (talvez o storage esteja vazio; o scan tenta).
if (!rawTarget && filterTerms.length === 1) {
  try {
    const { TestCache: _TC } = await import('./cache.js')
    const _idxRoot = [process.cwd(), path.dirname(_yamlNearCwd)].find(d => fs.existsSync(path.resolve(d, 'TEST.yaml'))) || process.cwd()
    const _term = filterTerms[0].toLowerCase()
    // Dedup por relpath — o mesmo arquivo pode aparecer em duas fases do storage (`unit` e
    // `eval`); ainda é UM arquivo.
    const _paths = new Set()
    for (const e of _TC(_idxRoot).results.list())
      if (e.relpath.toLowerCase().includes(_term) && fs.existsSync(e.abspath)) _paths.add(e.abspath)
    if (_paths.size === 1) {
      rawTarget = [..._paths][0]
      filterTerms = []
    }
  } catch {}
}

const _isFile = rawTarget && fs.statSync(rawTarget).isFile()
const targetDir = _isFile ? path.dirname(rawTarget) : rawTarget
const root = path.resolve(targetDir || '.')
const configPath = [root, process.cwd()].map(d => path.resolve(d, 'TEST.yaml')).find(p => fs.existsSync(p))
  || path.resolve(process.cwd(), 'TEST.yaml')

// **Escopo estreito É o pedido de drill-in** — RE-EXECUTA (`force`) e sobe de nível, em dois
// degraus:
//   - uma FRENTE / FEATURE (um diretório que não é a raiz, ou um termo de filtro que casa
//     vários) → `-v:2`: a visão POR ARQUIVO — uma barra de título por arquivo (nome,
//     contagem, tempo acima de 10ms), mais a linha do erro sob cada vermelho.
//   - um ARQUIVO só (`utest 3.2.eval.js`) → `-v:3`: `-v:2` + a árvore por TESTE e o
//     output do `log()`. Sem nada para rodar (tudo cache), o `-v:3` cai no `-v:2`.
// Um `-v:N` explícito na linha manda — `utest 3.2.eval.js -v:1` respeita o 1.
//
// Escopo LARGO (`.`, a raiz, uma fase inteira) NÃO fura o cache nem com `-v:3` — ali seria
// o `--force` largo que o `docs/CRASH-LOG.md` tirou do procedimento (o pico de spawn da
// fase `eval`/`int` dispara o `systemd-oomd` e mata o editor junto).
const _rootIsProject = path.resolve(rawTarget || '.') === path.dirname(configPath)
const narrowScope = (!!rawTarget && !_rootIsProject) || filterTerms.length > 0
if (narrowScope && !watch) {
  if (!force) force = true
  if (!_vExplicit) verbosity = Math.max(verbosity, _isFile ? 3 : 2)
} else if (verbosity >= 3 && !force && !watch) {
  process.stderr.write('\x1b[33m-v:3 em escopo largo (raiz ou fase inteira) não fura o cache — rode filtrado: um path de arquivo/subdir, ou um termo\x1b[39m\n')
}
globalThis.utestVerbosity = verbosity
const width = parseInt(process.env.WIDTH || '') || process.stdout.columns || 80
const startAll = process.hrtime.bigint()

// A INSTRUMENTAÇÃO (regiões + `probe`) só em escopo filtrado — o mesmo motivo do `-v:3`
// largo: ela força re-execução. Um `--trace` largo não fica sem resposta; cai na agregação
// por frente/feature lá embaixo, que lê o tempo já gravado e não re-roda nada.
let T = null
const doTrace = trace && (narrowScope || _isFile)
if (doTrace && (hogs || asJson)) {
  process.stderr.write('\x1b[33m--trace ignorado junto de --hogs/--json\x1b[39m\n')
}
if (doTrace && !hogs && !asJson) {
  T = await import('./trace.js')
  globalThis.__utestTrace = T
  // `performance.now()` aqui = ms desde o boot do processo (bun startup + os imports do
  // topo deste arquivo). Passado como `lead`, vira o span inicial da árvore — o total
  // passa a bater com o `time` real.
  T.install(`utest ${rawTarget ? path.basename(rawTarget) : filterTerms.join(' ')}`, performance.now())
  T.mark('boot')
  // Decompõe cada Bun.spawnSync/Bun.spawn em sub-regiões `sh:<cmd>` — sem isto, um
  // arquivo que dispara CLI real via subprocesso (ex.: `run("eval.js", …)`) some inteiro
  // dentro do `entry` opaco, e o apêndice não tem para onde apontar.
  T.wrapSpawns()
}

// ─── Project boot ─────────────────────────────────────────────────────────────
// Opt-in via TEST.yaml `boot: <path>` (resolved relative to the config file).
// A target project may need its own globals registered (e.g. soml's `bootstrap()`)
// before any test file imports — this runs once, ahead of the scan.
if (fs.existsSync(configPath)) {
  const cfg = parseYaml(fs.readFileSync(configPath, 'utf8')) || {}
  if (cfg.boot) await import(path.resolve(path.dirname(configPath), cfg.boot))
}
if (T) T.end()   // fecha `boot`

// ─── Phases ───────────────────────────────────────────────────────────────────
// `TEST.yaml` pode declarar mais de uma fase (`unit`, `tui`, `integration`, `eval`, ...),
// cada uma com o próprio `include`/`exclude`. Isto SEMPRE chamava `scan(root, configPath)`
// sem 3º argumento — `phase` caía no default `'unit'` e as outras fases declaradas no YAML
// nunca eram varridas: `.tuit` e `.integration.t.js` existiam no vocabulário (`kinds.js`) e
// no config, mas nenhuma chamada os alcançava. Uma fase sem `include` E sem provider
// registrado (`entriesFor`) não é uma fase de arquivo — é ignorada, para um `boot:`/`exclude`
// não virar fase fantasma.
const cfgRaw = fs.existsSync(configPath) ? (parseYaml(fs.readFileSync(configPath, 'utf8')) || {}) : {}
const RESERVED = new Set(['boot', 'exclude'])
let phaseNames = Object.keys(cfgRaw).filter(k => !RESERVED.has(k) && (cfgRaw[k]?.include || entriesFor(k)))
if (!phaseNames.length) phaseNames.push('unit')
if (phaseArg) phaseNames = phaseNames.filter(p => p === phaseArg)

installProcessExitTrap()

// "cada fase em tempo real": uma barra de progresso reescrita a cada arquivo. Só num TTY
// interativo, fora do `-v:3` (que já faz streaming por-teste), do `--json`, do `--hogs`, e
// do filho do `--watch` (`--no-stream`) — o watch roda em silêncio e só imprime o
// relatório final, um por vez, no log.
const noStream = args.includes('--no-stream')
const streamPhase = process.stdout.isTTY && verbosity < 3 && !asJson && !hogs && !watch && !noStream && !doTrace

// ─── Roda UMA fase: scan (ou provider) → executa cada entry → devolve o nó da fase ────────
async function runPhase(phase) {
  let entries = [], uncovered = [], cache = null
  const provider = entriesFor(phase)
  try {
    if (provider) {
      // Sem alvo pareado (`.eval.js` não tem `.js` irmão): `TestCache` cai em `readSelf`
      // (sidecar em `.utest/`), o mesmo caminho que um `.t.js` sem alvo já usa — cache
      // de graça, nenhuma segunda implementação. Raiz do PROJETO (não `root`, que um alvo
      // de arquivo estreita pro diretório dele) — as entries de uma fase com provider não
      // são scoped por `root`, então o cache não pode ser, ou um `_isFile` numa árvore vira
      // sidecar espalhado pelo repo inteiro.
      cache = TestCache(path.dirname(configPath))
      const _pn = T?.mark('provider')
      let provided = await provider()
      if (_pn) T.end(_pn)
      // `scan()` já restringe por `root` andando o diretório; um provider (`eval`: as
      // entries vêm de `loadFronts()`, não de um walk) não ganha isso de graça — sem
      // filtrar aqui, `bun utest/utest.js plans/1-motor` varria o CORPUS INTEIRO, não só
      // a frente pedida. Mesma regra: só entries cujo caminho more sob `root`. `_isFile`
      // corta para UMA entry logo (`utest 3.2` → um `.eval.js`), sem instanciar as outras 76.
      if (_isFile) {
        const absFile = path.resolve(rawTarget)
        provided = provided.filter(e => e.path === absFile)
      } else if (rawTarget) {
        const rootPrefix = root.endsWith(path.sep) ? root : root + path.sep
        provided = provided.filter(e => e.path === root || e.path.startsWith(rootPrefix))
      }
      entries = provided.map(e => ({
        ...e, target: e.target ?? null, extraDeps: e.extraDeps ?? [],
        cache: cache.read(e.path, e.target ?? null, { extraDeps: e.extraDeps ?? [] }),
      }))
    } else if (_isFile) {
      // UM arquivo, fase SEM provider: nenhum walk. `findTarget` (puro) acha o alvo pareado;
      // `cache.read` o resto. Só produz entry se o arquivo pertence a ESTA fase — um
      // `.eval.js` não vira entry da fase `unit` (senão `utest 3.2` rodaria as duas).
      const absFile = path.resolve(rawTarget)
      const cfg = cfgRaw[phase] || {}
      const inc = cfg.include || ['**/*.t.js', '**/*.test.js']
      const belongs = inc.some(g => {
        const re = new RegExp('^' + g.replace(/[.]/g, '\\.').replace(/\*\*\//g, '(.*/)?').replace(/\*/g, '[^/]*') + '$')
        return re.test(path.relative(path.dirname(configPath), absFile))
      })
      if (belongs) {
        const target = findTarget(absFile)
        cache = TestCache(path.dirname(configPath))
        entries = [{ path: absFile, target, cache: cache.read(absFile, target) }]
      }
    } else {
      ; ({ entries, uncovered, cache } = scan(root, configPath, phase))
    }
  } catch (e) {
    if (e.code !== 'ENOENT') { console.error('[utest] scan error:', e.message); realProcessExit(1) }
  }
  const seen = new Set()
  entries = entries.filter(e => !seen.has(e.path) && seen.add(e.path))
  if (_isFile) {
    const absFile = path.resolve(rawTarget)
    entries = entries.filter(e => e.path === absFile)
  }

  // Recurso compartilhado pela fase (`registerPhaseSetup` via `boot:`) — a fase `eval` sobe
  // UM Chromium aqui, uma vez, e o derruba no fim. Só quando há entries a rodar.
  let phaseTeardown = null
  const phaseSetup = phaseSetupFor(phase)
  if (phaseSetup && entries.length) {
    const _ps = T?.mark('phaseSetup ' + phase)
    try { phaseTeardown = await phaseSetup() } catch (e) { process.stderr.write(`[utest] phaseSetup(${phase}) falhou: ${e?.message ?? e}\n`) }
    if (_ps) T.end(_ps)
  }

  const main = { name: phase, tests: [], checks: [], state: 'pending', duration: 0 }
  const phaseStart = process.hrtime.bigint()

  let _done = 0
  for (const entry of entries) {
  busReset()
  // Barra viva: `EVAL [████░░░░] plans/5-apps/5.26.eval.js ....  12/77` — reescrita a cada
  // arquivo com `\r`, apagada no fim da fase (`\r\x1b[K`). Só num TTY, fora do `-v:3`/json/
  // hogs (que têm o próprio streaming ou não querem ruído).
  if (streamPhase) process.stdout.write('\r' + progressBar(phase, _done, entries.length, path.relative(root, entry.path), { width }) + '\x1b[K')
  _done++

  // ── Cached: inject placeholder, skip execution ───────────────────────────
  // Bypass cache when filter terms are active (user wants live output/logs)
  const entryName = path.relative(root, entry.path)
  const matchesFilter = filterTerms.length === 0 ||
    filterTerms.every(t => entryName.toLowerCase().includes(t.toLowerCase()))
  const wantsLiveRun = filterTerms.length > 0 && matchesFilter
  // Um cache pode dizer VERDE (o caso comum) ou VERMELHO REPRODUZÍVEL
  // (`failed`, só gravado por quem passou `cacheFailure` — hoje a fase `eval`
  // quando a feature é 100% sandbox). Vermelho cacheado é pulado igual: o
  // resultado não muda enquanto o alvo e o grafo não mudarem, e re-rodar um
  // passo de 10s só para reconfirmar o vermelho é o que este cache existe para
  // evitar (`.sprint/TEST-EVAL.md`). Uma EXCEÇÃO não-`failed` no cache continua
  // re-rodando: o stack fresco vale mais que o segundo economizado.
  const cacheHit = entry.cache && (entry.cache.failed || !entry.cache.exception)
  if (!force && !wantsLiveRun && cacheHit) {
    const c = entry.cache
    // O registro do histórico (`utest/results.json`) é a FONTE do render — cache-hit e live
    // convergem no mesmo formato, e por isso o output quente == frio. Se o histórico ainda
    // não tem este arquivo (1ª rodada com o storage), degrada suave para o que o cache de
    // tempo sabe: `ms:0` até a próxima rodada preencher.
    const rec = cache?.results?.get(phase, entry.path)
    main.tests.push({
      name: path.basename(entry.path),
      state: c.failed ? 'failed' : 'passed',
      address: path.relative(root, entry.path),
      cached: true, _cached: true,
      testCount: rec?.tests ?? c.tests,
      checkCount: rec?.checks ?? c.checks,
      failCount: rec?.failCount ?? c.failCount ?? (c.failed ? 1 : 0),
      lastMs: rec?.ms || 0,
      duration: 0, checks: [], tests: [], output: [],
      _failLines: rec?.failLines,
    })
    // Verificação de 2º nível: o cache de tempo disse HIT; o histórico concorda que nada
    // mudou? Discordar é sinal de furo na regra do cache — reporta, não corrige (o cache
    // de tempo continua sendo a autoridade sobre re-rodar). É diagnóstico de MANUTENÇÃO
    // do cache, não do teste — some no `-v:1` default (uma rodada larga cospe uma linha
    // por vermelho cacheado, e o dono não pode agir sobre nenhuma); aparece a partir de
    // `-v:2`, para quem está de fato investigando o cache.
    if (verbosity >= 2 && rec && cache?.results && !cache.results.fresh(phase, entry.path, entry.extraDeps ?? [])) {
      process.stderr.write(`\x1b[33m[cache] ${path.relative(root, entry.path)}: cache diz HIT mas o histórico está stale (mtime/deps mudaram desde o último run gravado)\x1b[39m\n`)
    }
    continue
  }

  // O `ms` do run anterior deste arquivo (histórico), lido ANTES de rodar — para o
  // relatório destacar a variação (`+50%` / `-40%`) quando um arquivo re-executa.
  const prevMs = cache?.results?.get(phase, entry.path)?.ms || 0

  // Início da MEDIÇÃO real do entry — antes de qualquer import de alvo ou executor. Um
  // executor de fase-com-provider (`apps/eval/utest-phase.js`: `sweepFeature` roda o `sh()`
  // de verdade AQUI, na linha 359 hoje, bem antes do loop de `runTest`) gastava o tempo
  // real FORA da janela que virava `suite.duration` — o arquivo aparecia como "1.7ms" no
  // relatório por arquivo mesmo levando 5s de parede real. `entryStart` cobre tudo.
  const entryStart = process.hrtime.bigint()
  const _entryNode = T?.mark('entry ' + path.basename(entry.path))

  // ── Build context: base utils + target module exports ────────────────────
  const ctx = { ...baseCtx }
  let targetErr = null
  if (entry.target) {
    try {
      const mod = await import(entry.target)
      const baseName = path.basename(entry.target, path.extname(entry.target))
      for (const [k, v] of Object.entries(mod)) if (k !== 'default') ctx[k] = v
      if (mod.default !== undefined) {
        ctx[baseName] = mod.default   // hash53.js → ctx.hash53, cl.js → ctx.cl
        if (!ctx.default) ctx.default = mod.default
      }
    } catch (e) { targetErr = e }
  }

  // ── Isolated load: test.begin() scopes all registrations to fileRoot ────
  const fileRoot = test.begin(path.basename(entry.path))

  // Um `.tuit`/`.eval.js` não é módulo ESM chamando `test()` — um executor registrado
  // (`kinds.js#registerExecutor`, via `boot:`) devolve os PASSOS e cada um vira um
  // `test()` filho aqui; sem executor para o kind, cai no `import()` de sempre.
  //
  // Uma fase com PROVIDER já É o kind — não precisa de `kindOf()`/`register()` pra dizer
  // isso. `register('eval')` global em `KINDS` (`kinds.js`) contaminaria QUALQUER teste que
  // afirme o vocabulário base antes da fase eval rodar (achou `kinds.t.js` fazendo
  // exatamente isso — `register()` já tinha acontecido no boot, antes do teste que prova
  // "antes de registrar, não reconhece").
  const executor = executorFor(provider ? phase : kindOf(path.basename(entry.path)))

  // Um alvo que não importa deixava o teste rodar sem os exports dele: a falha
  // chegava como `x is not defined` no primeiro check, apontando para o arquivo
  // errado. O erro do alvo é o resultado — e vem antes de qualquer check.
  let loadErr = targetErr
  try {
    if (!loadErr && executor) {
      const _sw = provider ? T?.mark('sweepFeature') : null
      const steps = await executor(entry, { kind: kindOf(path.basename(entry.path)) })
      if (_sw) T.end(_sw)
      for (const step of steps) test(step.name, step.fn, step.op)
    } else if (!loadErr) {
      await import(entry.path)
    }
  } catch (e) { loadErr = e } finally {
    test.end()
  }

  // Fase de motor in-process (sem provider): instala `probe` sobre o registry + os
  // internos do compilador para a sub-árvore de função aparecer no apêndice de trace.
  let _probe = null
  if (doTrace && !provider) {
    try {
      ;({ probe: _probe } = await import('./probe.js'))
      if (globalThis.pixel?._registry) _probe(globalThis.pixel._registry)
      const somlPath = path.resolve(path.dirname(configPath), 'soml.js')
      if (fs.existsSync(somlPath)) {
        const { __internals } = await import(somlPath)
        if (__internals) _probe(__internals)
      }
      _probe.reset()
    } catch { _probe = null }
  }

  if (loadErr) {
    if (_entryNode) T.end(_entryNode)
    const node = {
      name: path.basename(entry.path), state: 'exception', error: loadErr,
      address: path.relative(root, entry.path),
      tests: [], checks: [], output: [], duration: 0,
    }
    main.tests.push(node)
    if (verbosity >= 3) { const v = view(node, { verbosity, width }); if (v) process.stdout.write(v + '\n') }
    continue
  }

  // ── Run all registered tests in-process ──────────────────────────────────
  const suite = {
    name: path.basename(entry.path),
    address: path.relative(root, entry.path),
    tests: fileRoot.tests,
    checks: [], output: [], state: 'pending', duration: 0,
  }

  for (const t of suite.tests) {
    await runTest(t, ctx, timeout)
    if (verbosity >= 3 && matchesFilter) {
      const v = view(t, { verbosity, width })
      if (v) process.stdout.write(v + '\n')
    }
  }

  if (_probe) {
    let out = ''
    _probe.tree({ write: s => { out += s }, top: 25 })
    suite._probeTree = out
    _probe.restore()
  }
  if (_entryNode) T.end(_entryNode)

  suite.duration = Number(process.hrtime.bigint() - entryStart) / 1e6
  // O relatório mostra SEMPRE o tempo da ÚLTIMA execução real (`lastMs`), nunca o tempo
  // de uma rodada de cache — que num replay é ~0 e não diz nada. Este arquivo acabou de
  // rodar, então `lastMs` é o tempo de agora; `prevMs` (o run ANTERIOR) fica só para o
  // `deltaTag`. Assim o número reportado é idêntico esteja o cache quente ou frio.
  suite.lastMs = Math.round(suite.duration)
  suite.prevMs = prevMs
  const s = summary(suite)
  suite.state = s.exception > 0 ? 'exception' : s.failed > 0 ? 'failed' : 'passed'
  main.tests.push(suite)

  // `--hogs` é a leitura "quem está bloqueando AGORA" — sem isto, ela só falava no final,
  // depois da suíte inteira já ter rodado, que é exatamente o cenário que motivou o pedido
  // ("não conseguimos identificar quem está bloqueando"). Delta desde o INÍCIO GERAL
  // (`startAll`, antes de qualquer fase), não desde a fase — uma trava no meio do `unit`
  // ainda mostra o relógio de parede real.
  if (hogs) {
    const sinceStart = Math.round(Number(process.hrtime.bigint() - startAll) / 1e6)
    process.stdout.write(`${phase}/${suite.name} (Δ${Math.round(suite.duration)}ms, +${sinceStart}ms)\n`)
  }

  // ── Update cache ─────────────────────────────────────────────────────────
    // `entry.cacheFailure` (um executor a marca — `apps/eval/utest-phase.js`
    // quando a feature não tem passo `real`) diz que o resultado VERMELHO é
    // reproduzível e pode ser gravado, para não re-rodar um sweep caro só para
    // reconfirmar. Sem a marca, uma falha só busta, como sempre.
    const cacheData = {
      tests: s.tests, checks: s.passed,
      failCount: (s.failed || 0) + (s.exception || 0),
      exception: suite.state === 'exception',
      failed: suite.state !== 'passed',
      cacheFailure: !!entry.cacheFailure,
    }
    if (suite.state === 'passed' || entry.cacheFailure) {
      cache.write(entry.path, entry.target, cacheData, { extraDeps: entry.extraDeps ?? [] })
    } else {
      cache.bust(entry.path)
    }
    // O histórico de TODO arquivo que rodou de verdade — verde ou vermelho. Gravado DEPOIS
    // de `cache.write`: o `writePaired` de um par verde reescreve o mtime do ALVO para o
    // segundo cravado, então `depsNewest` tem que ser lido já com esse mtime, ou o
    // cross-check acusaria stale toda rodada. É a FONTE do render — quente e frio
    // convergem no mesmo registro (`utest/results.json`).
    cache?.results?.record(phase, entry.path, {
      tests: s.tests, checks: s.passed,
      failCount: (s.failed || 0) + (s.exception || 0),
      ms: suite.duration, state: suite.state, extraDeps: entry.extraDeps ?? [],
      failLines: suite.state === 'passed' ? null : failData(suite),
    })
  }

  cache?.results?.flush()   // um write por fase, não por arquivo

  if (phaseTeardown) {
    const _pt = T?.mark('phaseTeardown ' + phase)
    try { await phaseTeardown() } catch {}
    if (_pt) T.end(_pt)
  }

  main.duration = Number(process.hrtime.bigint() - phaseStart) / 1e6
  const s = summary(main)
  main.state = s.exception > 0 ? 'exception' : s.failed > 0 ? 'failed' : 'passed'
  return { main, uncovered, summary: s }
}

// ─── Roda cada fase; a barra viva é reescrita dentro de `runPhase` ────────────────────────
const phaseResults = []
for (const phase of phaseNames) {
  phaseResults.push({ phase, ...(await runPhase(phase)) })
  if (streamPhase) process.stdout.write('\r\x1b[K')   // apaga a barra viva da fase
}

// ─── Render ───────────────────────────────────────────────────────────────────
process.stdout.write = guardedStdoutWrite
const stripAnsi = s => String(s || '').replace(/\x1b\[[0-9;]*m/g, '')

// Uma fase sem NENHUM arquivo (ex.: `tui` num projeto sem `.tuit`) não emite linha — uma
// fase vazia não é uma fase vermelha, é uma fase que não se aplica aqui.
const nonEmpty = phaseResults.filter(r => r.main.tests.length > 0)
const single = phaseNames.length === 1 || nonEmpty.length <= 1

// `--json`: um objeto por arquivo, e nada mais no stdout. Um `.eval.js` tem `feature` (o
// `N.F` do basename); um `.t.js` não. Cobre verde E vermelho — o consumidor (`sprint eval
// --sweep`) precisa dos dois para derivar degrau nos dois sentidos.
if (asJson) {
  const gatherChecks = (t, out = []) => {
    for (const c of t.checks || []) out.push(c)
    for (const child of t.tests || []) gatherChecks(child, out)
    return out
  }
  const rows = []
  for (const { phase, main } of phaseResults) {
    for (const t of main.tests) {
      const m = t.name.match(/^(\d+\.\d+)\.eval\.js$/)
      // `fails[]` só nos vermelhos NÃO cacheados (o cache não guarda os `checks[]` — carrega
      // só o `failCount`). É o detalhe que o consumidor de máquina pode querer sem inflar a
      // linha do verde nem o relatório humano.
      const fails = t.state === 'passed' || t._cached ? []
        : gatherChecks(t).filter(c => c.state !== 'passed').map(failInfo)
      rows.push({
        phase,
        file: t.address || t.name,
        feature: m ? m[1] : null,
        state: t.state,                                  // 'passed' | 'failed' | 'exception'
        cached: !!t._cached,
        tests: t.testCount ?? summary(t).tests,
        checks: t.checkCount ?? summary(t).passed,
        failCount: t.failCount ?? (summary(t).failed + summary(t).exception),
        fails,
        ms: Math.round(t.duration || 0),
      })
    }
  }
  process.stdout.write(JSON.stringify(rows) + '\n')
  realProcessExit(rows.some(r => r.state !== 'passed') ? 1 : 0)
}

const rule = `\x1b[90m${'─'.repeat(width)}\x1b[39m`
const rendered = phaseResults.filter(r => r.main.tests.length > 0)

// coverage — só as fases que escaneiam a árvore de fontes (`scan()` devolve `uncovered`).
// Uma fase com PROVIDER (`eval`) não tem fonte a cobrir; não entra na conta.
// Uma fase SEM NENHUM teste não mede cobertura de nada: o `include` dela não casou um
// arquivo sequer, então cada fonte da árvore cai no `uncovered` dela e o denominador
// inteiro passa a ser a fase que não existe. É o que a `integration` vazia
// (`include: ['**/*.it.js']`, zero arquivos) fazia com o número do repo.
let srcCovered = 0, srcTotal = 0
const uncoveredAll = new Map()
for (const { phase, main, uncovered } of phaseResults) {
  if (!uncovered || !(main.tests || []).length) continue
  srcCovered += (main.tests || []).length
  srcTotal += (main.tests || []).length + uncovered.length
  for (const f of uncovered) uncoveredAll.set(f, phase)
}
const covLine = srcTotal ? `coverage: ${Math.round((srcCovered / srcTotal) * 100)}%` : 'coverage: —'

// O bloco tight (sem moldura) é para uma rodada REALMENTE limpa — verde E rápida. Um hog
// é digno de atenção do mesmo jeito que um vermelho: ganha a moldura e o bloco de detalhe
// (`fullView` → `compactFails`, que lista vermelho E hog). Assim `unit` com hogs e `eval`
// com vermelhos têm a MESMA forma — era essa a assimetria.
const anyHog = rendered.some(r =>
  (r.main.tests || []).some(t => (t.lastMs || Math.round(t.duration || 0)) > HOG_MS))
const anyRed = rendered.some(r => r.main.state !== 'passed')
const framed = anyRed || anyHog

// `--hogs` — modo de tempo, formato próprio, cego a falha.
if (hogs) {
  process.stdout.write(hogReport(phaseResults, { width, standalone: true }) + '\n')

// `-v:3` — a árvore por-teste já streamou durante a fase; aqui só a linha-resumo. Mas se
// NADA rodou de verdade (tudo cache), não houve stream nenhum: cair na linha-resumo seca
// deixaria o `-v:3` mais pobre que o `-v:1`. Nesse caso mostra a visão por ARQUIVO, que o
// registro sustenta sem re-executar.
} else if (verbosity >= 3 && !rendered.some(r => (r.main.tests || []).some(t => !t._cached))) {
  for (const { phase, main } of rendered) {
    const report = fullView(main, { verbosity: 2, width, title: phase, nameTerms: filterTerms })
    if (!report) continue
    const [head, ...rest] = report.split('\n')
    process.stdout.write(head + '\n')
    for (const l of rest) process.stdout.write((l ? '  ' + l : l) + '\n')
  }
  process.stdout.write(`\x1b[1m${covLine}\x1b[22m\n`)

} else if (verbosity >= 3) {
  for (const { phase, main } of rendered) {
    const s = summary(main)
    const left = [`${phase}:`, `${glyphs.passed} ${s.total}`,
      s.failed ? `${glyphs.failed} ${s.failed}` : '',
      s.exception ? `${glyphs.exception} ${s.exception}` : ''].filter(Boolean).join('  ')
    const right = `\x1b[90m(${Math.round(phaseMs(main) / 1000)}s)\x1b[39m`
    const gap = Math.max(1, width - displayLen(left) - displayLen(right))
    process.stdout.write(`${left}${' '.repeat(gap)}${right}\n`)
  }

// RODADA LIMPA (verde E sem hog) → bloco tight, sem frame: `utest results` / `NOME (Σs)
// 📄 🧪 ✔` por fase / `coverage: N%`. O `(Σs)` é a soma do tempo da última execução dos
// arquivos da fase (`phaseMs`), em SEGUNDOS — o mesmo número quente ou frio. Sem hog aqui
// (por definição desta forma), então o parên é só `(Ns)`.
// O bloco tight é a forma do `-v:1`. Pedir `-v:2` numa rodada limpa é pedir a visão POR
// ARQUIVO — sem isto, v1/v2/v3 imprimiam as MESMAS três linhas sempre que a suíte estava
// verde, e a flag parecia morta.
} else if (!framed && verbosity < 2) {
  process.stdout.write('\x1b[1mutest results\x1b[22m\n')
  const rows = rendered.map(({ phase, main }) => {
    const s = summary(main)
    return {
      name: phase.toUpperCase(),
      paren: `(${Math.round(phaseMs(main) / 1000)}s)`,
      counts: `📄${(main.tests || []).length} 🧪${s.tests} ${glyphs.passed}${s.passed}`,
    }
  })
  const nameW  = Math.max(...rows.map(r => r.name.length))
  const parenW = Math.max(...rows.map(r => stripAnsi(r.paren).length))
  for (const r of rows) {
    const paren = ' '.repeat(parenW - stripAnsi(r.paren).length) + `\x1b[90m${r.paren}\x1b[39m`
    process.stdout.write(`\x1b[1m${r.name.padEnd(nameW)}\x1b[22m ${paren} ${r.counts}\n`)
  }
  process.stdout.write(`\x1b[1m${covLine}\x1b[22m\n`)

// HÁ VERMELHO OU HOG → relatório emoldurado: frame, linha-título por fase (saída indentada
// 2), o `tip:` entre réguas, a linha `coverage`. Lê SEMPRE do mesmo registro — quente == frio.
} else {
  process.stdout.write(`${rule}\n\x1b[1mutest results\x1b[22m\n${rule}\n`)
  const msOf = t => t.lastMs || Math.round(t.duration || 0)
  const hasOut = (t) => (t.output || []).length > 0 || (t.tests || []).some(hasOut)
  // O `tip:` aponta para o MESMO arquivo que encabeça o bloco de detalhe — o vermelho mais
  // LENTO (a ordem que `compactFails` usa). Sem vermelho (rodada hog-only), o hog mais lento.
  // O texto depende de ONDE estamos: largo (`-v:1`) → "rode este arquivo" (aí re-executa em
  // `-v:3`); estreito num front (`-v:2`) com output engolido → "-v:3 to see full output";
  // arquivo só (`-v:3`) → sem tip, já está tudo na tela.
  const ref = (t) => ({ name: t.name, path: t.address ? path.resolve(root, t.address) : null, ms: msOf(t), hasOutput: hasOut(t) })
  let slowestRed = null, slowestHog = null
  for (const { main } of rendered) {
    for (const t of main.tests) {
      if (t.state !== 'passed' && (!slowestRed || msOf(t) > slowestRed.ms))
        slowestRed = ref(t)
      if (t.state === 'passed' && msOf(t) > HOG_MS && (!slowestHog || msOf(t) > slowestHog.ms))
        slowestHog = ref(t)
    }
  }
  for (const { phase, main } of rendered) {
    // A linha-título da fase vai à largura CHEIA do terminal (dotfill até a borda, zero
    // espaço sobrando); só o que vem ABAIXO dela é que indenta 2.
    const report = fullView(main, { verbosity, width, title: phase, nameTerms: filterTerms })
    if (!report) continue
    const [head, ...rest] = report.split('\n')
    process.stdout.write(head + '\n')
    for (const l of rest) process.stdout.write((l ? '  ' + l : l.slice(0, width - 2)) + '\n')
  }
  // `-v:3` estreito já mostra tudo — nenhum tip. `-v:2` estreito: tip só se um vermelho tem
  // `log()` engolido. `-v:1` largo: sempre, apontando para o arquivo (que re-executa fundo).
  const pointer = slowestRed || slowestHog
  const tipCmd = pointer
    ? (verbosity >= 2
        ? (slowestRed?.hasOutput ? { flag: ' -v:3', why: 'full output' } : null)
        : { flag: '', why: slowestRed ? 'failure details' : 'what is slow' })
    : null
  if (pointer && tipCmd) {
    // `utest <arquivo>` vira um OSC 8 hyperlink para o `file://` do teste — no terminal do
    // VS Code (e outros que suportam) é clicável e abre o arquivo; onde não suporta, some o
    // escape e fica só o texto.
    const cmd = `utest ${pointer.name}${tipCmd.flag}`
    const shown = pointer.path ? link('file://' + pointer.path, cmd) : cmd
    process.stdout.write(`${rule}\n\x1b[90m tip: run  \x1b[4m${shown}\x1b[24m  to see ${tipCmd.why}\x1b[39m\n`)
  }
  process.stdout.write(`${rule}\n`)
  // linha final: `coverage: N%` à esquerda, o bloco-direito da linha-título à direita —
  // `(Ns 🐢M)` = Σ do tempo da última execução de TODOS os arquivos + total de hogs, todas
  // as fases.
  const finalSum = { passed: 0, failed: 0, exception: 0, total: 0, tests: 0 }
  let totalFiles = 0, totalMs = 0, totalHogSecs = 0
  for (const { main } of phaseResults) {
    const s = summary(main)
    finalSum.passed += s.passed; finalSum.failed += s.failed
    finalSum.exception += s.exception; finalSum.total += s.total; finalSum.tests += s.tests
    totalFiles += (main.tests || []).length; totalMs += phaseMs(main)
    totalHogSecs += phaseHogSecs(main)
  }
  const counts = phaseLine(finalSum, { title: '', ms: totalMs, files: totalFiles, hogSecs: totalHogSecs, bare: true })
  const gap = Math.max(1, width - displayLen(covLine) - displayLen(counts))
  process.stdout.write(`\x1b[1m${covLine}\x1b[22m${' '.repeat(gap)}${counts}\n`)
}

// `--uncovered` responde QUAIS arquivos faltam — o número sozinho não diz onde agir.
if (showUnc) {
  const rows = [...uncoveredAll].map(([f, phase]) => ({ rel: path.relative(root, f), phase })).sort((a, b) => a.rel.localeCompare(b.rel))
  process.stdout.write(`\n\x1b[1muncovered\x1b[22m \x1b[90m— fonte sem um teste que a exercite (${rows.length})\x1b[39m\n`)
  for (const r of rows) process.stdout.write(`  ${r.rel} \x1b[90m${r.phase}\x1b[39m\n`)
  if (!rows.length) process.stdout.write('  \x1b[90mnenhum — toda fonte tem teste pareado\x1b[39m\n')
}

// ─── `--trace` LARGO — onde foi a parede por FRENTE e por FEATURE ──────────────────────
// Escopo filtrado disseca UMA execução (regiões + `probe`); largo responde outra pergunta,
// "que parte da suíte custa", e a resposta já está no relatório — o `lastMs` por arquivo,
// do storage. Agregar não instrumenta nada: não re-roda, não fura o cache, e por isso é o
// único trace que um escopo largo pode pagar.
if (trace && !doTrace && !asJson && !hogs) {
  const feature = name => name.match(/^(\d+\.\d+)/)?.[1] ?? null
  const fronts = new Map()
  let grandMs = 0
  for (const { main } of rendered) {
    for (const t of (main.tests || [])) {
      const ms = t.lastMs || Math.round(t.duration || 0)
      grandMs += ms
      const dir = path.dirname(t.address)
      const front = dir === '.' ? '(raiz)' : dir.split('/').slice(0, 2).join('/')
      const feat = feature(t.name) ?? '(sem feature)'
      const f = fronts.get(front) ?? { ms: 0, feats: new Map() }
      f.ms += ms
      f.feats.set(feat, (f.feats.get(feat) ?? 0) + ms)
      fronts.set(front, f)
    }
  }
  const share = ms => grandMs ? ms / grandMs : 0
  const pct = ms => `${String(Math.round(share(ms) * 100)).padStart(3)}%`
  const secs = ms => `${String((ms / 1000).toFixed(1)).padStart(6)}s`
  // Só o que é acionável: uma frente abaixo de 1% da parede não é onde o tempo mora, e
  // listar as 40 leva de volta à saída verbosa que este modo veio substituir. O resto vai
  // numa linha de resto, para a soma continuar fechando em 100%.
  const ranked = [...fronts].sort((a, b) => b[1].ms - a[1].ms)
  // Uma frente só (um repo plano, como o próprio `utest/`) não é agregação — é a linha do
  // total escrita de outro jeito. Ali quem responde "onde foi o tempo" é o `-v:2`, que
  // lista arquivo por arquivo.
  if (ranked.length < 2) {
    process.stderr.write('\x1b[33m--trace largo: uma frente só — a leitura por arquivo é o `-v:2`\x1b[39m\n')
  } else {
  const shown = ranked.filter(([, f]) => share(f.ms) >= 0.01)
  const restMs = ranked.slice(shown.length).reduce((a, [, f]) => a + f.ms, 0)
  process.stdout.write(`\n${rule}\n\x1b[1mtrace\x1b[22m — para onde foi a parede, por frente e feature\n${rule}\n`)
  for (const [front, f] of shown) {
    process.stdout.write(`\x1b[1m${front.padEnd(38)}\x1b[22m \x1b[90m${secs(f.ms)} ${pct(f.ms)}\x1b[39m\n`)
    // Uma feature só, de mesmo tempo, é a linha da frente repetida — nada a decompor.
    const feats = [...f.feats].sort((a, b) => b[1] - a[1]).filter(([, ms]) => share(ms) >= 0.01)
    if (feats.length < 2) continue
    for (const [feat, ms] of feats.slice(0, 6))
      process.stdout.write(`  ${feat.padEnd(36)} \x1b[90m${secs(ms)} ${pct(ms)}\x1b[39m\n`)
  }
  if (restMs)
    process.stdout.write(`\x1b[90m${`(+${ranked.length - shown.length} frentes <1%)`.padEnd(38)} ${secs(restMs)} ${pct(restMs)}\x1b[39m\n`)
  process.stdout.write(`${rule}\n\x1b[90m um hog por dentro: \x1b[4mutest <feature|arquivo> --trace\x1b[24m — regiões + grafo de função\x1b[39m\n${rule}\n`)
  }
}

// ─── Apêndice de trace (`--trace`) — a árvore de PARA-ONDE-FOI-A-PAREDE, DEPOIS do
// relatório normal. Regiões de wall-time (pai) + a sub-árvore `probe.tree()` de cada
// arquivo de motor.
if (T) {
  // Só vale o apêndice se ALGUM arquivo de fato rodou — um termo que não casou nada
  // deixa a árvore com só `boot`/`provider` e nada a dizer.
  const ranSomething = rendered.some(r => (r.main.tests || []).some(t => !t._cached))
  if (ranSomething) {
    process.stdout.write(`\n${rule}\n\x1b[1mtrace\x1b[22m — para onde foi a parede\n${rule}\n`)
    T.tree({ width })
    for (const { main } of rendered)
      for (const t of (main.tests || []))
        if (t._probeTree) {
          process.stdout.write(`\n\x1b[1m${t.name}\x1b[22m \x1b[90m— grafo de função (probe)\x1b[39m\n`)
          process.stdout.write(t._probeTree)
        }
    // A árvore acima é até AQUI; o `time` de parede ainda soma ~Ns de teardown do `bun`.
    // `finalize` fecha um span `(runtime teardown)` no `process.on('exit')` e, com um path,
    // grava o `trace.json` já com ele — o total do arquivo bate com o `time`.
    const p = traceOut ? path.resolve(traceOut) : null
    T.finalize(p)
    if (p)
      process.stdout.write(`${rule}\n\x1b[90m trace.json → \x1b[4m${link('file://' + p, p)}\x1b[24m  (chrome://tracing · perfetto.dev) — inclui o teardown\x1b[39m\n`)
    process.stdout.write(`${rule}\n`)
  } else {
    process.stderr.write('\x1b[33m--trace: nenhum arquivo casou o escopo — nada a traçar\x1b[39m\n')
  }
}

// exit code — independente do formato acima
const grand = phaseResults.reduce((a, { main }) => {
  const s = summary(main); a.failed += s.failed; a.exception += s.exception; return a
}, { failed: 0, exception: 0 })

if (!watch) {
  process.exitCode = grand.failed > 0 || grand.exception > 0 ? 1 : 0
}

// ─── Watch mode ───────────────────────────────────────────────────────────────
if (watch) {
  globalThis.utestAllowDestructiveOutput = true
  // O filho carrega sempre as FLAGS e a FASE (`utest eval --watch` segue escopando `eval`).
  // Só o positional de ESCOPO (a pasta/termo) é substituível — quando um teste único muda,
  // ELE vira o alvo; se a pasta continuasse na linha, virariam dois positionais e o
  // `fs.existsSync` da pasta ganharia, varrendo tudo.
  const baseArgs  = args.filter(a => (a.startsWith('-') && a !== '--watch' && a !== '-w') || a === phaseArg)
  const scopeArgs = args.filter(a => !a.startsWith('-') && a !== phaseArg)
  let debounce = null
  let child = null
  let lastChildExit = 0  // epoch ms when the last child process finished

  const watchLine = () =>
    process.stdout.write(`\x1b[90mWatching ${root} — press Ctrl+C to stop\x1b[39m\n`)

  let changed = new Set()   // arquivos tocados desde a última rodada
  const isTestFile = f => /\.(t|test|eval|it|integration|rendering)\.(js|ts)$|\.tuit$/.test(f)

  const rerun = () => {
    clearTimeout(debounce)
    debounce = null
    if (child) { try { child.kill() } catch { } }
    process.stdout.write('\x1b[2J\x1b[H') // clear screen

    // **Delta, não varredura.** Se TODO arquivo tocado é um teste, roda só esses — o caminho
    // `_isFile` não escaneia. Se algum é FONTE (um `.js` que testes importam), aí sim o run
    // cacheado completo: o scan anda a árvore mas o cache de tempo pula quem não mudou (só o
    // custo do walk, ~1s), e o dep-graph re-roda os testes que dependem da fonte. `--force`
    // largo continua PROIBIDO aqui (docs/CRASH-LOG.md).
    const touched = [...changed]
    changed = new Set()
    // Um único teste tocado → roda só ele (`_isFile`, sem scan), substituindo o escopo
    // original. Vários, ou uma fonte no meio → mantém o escopo original, run cacheado
    // completo (o scan anda a árvore mas o cache pula quem não mudou).
    const scoped = (touched.length === 1 && isTestFile(touched[0]))
      ? [path.resolve(root, touched[0])]
      : scopeArgs

    child = Bun.spawn(['bun', import.meta.path, ...baseArgs, ...scoped, '--no-stream'], {
      stdout: 'inherit', stderr: 'inherit',
    })
    child.exited.then(() => {
      lastChildExit = Date.now()
      watchLine()
    })
  }

  fs.watch(root, { recursive: true }, (_, filename) => {
    if (!filename) return
    // Skip for 1.5 s after a run ends — cache writes (utimesSync) trigger this too
    if (Date.now() - lastChildExit < 1500) return
    if (!/\.(js|ts|yaml|json|md)$/.test(filename)) return
    if (/node_modules|\.utest[/\\]/.test(filename)) return
    changed.add(filename)
    clearTimeout(debounce)
    debounce = setTimeout(rerun, 80)
  })

  watchLine()
  await new Promise(() => { })
}
