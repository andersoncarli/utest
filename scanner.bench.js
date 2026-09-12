// scanner.bench.js — compara as duas engines de arvore (readdirSync vs
// fswatch/iodb) nos mesmos pontos, para medir se uma otimizacao no iodb
// (ex: feature 1.6, flush-o-dirty-nao-o-store) reduz a distancia entre elas.
//
// `.bench.js` e um kind reconhecido por NON_TARGET_RE (scanner.js) — fora do
// denominador de cobertura, fora de `sprint test`. Roda sob demanda:
//
//   bun scanner.bench.js            # N padrao (300/600/1200) + este repo
//   bun scanner.bench.js --n=2000   # N customizado, alem dos padrao
//
// Nao integra a suite: e ferramenta de medicao/regressao, nao um teste.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { walk, makeFilter } from './scanner.js'
import { openFswatchSource } from './fswatchSource.js'

const filter = makeFilter(['**/*.t.js'], ['node_modules/**', '.git/**', '.fswatch/**'])

function makeFixture(n) {
  const dir = mkdtempSync(join(tmpdir(), 'utest-bench-'))
  for (let i = 0; i < n; i++) {
    const sub = join(dir, `d${i % 20}`)
    mkdirSync(sub, { recursive: true })
    writeFileSync(join(sub, `f${i}.t.js`), `export const x = ${i}\n`)
  }
  return dir
}

async function timeReaddir(root) {
  const t0 = performance.now()
  const r = walk(root, root, filter)
  return { ms: performance.now() - t0, entries: r.tests.length + r.sources.length }
}

async function timeFswatch(root) {
  rmSync(join(root, '.fswatch'), { recursive: true, force: true })
  const source = await openFswatchSource(root, { enabled: true })
  if (!source) return null

  const t0 = performance.now()
  const r = await source.walk(filter, ['node_modules/**', '.git/**', '.fswatch/**'])
  const total = performance.now() - t0
  if (!r) return null

  const t1 = performance.now()
  const r2 = await source.walk(filter, ['node_modules/**', '.git/**', '.fswatch/**'])
  const warmTotal = performance.now() - t1

  return {
    coldMs: total,
    warmMs: warmTotal,
    entries: r.tests.length + r.sources.length,
  }
}

async function runPoint(label, root, cleanup) {
  const rd = await timeReaddir(root)
  const fsw = await timeFswatch(root)

  const rdPerEntry = (rd.ms / Math.max(rd.entries, 1)).toFixed(4)
  const fswCold = fsw ? fsw.coldMs.toFixed(1) : 'n/a'
  const fswWarm = fsw ? fsw.warmMs.toFixed(1) : 'n/a'
  const fswPerEntry = fsw ? (fsw.coldMs / Math.max(fsw.entries, 1)).toFixed(4) : 'n/a'

  console.log(`| ${label} | ${rd.entries} | ${rd.ms.toFixed(1)} | ${rdPerEntry} | ${fswCold} | ${fswWarm} | ${fswPerEntry} |`)

  if (cleanup) rmSync(root, { recursive: true, force: true })
}

const args = process.argv.slice(2)
const customN = args.find(a => a.startsWith('--n='))
const Ns = [300, 600, 1200, ...(customN ? [Number(customN.split('=')[1])] : [])]

console.log('| ponto | entries | readdirSync total (ms) | readdirSync ms/entry | fswatch frio (ms) | fswatch quente (ms) | fswatch ms/entry |')
console.log('|---|---|---|---|---|---|---|')

for (const n of Ns) {
  const dir = makeFixture(n)
  await runPoint(`sintetico N=${n}`, dir, true)
}

await runPoint('utest (real)', process.cwd(), false)
