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
import { scan } from './scanner.js'
import { TestCache } from './cache.js'
import { view, fullView, summary, glyphs, checkView, hogReport, failInfo, phaseLine, phaseMs, progressBar, link, HOG_MS } from './viewer.js'
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
import { loaderFilter, kindOf, executorFor, entriesFor } from './kinds.js'
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
      new Promise((_, r) => setTimeout(() => r(new Error(`Timeout (${eff}ms)`)), eff))
    ])

    if (t.state === 'running')
      t.state = (t.checks.some(c => c.state !== 'passed') || t.tests.some(c => ['failed', 'exception'].includes(c.state)))
        ? 'failed' : 'passed'
  } catch (e) {
    t.state = 'exception'; t.error = e
  } finally {
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
const filterTerms = positional.filter(a => a !== phaseArg && !fs.existsSync(a))
const rawTarget = positional.find(a => fs.existsSync(a))

const _isFile = rawTarget && fs.statSync(rawTarget).isFile()
const targetDir = _isFile ? path.dirname(rawTarget) : rawTarget
const root = path.resolve(targetDir || '.')
const configPath = [root, process.cwd()].map(d => path.resolve(d, 'TEST.yaml')).find(p => fs.existsSync(p))
  || path.resolve(process.cwd(), 'TEST.yaml')

// `-v:3` é "a saída completa de uma execução" — o mesmo que `--force`. Um `-v:3` sobre o
// cache não executa nada e não mostra nada, o que deixa o modo de investigação sem uso.
// Ligar `force` junto — MAS só quando o escopo é DE VERDADE estreito: um path que não é a
// raiz do projeto, ou termos de filtro. `.`/a raiz e uma fase inteira (`eval`) NÃO contam —
// `-v:3` ali é o `--force` largo que o `docs/CRASH-LOG.md` tirou do procedimento (o pico de
// spawn da fase `eval`/`int` dispara o `systemd-oomd` e mata o editor junto).
const _rootIsProject = path.resolve(rawTarget || '.') === path.dirname(configPath)
const narrowScope = (!!rawTarget && !_rootIsProject) || filterTerms.length > 0
if (verbosity >= 3 && !force && !watch) {
  if (narrowScope) force = true
  else process.stderr.write('\x1b[33m-v:3 em escopo largo (raiz ou fase inteira) não fura o cache — rode filtrado: um path de arquivo/subdir, ou um termo\x1b[39m\n')
}
const width = parseInt(process.env.WIDTH || '') || process.stdout.columns || 80
const startAll = process.hrtime.bigint()

// ─── Project boot ─────────────────────────────────────────────────────────────
// Opt-in via TEST.yaml `boot: <path>` (resolved relative to the config file).
// A target project may need its own globals registered (e.g. soml's `bootstrap()`)
// before any test file imports — this runs once, ahead of the scan.
if (fs.existsSync(configPath)) {
  const cfg = parseYaml(fs.readFileSync(configPath, 'utf8')) || {}
  if (cfg.boot) await import(path.resolve(path.dirname(configPath), cfg.boot))
}

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
// interativo, fora do `-v:3` (que já faz streaming por-teste), do `--json` e do `--hogs`.
const streamPhase = process.stdout.isTTY && verbosity < 3 && !asJson && !hogs && !watch

// ─── Roda UMA fase: scan (ou provider) → executa cada entry → devolve o nó da fase ────────
async function runPhase(phase) {
  let entries = [], uncovered = [], cache = null
  const provider = entriesFor(phase)
  try {
    if (provider) {
      // Sem alvo pareado (`.eval.js` não tem `.js` irmão): `TestCache` cai em `readSelf`
      // (sidecar em `.bot/.utest/`), o mesmo caminho que um `.t.js` sem alvo já usa — cache
      // de graça, nenhuma segunda implementação. Raiz do PROJETO (não `root`, que um alvo
      // de arquivo estreita pro diretório dele) — as entries de uma fase com provider não
      // são scoped por `root`, então o cache não pode ser, ou um `_isFile` numa árvore vira
      // sidecar espalhado pelo repo inteiro.
      cache = TestCache(path.dirname(configPath))
      let provided = await provider()
      // `scan()` já restringe por `root` andando o diretório; um provider (`eval`: as
      // entries vêm de `loadFronts()`, não de um walk) não ganha isso de graça — sem
      // filtrar aqui, `bun utest/utest.js plans/1-motor` varria o CORPUS INTEIRO, não só
      // a frente pedida. Mesma regra: só entries cujo caminho more sob `root`.
      if (rawTarget) {
        const rootPrefix = root.endsWith(path.sep) ? root : root + path.sep
        provided = provided.filter(e => e.path === root || e.path.startsWith(rootPrefix))
      }
      entries = provided.map(e => ({
        ...e, target: e.target ?? null, extraDeps: e.extraDeps ?? [],
        cache: cache.read(e.path, e.target ?? null, { extraDeps: e.extraDeps ?? [] }),
      }))
    } else {
      ; ({ entries, uncovered, cache } = scan(root, configPath, phase))
    }
  } catch (e) {
    if (e.code !== 'ENOENT') { console.error('[utest2] scan error:', e.message); realProcessExit(1) }
  }
  const seen = new Set()
  entries = entries.filter(e => !seen.has(e.path) && seen.add(e.path))
  if (_isFile) {
    const absFile = path.resolve(rawTarget)
    entries = entries.filter(e => e.path === absFile)
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
    })
    // Verificação de 2º nível: o cache de tempo disse HIT; o histórico concorda que nada
    // mudou? Discordar é sinal de furo na regra do cache — reporta, não corrige (o cache
    // de tempo continua sendo a autoridade sobre re-rodar).
    if (rec && cache?.results && !cache.results.fresh(phase, entry.path, entry.extraDeps ?? [])) {
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
      const steps = await executor(entry, { kind: kindOf(path.basename(entry.path)) })
      for (const step of steps) test(step.name, step.fn, step.op)
    } else if (!loadErr) {
      await import(entry.path)
    }
  } catch (e) { loadErr = e } finally {
    test.end()
  }

  if (loadErr) {
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
    })
  }

  cache?.results?.flush()   // um write por fase, não por arquivo

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
let srcCovered = 0, srcTotal = 0
for (const { main, uncovered } of phaseResults) {
  if (!uncovered) continue
  srcCovered += (main.tests || []).length
  srcTotal += (main.tests || []).length + uncovered.length
}
const covLine = srcTotal ? `coverage: ${Math.round((srcCovered / srcTotal) * 100)}%` : 'coverage: —'

const anyRed = rendered.some(r => r.main.state !== 'passed')

// `--hogs` — modo de tempo, formato próprio, cego a falha.
if (hogs) {
  process.stdout.write(hogReport(phaseResults, { width, standalone: true }) + '\n')

// `-v:3` — a árvore por-teste já streamou durante a fase; aqui só a linha-resumo.
} else if (verbosity >= 3) {
  for (const { phase, main } of rendered) {
    const s = summary(main)
    const left = [`${phase}:`, `${glyphs.passed} ${s.total}`,
      s.failed ? `${glyphs.failed} ${s.failed}` : '',
      s.exception ? `${glyphs.exception} ${s.exception}` : ''].filter(Boolean).join('  ')
    const right = `\x1b[90m(${phaseMs(main)}ms)\x1b[39m`
    const gap = Math.max(1, width - stripAnsi(left).length - stripAnsi(right).length)
    process.stdout.write(`${left}${' '.repeat(gap)}${right}\n`)
  }

// TUDO VERDE → bloco tight, sem frame: `utest results` / `NOME (Σms) 📄 🧪 ✔` por fase /
// `coverage: N%`. O `(Σms)` é a soma do tempo da última execução dos arquivos da fase
// (`phaseMs`) — o mesmo número quente ou frio. `(🐢 n Σms)` se a fase tem hog.
} else if (!anyRed) {
  process.stdout.write('\x1b[1mutest results\x1b[22m\n')
  const rows = rendered.map(({ phase, main }) => {
    const s = summary(main)
    const hogN = (main.tests || []).filter(t => (t.lastMs || Math.round(t.duration || 0)) > HOG_MS).length
    return {
      name: phase.toUpperCase(),
      paren: `(${hogN ? `${glyphs.hog} ${hogN} ` : ''}${phaseMs(main)}ms)`,
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

// HÁ VERMELHO → relatório emoldurado: frame, linha-título por fase (saída indentada 2), o
// `tip:` entre réguas, a linha `coverage`. Lê SEMPRE do mesmo registro — quente == frio.
} else {
  process.stdout.write(`${rule}\n\x1b[1mutest results\x1b[22m\n${rule}\n`)
  let firstRed = null
  for (const { phase, main } of rendered) {
    if (!firstRed) {
      const t = main.tests.find(t => t.state !== 'passed')
      if (t) firstRed = { name: t.name, path: t.address ? path.resolve(root, t.address) : null }
    }
    // A linha-título da fase vai à largura CHEIA do terminal (dotfill até a borda, zero
    // espaço sobrando); só o que vem ABAIXO dela é que indenta 2.
    const report = fullView(main, { verbosity, width, title: phase, nameTerms: filterTerms })
    if (!report) continue
    const [head, ...rest] = report.split('\n')
    process.stdout.write(head + '\n')
    for (const l of rest) process.stdout.write((l ? '  ' + l : l.slice(0, width - 2)) + '\n')
  }
  if (firstRed) {
    // `utest <arquivo>` vira um OSC 8 hyperlink para o `file://` do teste — no terminal do
    // VS Code (e outros que suportam) é clicável e abre o arquivo; onde não suporta, some o
    // escape e fica só o texto.
    const cmd = `utest ${firstRed.name}`
    const shown = firstRed.path ? link('file://' + firstRed.path, cmd) : cmd
    process.stdout.write(`${rule}\n\x1b[90m tip: run  \x1b[4m${shown}\x1b[24m  to see failure details\x1b[39m\n`)
  }
  process.stdout.write(`${rule}\n`)
  // linha final: `coverage: N%` à esquerda, o bloco-direito da linha-título à direita —
  // `ms` = Σ do tempo da última execução de TODOS os arquivos, todas as fases.
  const finalSum = { passed: 0, failed: 0, exception: 0, total: 0, tests: 0 }
  let totalFiles = 0, totalMs = 0
  for (const { main } of phaseResults) {
    const s = summary(main)
    finalSum.passed += s.passed; finalSum.failed += s.failed
    finalSum.exception += s.exception; finalSum.total += s.total; finalSum.tests += s.tests
    totalFiles += (main.tests || []).length; totalMs += phaseMs(main)
  }
  const counts = phaseLine(finalSum, { title: '', ms: totalMs, files: totalFiles, bare: true })
  const gap = Math.max(1, width - stripAnsi(covLine).length - stripAnsi(counts).length)
  process.stdout.write(`\x1b[1m${covLine}\x1b[22m${' '.repeat(gap)}${counts}\n`)
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
  const runArgs = args.filter(a => a !== '--watch' && a !== '-w')
  let debounce = null
  let child = null
  let lastChildExit = 0  // epoch ms when the last child process finished

  const watchLine = () =>
    process.stdout.write(`\x1b[90mWatching ${root} — press Ctrl+C to stop\x1b[39m\n`)

  const rerun = () => {
    clearTimeout(debounce)
    debounce = null
    if (child) { try { child.kill() } catch { } }
    process.stdout.write('\x1b[2J\x1b[H') // clear screen
    child = Bun.spawn(['bun', import.meta.path, ...runArgs, '--force'], {
      stdout: 'inherit', stderr: 'inherit',
    })
    // Reprint the watch line after the child finishes, and record exit time so
    // we can ignore the cache-write mtime events that follow immediately.
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
    if (/node_modules|\.bot[/\\]/.test(filename)) return
    clearTimeout(debounce)
    debounce = setTimeout(rerun, 80)
  })

  watchLine()
  await new Promise(() => { })
}
