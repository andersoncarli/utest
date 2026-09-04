// trace.js — para onde foi a PAREDE.
//
// `probe.js` responde "que FUNÇÃO custou" — grafo caller▸callee, self-time por chamada.
// Este responde "que REGIÃO de tempo custou" — a fase de boot, o entry, o Bun.spawnSync
// do check, e o tempo que sobrou fora de toda região marcada (o `(untracked)`, sempre
// explícito). `utest --trace` liga uma OU outra conforme a fase — `probe.tree()` para um
// hog de motor in-process, esta árvore de regiões para um hog de `.eval.js` cujo custo
// mora num subprocesso.
//
// UM MODELO, DUAS SAÍDAS. Toda medição é um EVENTO `{ name, cat, ts, dur, depth }` (ms,
// relativo ao `install()`) num log plano. A árvore textual e o `trace.json` (Chrome
// Trace Event, carregável em chrome://tracing e Perfetto) são AMBOS derivados desse log
// — não há uma segunda contabilidade. A conta fecha: o `(untracked)` de cada nó é
// `total − Σ filhas`, explícito, então Σ de tudo === o relógio de parede real.
//
// Uma REGIÃO é `region(nome, fn)` ou o par `mark()`/`end()`. Aninham (via `depth`).
// Para o subprocesso (`sh()` do `apps/eval/engine.js` roda `bash -lc '… bun … '`), o
// `.eval.js` splica `bun --import trace-preload.mjs`; o preload marca regiões DENTRO do
// filho e despeja `<prefix>.<pid>` JSON, que `graftFragments()` costura no log com o
// `ts` deslocado para dentro da região `sh:`.

import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname, basename } from 'path'

const gray = s => `\x1b[90m${s}\x1b[39m`
const clock = () => performance.now()

let t0 = 0
let leadMs = 0             // tempo ANTES do install() — bun startup + os imports do utest
let events = []            // { name, cat, ts, dur, depth }  — ts/dur em ms desde (t0 - leadMs)
const openStack = []       // { name, cat, startTs, depth }

// `lead` (ms) = quanto já passou desde o boot do processo quando `install()` roda. Em Bun,
// `performance.now()` no momento do install É esse número — o chamador passa `performance.now()`
// e a árvore ganha um span inicial `(bun + imports startup)`, para o total bater com o `time`.
export function install(label = '(run)', lead = 0) {
  leadMs = Math.max(0, lead)
  t0 = clock()
  events = []
  openStack.length = 0
  events.push({ name: label, cat: 'run', ts: 0, dur: 0, depth: 0, _root: true })
  if (leadMs > 1)
    events.push({ name: '(bun + imports startup)', cat: 'startup', ts: 0, dur: leadMs, depth: 1 })
}

const nowMs = () => leadMs + (clock() - t0)

export function mark(name, cat = 'region') {
  const depth = openStack.length + 1
  const frame = { name, cat, startTs: nowMs(), depth }
  openStack.push(frame)
  return frame
}

export function end(frame = openStack[openStack.length - 1]) {
  if (!frame || frame !== openStack[openStack.length - 1]) return   // desbalanceado — ignora
  openStack.pop()
  events.push({ name: frame.name, cat: frame.cat, ts: frame.startTs, dur: nowMs() - frame.startTs, depth: frame.depth })
}

// Forma escopada, síncrona ou async. `op.fragPrefix` → depois de `fn()`, costura os
// fragmentos `<prefix>.*` que um preload de subprocesso escreveu, deslocados para dentro
// desta região.
export function region(name, fn, op = {}) {
  const frame = mark(name, op.cat || 'region')
  const settle = () => {
    end(frame)
    if (op.fragPrefix) graftFragments(name, frame.startTs, op.fragPrefix)
  }
  try {
    const r = fn()
    if (r instanceof Promise) return r.finally(settle)
    settle()
    return r
  } catch (e) { settle(); throw e }
}

// Envolve Bun.spawnSync / Bun.spawn — cada chamada vira uma região `sh:<cmd>`. CEDE quando
// já está dentro de uma região `sh:` aberta (ex.: `engine.js#sh()`, feature 5.3, que já
// embrulha o próprio `Bun.spawnSync` com `fragPrefix` para enxertar o trace do subprocesso
// filho) — sem o guard, o patch global duplicava essa região por dentro, sem `fragPrefix`,
// só ruído na árvore.
export function wrapSpawns() {
  const label = (opts) => {
    const cmd = Array.isArray(opts) ? opts : opts?.cmd || []
    const flat = cmd.join(' ')
    return 'sh:' + (flat.length > 48 ? flat.slice(0, 45) + '…' : flat)
  }
  const insideShRegion = () => {
    const top = openStack[openStack.length - 1]
    return !!top && top.name.startsWith('sh:')
  }
  const rsync = Bun.spawnSync, rasync = Bun.spawn
  Bun.spawnSync = (...a) => insideShRegion() ? rsync(...a) : region(label(a[0]), () => rsync(...a))
  Bun.spawn = (...a) => {
    if (insideShRegion()) return rasync(...a)
    const frame = mark(label(a[0]))
    const p = rasync(...a)
    p.exited.finally(() => end(frame))
    return p
  }
  return () => { Bun.spawnSync = rsync; Bun.spawn = rasync }
}

// Um prefixo de fragmento único, sob o tmpdir do SO.
export function fragPrefix() {
  return join(tmpdir(), `utrace-${process.pid}-${Math.random().toString(36).slice(2, 9)}`)
}

// O env que liga o preload do subprocesso.
export function childEnv(prefix) {
  return {
    UTEST_TRACE_OUT: prefix,
    UTEST_TRACE_PRELOAD: join(dirname(new URL(import.meta.url).pathname), 'trace-preload.mjs'),
  }
}

// Lê `<prefix>.*` e injeta os `events[]` do filho como filhos da região `sh:` que
// começou em `parentStartTs`, com a profundidade e o `ts` deslocados. O tempo do filho
// que não coube em nenhuma região dele fica implícito — o render calcula o `(untracked)`.
function graftFragments(parentName, parentStartTs, prefix) {
  const dir = dirname(prefix)
  const base = basename(prefix)
  let files
  try { files = readdirSync(dir).filter(f => f.startsWith(base + '.')) } catch { return }
  // a profundidade da região `sh:` no momento em que fechou = onde os filhos entram
  const shDepth = events.find(e => e.name === parentName && e.ts === parentStartTs)?.depth ?? 1
  for (const f of files) {
    let frag
    try { frag = JSON.parse(readFileSync(join(dir, f), 'utf8')) } catch { continue }
    for (const ev of frag.events || []) {
      events.push({
        name: (ev.kind === 'import' ? 'import ' : '') + ev.name,
        cat: ev.kind === 'import' ? 'import' : 'child',
        ts: parentStartTs + (ev.startMs ?? 0),
        dur: Math.max(0, (ev.endMs ?? ev.startMs ?? 0) - (ev.startMs ?? 0)),
        depth: shDepth + 1,
      })
    }
  }
}

export const collectFragments = (name, startTs, prefix) => graftFragments(name, startTs, prefix)

// ─── Modelo → árvore ──────────────────────────────────────────────────────────
// Reconstrói o aninhamento a partir de (ts, dur, depth): um evento é filho do último
// evento de `depth-1` que o contém no tempo.
function buildTree() {
  const grand = nowMs()
  const root = events.find(e => e._root)
  const rootNode = { name: root?.name || '(run)', ts: 0, dur: grand, depth: 0, children: [] }
  const ordered = events.filter(e => !e._root).sort((a, b) => a.ts - b.ts || a.depth - b.depth)
  const containers = [rootNode]   // pilha por profundidade
  for (const e of ordered) {
    const node = { ...e, children: [] }
    while (containers.length > e.depth) containers.pop()
    let parent = containers[containers.length - 1]
    // se o pai não contém no tempo (fragmento desalinhado), sobe até achar um que contenha
    while (parent !== rootNode && (e.ts < parent.ts - 1 || e.ts + e.dur > parent.ts + parent.dur + 1))
      { containers.pop(); parent = containers[containers.length - 1] }
    parent.children.push(node)
    containers.push(node)
  }
  return { rootNode, grand }
}

// A árvore, com os tempos ALINHADOS À DIREITA numa coluna, e o `(untracked)` de cada nó
// explícito. `Σ` de tudo === `grand` (o relógio real).
export function tree({ width = 80, write = s => process.stdout.write(s), minPct = 1 } = {}) {
  if (!events.length) { write('trace: install() não foi chamado\n'); return }
  const { rootNode, grand } = buildTree()
  const g = grand || 1

  // primeira passada: coleta as linhas (label indentado, ms, pct) para alinhar
  const rows = []
  const visit = (node, depth) => {
    const kids = node.children.slice().sort((a, b) => b.dur - a.dur)
    const shown = kids.filter(k => (k.dur / g) * 100 >= minPct)
    const childSum = node.children.reduce((s, k) => s + k.dur, 0)
    const untracked = Math.max(0, node.dur - childSum)
    rows.push({ label: '  '.repeat(depth) + node.name, ms: node.dur, pct: (node.dur / g) * 100, depth })
    for (const k of shown) visit(k, depth + 1)
    if (node.children.length && (untracked / g) * 100 >= minPct)
      rows.push({ label: '  '.repeat(depth + 1) + '(untracked)', ms: untracked, pct: (untracked / g) * 100, depth: depth + 1, dim: true })
  }
  visit(rootNode, 0)

  const msW = Math.max(...rows.map(r => `${r.ms.toFixed(0)}ms`.length))
  const labelW = Math.min(width - msW - 10, Math.max(...rows.map(r => r.label.length)))
  for (const r of rows) {
    const label = r.label.length > labelW ? r.label.slice(0, labelW - 1) + '…' : r.label.padEnd(labelW)
    const ms = `${r.ms.toFixed(0)}ms`.padStart(msW)
    const pct = `${r.pct.toFixed(0)}%`.padStart(4)
    write(`${r.dim ? gray(label) : label}  ${gray(`${ms}  ${pct}`)}\n`)
  }
}

// ─── Modelo → trace.json (Chrome Trace Event Format) ──────────────────────────
// `[{ name, cat, ph:'X', ts, dur, pid, tid, args }]` em MICROSSEGUNDOS. Abre em
// chrome://tracing e Perfetto. Uma `tid` por profundidade dá o efeito de faixas
// empilhadas; o evento raiz vira o span de topo.
export function chromeTrace() {
  const { rootNode, grand } = buildTree()
  const out = [
    { name: 'process_name', ph: 'M', pid: 1, tid: 0, args: { name: 'utest --trace' } },
    { name: rootNode.name, cat: 'run', ph: 'X', ts: 0, dur: Math.round(grand * 1000), pid: 1, tid: 0 },
  ]
  const walk = (node) => {
    for (const c of node.children) {
      out.push({
        name: c.name, cat: c.cat || 'region', ph: 'X',
        ts: Math.round(c.ts * 1000), dur: Math.round(c.dur * 1000),
        pid: 1, tid: c.depth,
      })
      walk(c)
    }
  }
  walk(rootNode)
  return out
}

export function writeChromeTrace(path) {
  writeFileSync(path, JSON.stringify(chromeTrace()))
  return path
}

// O `time` de parede inclui ~Ns de teardown do `bun` DEPOIS da última linha do script
// (finalizar um module-graph gigante, handles unref'd) — invisível a `performance.now()`
// inline, mas capturável de `process.on('exit')`. `finalize(path?)` fecha um span
// `(runtime teardown)` no exit e, se `path`, (re)grava o `trace.json` já com ele — então
// o total do arquivo bate com o `time`. Chamado UMA vez pelo `utest.js`.
export function finalize(path) {
  const renderTs = nowMs()
  process.on('exit', () => {
    const teardown = nowMs() - renderTs
    if (teardown > 1)
      events.push({ name: '(runtime teardown)', cat: 'teardown', ts: renderTs, dur: teardown, depth: 1 })
    if (path) { try { writeFileSync(path, JSON.stringify(chromeTrace())) } catch {} }
  })
}

// Números crus, para um `.t.js` afirmar sem parsear texto.
export function nodes() {
  const { rootNode } = buildTree()
  const out = []
  const walk = (n, depth) => {
    const childSum = n.children.reduce((s, k) => s + k.dur, 0)
    out.push({ name: n.name, depth, ms: n.dur, selfMs: Math.max(0, n.dur - childSum), children: n.children.length })
    for (const c of n.children) walk(c, depth + 1)
  }
  walk(rootNode, 0)
  return out
}

export function rawEvents() { return events.slice() }

export default {
  install, mark, end, region, wrapSpawns, fragPrefix, childEnv, collectFragments,
  tree, chromeTrace, writeChromeTrace, finalize, nodes, rawEvents,
}
