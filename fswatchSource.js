// ─── fswatch como fonte da arvore ──────────────────────────────
// `scanner.js#walk()` levanta a arvore do zero a cada `scan()`, via `readdirSync`
// recursivo, sem estado entre execucoes. O sibling `iodb/fswatch` mantem esse ultimo
// estado conhecido — identidade por `(dev, ino)`, baseline persistente sobre o mesmo
// ledger iodb que `ledger.js` e `state.js` ja consomem.
//
// O contrato da entidade `.fswatch/PROJECT` e EXTERNO e nao se reescreve aqui:
// `iodb/fswatch/docs/utest-sprint-prep.md`, feature `iodb/plans/6-fswatch/6.4`.
// Este modulo so o CONSOME, e devolve exatamente a forma que `walk()` devolve —
// `{ tests, sources }` de caminhos absolutos — para que `scan()` troque de fonte
// numa linha e a classificacao continue sendo a mesma.
//
// Degrada para `null` sem `../iodb` presente, ou desligado por config: quem chama
// cai no `walk()`. Um runner de testes nao pode ficar refem do seu proprio indice.
import { join, relative, resolve } from 'path'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { testRe } from './kinds.js'

const SOURCE_RE = /\.(js|ts)$/

// O dominio do store e derivado do NOME DO ARQUIVO de config, nao do nome do cluster:
// uma config POJO sempre cai em `.fswatch/metadata` (fswatch.js:288), qualquer que seja
// a chave que se passe. `PROJECT` — o dominio que o contrato convenciona — so sai de um
// arquivo YAML chamado `PROJECT.yaml`. Ele mora DENTRO de `.fswatch/`, e nao na raiz do
// projeto, porque a raiz e do usuario; como o dominio e `<dir do yaml>/.fswatch/<nome>`,
// o store acaba em `.fswatch/.fswatch/PROJECT`. O aninhamento e feio e e de proposito:
// e o preco de nao sujar a raiz nem tocar no iodb a partir daqui.
const CONFIG_DIR = '.fswatch'
const CONFIG_REL = join(CONFIG_DIR, 'PROJECT.yaml')

// O YAML do fswatch e um subconjunto pequeno (mapas, listas, escalares) — escrever a mao
// evita depender do serializador de ninguem para quatro linhas.
const writeConfig = (root, exclude) => {
  const dir = join(root, CONFIG_DIR)
  mkdirSync(dir, { recursive: true })
  const lines = [
    'PROJECT:',
    '  targets:',
    `    - "${root}"`,
    '  include:',
    '    - "**/*"',
  ]
  if (exclude.length) {
    lines.push('  exclude:')
    for (const p of exclude) lines.push(`    - "${p}"`)
  }
  writeFileSync(join(root, CONFIG_REL), lines.join('\n') + '\n')
}

// `path` e OPCIONAL no entry e, na pratica, AUSENTE: so `snapshot()` o preenche, e o
// `Scanner` batch — o caminho que `scan()` usa — nao (fswatch.js:230 vs :325). Medido:
// zero de zero entries trazem `path`. O idiom do proprio contrato
// (`map(e => relative(root, e.path))`) daria `undefined` para todos.
// O que sempre existe e `parent`, entao o caminho se reconstroi subindo a cadeia. A raiz
// do target tem `parent: null` e da o prefixo que se descarta.
const relPaths = entries => {
  const byId = new Map(entries.map(e => [e.id, e]))
  const out = []
  for (const e of entries) {
    if (e.kind !== 'file') continue
    const segs = []
    let cur = e
    let hops = 0
    // O teto corta ciclo: um `parent` corrompido nao pode travar o scan.
    while (cur && hops++ < 4096) {
      segs.unshift(cur.name)
      cur = cur.parent ? byId.get(cur.parent) : null
    }
    // segs[0] e o basename do target (a raiz da cadeia) — fora do caminho relativo.
    if (segs.length < 2) continue
    out.push(segs.slice(1).join('/'))
  }
  return out
}

// A MESMA classificacao de `walk()`, aplicada a caminhos relativos vindos do baseline.
// `filter.included`/`excluded`, `testRe()` e `SOURCE_RE` sao funcoes puras de path e de
// basename, entao valem sem mudanca aqui — e e isso que garante que os dois caminhos
// produzam listas identicas. Nada e reclassificado.
const classify = (rels, root, filter) => {
  const out = { tests: [], sources: [] }
  for (const rel of rels) {
    if (filter.excluded(rel)) continue
    // Um diretorio podado e ARMAZENADO pelo fswatch, ainda que nao descido, entao o
    // exclude tem que ser checado segmento a segmento — `walk()` consegue o mesmo de
    // graca, porque simplesmente nao desce.
    const segs = rel.split('/')
    let pruned = false
    for (let i = 1; i < segs.length; i++) {
      if (filter.excluded(segs.slice(0, i).join('/'))) { pruned = true; break }
    }
    if (pruned) continue
    const name = segs[segs.length - 1]
    const abs = join(root, rel)
    if (filter.included(rel) && testRe().test(name)) out.tests.push(abs)
    else if (SOURCE_RE.test(name)) out.sources.push(abs)
  }
  return out
}

export async function openFswatchSource(root, options = {}) {
  if (options.enabled !== true) return null

  let FSWatch
  try { ;({ FSWatch } = await import('../iodb/fswatch/fswatch.js')) } catch { return null }

  const abs = resolve(root)
  return {
    // `walk(dir, root, filter)` e sincrono; este e async. A troca de fonte acontece em
    // `scan()`, que absorve a diferenca — nenhum outro caller de `walk()` existe.
    async walk(filter, exclude = []) {
      let fs
      try {
        if (!existsSync(join(abs, CONFIG_REL))) writeConfig(abs, exclude)
        fs = await FSWatch(join(abs, CONFIG_REL))
        // `scan()` e uma varredura completa, nao um watch: o contrato manda pagar esse
        // custo na abertura. O ganho nao e pular o walk — e reaproveitar a varredura
        // entre `utest` e `sprint-cli` sobre o mesmo projeto, e ter identidade por inode.
        await fs.scan()
        // O store mora dentro da arvore que observa, entao aparece na varredura dela.
        const entries = fs.entries().filter(e => e.name !== CONFIG_DIR)
        return classify(relPaths(entries), abs, filter)
      } catch {
        // Baseline ilegivel ou corrompido nao derruba a corrida: `null` manda o
        // chamador para o `walk()`.
        return null
      } finally {
        try { await fs?.close() } catch {}
      }
    },
  }
}

export default openFswatchSource
