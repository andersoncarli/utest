import { readFileSync, existsSync } from 'fs'
import { join, relative, dirname, resolve, parse as parsePath } from 'path'
import { createHash } from 'crypto'

/**
 * cacheLedger.js — o SEGUNDO árbitro do cache, ancorado no CONTEÚDO.
 *
 * O `results.json` (dentro de `cache.js`) responde "este teste está fresco?" comparando
 * `mtime`: o instante em que o inode mudou. Este módulo responde a MESMA pergunta olhando
 * o `sha256` que o ledger (`ledger.js`, feature 8.1) já grava no `fileSet` de cada
 * `run:start` — o que o arquivo ERA, não quando ele foi tocado.
 *
 * A diferença não é acadêmica, e aparece nos dois casos em que o mtime mente:
 *
 *   `touch` sem edição   → mtime novo, conteúdo idêntico. O mtime força uma rodada que o
 *                          conteúdo prova desnecessária.
 *   checkout / rebase    → o git reescreve o arquivo com os MESMOS bytes e um mtime novo.
 *                          Trocar de branch e voltar re-roda a suíte inteira à toa.
 *
 * Nos dois, o ledger diz `fresh` e o `results.json` diz stale. Essa divergência é
 * ESPERADA — é o ganho que justifica a feature — e é o único caso em que os dois árbitros
 * discordam por design. Quando o conteúdo muda de verdade, os dois concordam em stale.
 *
 * ── As duas persistências rodam em PARALELO ─────────────────────────────────
 *
 * Este módulo não substitui o `results.json`: ele arbitra, e o `results.json` continua
 * sendo escrito integralmente (`results.record` roda sempre, ver `cache.js#write`), porque
 * ainda é o índice que `utest <N.F>` resolve sem escanear e o dono do `failLines` que o
 * `-v:2` renderiza. A convergência — as duas virarem uma — é sprint futuro, e só depois
 * que a igualdade quente/frio provar que dá no mesmo.
 *
 * ── Custo zero quando desligado ─────────────────────────────────────────────
 *
 * Sem `../iodb` presente, ou desligado por config, `enabled` volta `false` e o `TestCache`
 * fica no `results.json` — a arbitragem por mtime de sempre. Mesma lei do `ledger.js`: um
 * runner de testes não fica refém do seu próprio log.
 */

const sha256 = (file) => {
  try { return createHash('sha256').update(readFileSync(file)).digest('hex') }
  catch { return null }
}

// Mesma subida que o `cache.js` faz para achar onde mora o `.utest/` — o ledger é UM por
// projeto, não por `root` estreitado numa invocação (`utest apps/eval/`).
const findProjectRoot = (from) => {
  for (let d = resolve(from); ; d = dirname(d)) {
    if (existsSync(join(d, '.git')) || existsSync(join(d, 'TEST.yaml'))) return d
    if (d === parsePath(d).root) return resolve(from)
  }
}

const noop = () => ({
  enabled: false,
  get: () => null,
  fresh: () => false,
  record: () => {},
  flush: () => {},
  verify: () => ({ valid: true, length: 0 }),
})

/**
 * `openCacheLedger(root, opts)` → a MESMA forma que o objeto `results` interno do
 * `cache.js` expõe (`get`/`fresh`/`record`/`flush`), para que o `TestCache` troque um pelo
 * outro sem saber a diferença. Só `enabled` é novo, e é o sinal de qual dos dois vale.
 *
 * `ledger` (opcional): um handle de `openLedger` já aberto — `utest.js` abre um por rodada
 * e passa aqui, para que a leitura e a escrita da rodada compartilhem a mesma stream em
 * vez de abrir o storage duas vezes.
 */
export async function openCacheLedger(root, options = {}) {
  if (options.enabled === false) return noop()

  const projectRoot = findProjectRoot(root)
  let ledger = options.ledger
  if (!ledger) {
    const { openLedger } = await import('./ledger.js')
    ledger = await openLedger(projectRoot, options)
  }
  // `openLedger` degrada para no-op sem `../iodb`, e um no-op tem `runId: null`. É o
  // sinal — sem cadeia, não há o que arbitrar, e o `results.json` continua mandando.
  if (!ledger || ledger.runId === null) return noop()

  // ── A PROJEÇÃO ────────────────────────────────────────────────────────────
  // O ledger é um log append-only: a verdade presente é DERIVADA do histórico, nunca
  // mantida em paralelo a ele (a propriedade que o `_front.md` da frente 8 nomeia). Aqui
  // isso é uma passada só, na abertura: os `run:start` dão o sha256 de cada arquivo do
  // conjunto, os `test:result` dão o veredito daquele arquivo, e o mais RECENTE de cada
  // um vence. Reduzir na abertura, e não a cada consulta, é o que mantém o custo por
  // arquivo em O(1) — a suíte pergunta `fresh()` uma vez por teste.
  const shas = new Map()     // relpath → sha256 do último run:start que o incluiu
  const records = new Map()  // `${phase}\0${relpath}` → último test:result
  const key = (phase, rel) => `${phase || 'unit'}\0${rel}`

  const project = (entry) => {
    if (!entry || typeof entry !== 'object') return
    if (entry.event === 'run:start') {
      for (const f of entry.fileSet || []) if (f.sha256) shas.set(f.file, f.sha256)
    } else if (entry.event === 'test:result') {
      records.set(key(entry.phase, entry.file), entry)
    } else if (entry.event === 'run:tests') {
      // O lote agregado que o `ledger.js#end` grava — mesma forma de cada `test:result`,
      // um write so (ver o comment-block do `buffered` la).
      for (const r of entry.results || []) records.set(key(r.phase, r.file), r)
    }
  }

  try {
    // O `iodb` reduz com `append`, então o estado projetado É o array de registros na
    // ordem em que entraram. Ler uma vez, na abertura.
    const history = typeof ledger.state === 'function' ? ledger.state() : []
    for (const entry of history || []) project(entry)
  } catch { /* histórico ilegível não pode derrubar a rodada — cai no mtime */ }

  const rel = (p) => relative(projectRoot, p)

  // O sha256 REGISTRADO de um arquivo — o que o ledger diz que ele era da última vez.
  const known = (p) => shas.get(rel(p)) ?? null

  // Bate com o disco AGORA? `null` de qualquer lado é "não sei", e não saber nunca
  // promove: a assimetria é a mesma do `arbitrate` do `cache.js` — o lado arriscado é
  // sempre o menos permissivo.
  const matches = (p) => {
    const before = known(p)
    if (!before) return false
    const now = sha256(p)
    return now !== null && now === before
  }

  return {
    enabled: true,

    // Mesma assinatura de `results.get` — o record de que o `arbitrate` extrai
    // `checks`/`tests`/`state` ao promover um MISS de tempo. Devolvido no formato do
    // `results.json` para que o consumidor não precise saber de qual árbitro veio.
    get: (phase, p) => {
      const r = records.get(key(phase, rel(p)))
      if (!r) return null
      return {
        checks: r.checks ?? 0,
        tests: r.tests ?? 0,
        failCount: r.failCount ?? 0,
        state: r.status === 'passed' ? 'passed' : 'failed',
        exception: !!r.exception,
        ms: r.elapsed ?? 0,
        failLines: r.failLines,
        // O `arbitrate` exige `targetMtime` presente para promover com alvo pareado. Aqui
        // a confirmação do alvo é por sha256 (feita em `fresh`, cruzando com o `fileSet`
        // do `run:start`), então o campo existe só para satisfazer a mesma guarda sem
        // reescrevê-la — nada compara os dois numericamente.
        targetMtime: r.target ? (shas.get(r.target) ?? null) : null,
      }
    },

    // A pergunta da feature. Verde só quando o CONTEÚDO do teste, do alvo pareado e de
    // toda dep extra bate com o que o ledger registrou. Mesma assinatura de
    // `results.fresh`, para caber no `arbitrate` existente sem tocá-lo.
    fresh: (phase, p, extraDeps = [], targetPath = null) => {
      if (!records.has(key(phase, rel(p)))) return false
      if (!matches(p)) return false
      if (targetPath && !matches(targetPath)) return false
      for (const d of extraDeps) if (!matches(d)) return false
      return true
    },

    // A escrita da rodada é do `ledger.test` (o `utest.js` já a faz, evento por evento);
    // aqui `record` só mantém a projeção em memória coerente dentro da MESMA rodada — um
    // teste que rodou agora não pode ser lido como stale por outro que pergunte depois.
    // Append-only não reescreve: o registro real já foi ao disco pelo ledger.
    record: (phase, p, entry = {}) => {
      const r = rel(p)
      const sha = sha256(p)
      if (sha) shas.set(r, sha)
      if (entry.targetPath) {
        const t = sha256(entry.targetPath)
        if (t) shas.set(rel(entry.targetPath), t)
      }
      for (const d of entry.extraDeps || []) {
        const s = sha256(d)
        if (s) shas.set(rel(d), s)
      }
      records.set(key(phase, r), {
        event: 'test:result', phase, file: r,
        status: entry.state === 'passed' ? 'passed' : 'failed',
        checks: entry.checks, tests: entry.tests, failCount: entry.failCount,
        exception: !!entry.exception, failLines: entry.failLines,
        elapsed: entry.ms,
        target: entry.targetPath ? rel(entry.targetPath) : null,
      })
    },

    // Não há o que descarregar: o ledger persiste no `io.in()` de cada evento, e a chave
    // que ele devolve já é a prova de que o registro entrou. O método existe só para que
    // a forma case com a do `results`.
    flush: () => {},

    verify: () => ledger.verify(),

    // Exposto para o teste da divergência: quantos arquivos o ledger conhece.
    _shas: shas,
  }
}

export default openCacheLedger
