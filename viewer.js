import callstack from '../utils/src/callstack.js'
import cl from '../utils/src/cl.js'

const stripAnsi = s => String(s || '').replace(/\x1b\[[0-9;]*m/g, '')
// cl.gray uses dim-black (\x1b[2;30m) which is barely visible; use bright-black instead
const gray = s => `\x1b[90m${s}\x1b[39m`

function dotfill(left, fill, right, width = 80) {
  const l = stripAnsi(left).length
  const r = stripAnsi(right || '').length
  const gap = Math.max(1, width - l - r)
  return `${left}${gray(fill.repeat(gap))}${right || ''}`
}

// Lazy getters: evaluated per-access so cl.nocolor is respected at render time
export const glyphs = {
  get passed()  { return cl('g+', '✔') },
  get cached()  { return cl('y+', '✔') },
  get failed()  { return cl('r+', '✘') },
  get pending() { return gray('○')  },
  exception: '💥',
  hog: '🐢',
}

// >100ms merece aparecer (justificável — um passo de eval que spawna processo, por
// exemplo); >1000ms É hog de verdade. Dois nomes, não um número mágico espalhado.
export const JUSTIFY_MS = 100
export const HOG_MS = 1000

const RUNNER   = /utest2?\.js/i
// Match exact runner/framework filenames (anchored) and node:/bun:/internal/ prefixes.
// Avoid loose patterns like `test\.js` that would also match `io-engine.test.js`.
const INTERNAL = /^(check|runner|worker|shims|setup|withTempDir)\.js$|^utest2?\.js$|^test\.js$|node:|bun:|internal\//i

// ─── Check View ───────────────────────────────────────────────
function checkView(c, { width = 80 } = {}) {
  if (c.state === 'passed') return ''

  const errLike   = c.error || c.op?.error
  const lineCode  = c.lineCode || extractLineCode(errLike)
  const addr      = c.address  || extractAddr(errLike)

  if (c.state === 'exception') {
    const msg  = c.error?.message || String(c.error || 'exception')
    const left = `${glyphs.exception} ${msg}`
    const out  = [dotfill(left, '.', ' '+gray(addr), width)]
    const frames = extractFrames(errLike)
    const seen = new Set([addr])  // skip frames already shown in the header
    for (const f of frames.slice(0, 6)) {
      const fAddr = `${f.file}:${String(f.line).padStart(3,'0')}`
      if (seen.has(fAddr)) continue
      seen.add(fAddr)
      out.push(gray(`  ${f.func || ''}`.padEnd(2) + dotfill(' ' + (f.func || ''), '.', fAddr, width - 2)))
    }
    return out.join('\n')
  }

  const left = `${glyphs.failed} ${lineCode || 'check()'}`
  let out = dotfill(left, '.', ' '+gray(addr), width)
  if (c.a !== undefined) out += `\n  received: ${cl.red(String(c.a))}`
  if (c.b !== undefined) out += `\n  expected: ${cl.green(String(c.b))}`
  return out
}

function extractLineCode(errLike) {
  if (!errLike?.stack) return ''
  try {
    const cs = callstack({ error: errLike, smartFilter: false })
    for (let i = 0; i < cs.stack.length; i++) {
      const f = cs.stack[i]
      if (!f.file || f.file === 'native' || f.file === 'unknown') continue
      if (!INTERNAL.test(f.file)) return cs.callerLine(i) || ''
    }
  } catch {}
  return ''
}

function extractAddr(errLike) {
  if (!errLike?.stack) return ''
  try {
    const cs = callstack({ error: errLike, smartFilter: false })
    for (const f of cs.stack) {
      if (!f.file || f.file === 'native' || f.file === 'unknown') continue
      if (!INTERNAL.test(f.file)) return `${f.file}:${String(f.line).padStart(3, '0')}`
    }
  } catch {}
  return ''
}

function extractFrames(errLike) {
  if (!errLike?.stack) return []
  try {
    const cs = callstack({ error: errLike, smartFilter: false })
    const frames = []
    for (const f of cs.stack) {
      if (RUNNER.test(f.file)) break
      if (INTERNAL.test(f.file)) continue
      if (!f.file || f.file === 'unknown' || f.file === 'native') continue
      frames.push(f)
    }
    return frames
  } catch { return [] }
}

// ─── Error View ───────────────────────────────────────────────
function errorView(err, { width = 80 } = {}) {
  if (!err) return ''
  const msg    = err.message || String(err)
  const frames = extractFrames(err)
  const header = `${glyphs.exception} ${cl.red(msg.split('\n')[0])}`
  const lines  = [header]
  for (const f of frames.slice(0, 6))
    lines.push(gray(`  ${dotfill('  ' + (f.func || ''), '.', ` ${f.file}:${String(f.line).padStart(3,'0')}`, width - 2)}`))
  return lines.join('\n')
}

// ─── Summary helpers ──────────────────────────────────────────
function gatherChecks(t, out = []) {
  for (const c of t.checks || []) out.push(c)
  for (const child of t.tests || []) gatherChecks(child, out)
  return out
}

function gatherExceptions(t, out = []) {
  if (t.state === 'exception' && t.error) out.push(t)
  for (const child of t.tests || []) gatherExceptions(child, out)
  return out
}

// Testes-folha acima de JUSTIFY_MS, MAIS FUNDOS PRIMEIRO — ordenado do mais lento pro menos,
// pra "quem está bloqueando" ser a primeira linha, não uma busca visual. Só chamado quando o
// ARQUIVO já é hog (economia: um arquivo rápido não paga o custo de descer a árvore).
function gatherSlowLeaves(t, out = []) {
  if (!t.tests?.length) { if ((t.duration || 0) > JUSTIFY_MS) out.push(t); return out }
  for (const child of t.tests || []) gatherSlowLeaves(child, out)
  return out
}

const sortSlow = leaves => leaves.sort((a, b) => (b.duration || 0) - (a.duration || 0))

// Soma o `duration` de TODO teste-folha, sem filtro de limiar — não bate necessariamente com
// o tempo de parede da fase (paralelismo, overhead de import, o boot uma vez só) por
// desenho; o objetivo é só DAR o número, não reconciliar as duas contas.
function sumLeafDurations(t, acc = { ms: 0 }) {
  if (!t.tests?.length) { acc.ms += t.duration || 0; return acc }
  for (const child of t.tests || []) sumLeafDurations(child, acc)
  return acc
}

// Uma linha "🐢 nome (Nms)" — tartaruga só quando ESTE teste passa de HOG_MS, não porque o
// arquivo em volta dele é hog (um filho de 105ms dentro de um arquivo de 3s não é o hog).
const slowRow = (t, pad = '  ') => {
  const ms = Math.round(t.duration || 0)
  return gray(`${pad}${ms > HOG_MS ? glyphs.hog + ' ' : '  '}${t.name} (${ms}ms)`)
}

function gatherOutput(t, out = []) {
  for (const o of t.output || []) out.push(o)
  for (const child of t.tests || []) gatherOutput(child, out)
  return out
}

const normalizeTerms = terms =>
  (Array.isArray(terms) ? terms : String(terms || '').split(/[,\s]+/))
    .map(t => String(t || '').trim().toLowerCase()).filter(Boolean)

const matchesTerms = (name = '', terms = []) =>
  !terms.length || terms.every(t => String(name || '').toLowerCase().includes(t))

function hasDeepMatch(t, terms) {
  if (matchesTerms(t?.name, terms) || matchesTerms(t?.address, terms)) return true
  return (t?.tests || []).some(c => hasDeepMatch(c, terms))
}

export { checkView }

export function summary(t) {
  const s = { passed: 0, failed: 0, exception: 0, total: 0, tests: 0 }
  if (t._cached) {
    const n = t.checkCount || 1
    if (t.state === 'exception') { s.exception++; s.total++; s.tests++ }
    // Vermelho REPRODUZÍVEL cacheado (`cache.js#cacheFailure`): pulado como o
    // verde, mas conta como falha — senão hot e cold divergem, que é o furo que
    // o critério de aceite proíbe (`.sprint/TEST-EVAL.md`). `checkCount` guardou
    // os checks que PASSARAM; `failCount` os que não.
    else if (t.state === 'failed') {
      const p = t.checkCount || 0, f = t.failCount || 1
      s.passed += p; s.failed += f; s.total += p + f; s.tests += t.testCount || 1
    }
    else { s.passed += n; s.total += n; s.tests += t.testCount || 1 }
    return s
  }
  for (const c of (t.checks || [])) { s[c.state] = (s[c.state] || 0) + 1; s.total++ }
  if (t.tests?.length) {
    for (const child of t.tests) {
      const cs = summary(child)
      s.passed += cs.passed; s.failed += cs.failed; s.exception += cs.exception
      s.total += cs.total; s.tests += cs.tests
    }
  } else {
    s.tests++
    if (s.total === 0 && !['pending','running'].includes(t.state)) {
      const k = ['passed','failed','exception'].includes(t.state) ? t.state : 'passed'
      s[k]++; s.total++
    } else if (t.state === 'exception' && !s.exception) {
      s.exception++; s.total++
    }
  }
  return s
}

// ─── view(t) — render one test node ───────────────────────────
export function view(t, op = {}) {
  const verbosity = op.verbosity ?? 1
  const indent    = op.indent    ?? 0
  const width     = op.width     ?? process.stdout.columns ?? 80
  const pad       = '  '.repeat(indent)
  const terms     = normalizeTerms(op.nameTerms)

  if (t.state === 'pending') return ''
  if (terms.length && !hasDeepMatch(t, terms)) return ''
  // v1: só falha, mais o hog — um arquivo passando que levou >100ms aparece MESMO em v1
  // (agregado, sem descer pros testes de dentro), porque é exatamente o dado que
  // "identificar hog" precisa sem trocar de verbosidade. `--hogs` é uma leitura à parte
  // (`hogReport`, cego a erro) e não passa mais por aqui.
  if (verbosity <= 1 && t.state === 'passed' && !terms.length
    && !(indent === 0 && (t.duration || 0) > JUSTIFY_MS)) return ''

  // At v1/v2: flatten entire subtree into one line. At v3: show own checks + recurse.
  const allChecks     = verbosity < 3 ? gatherChecks(t)     : (t.checks || [])
  const allExceptions = verbosity < 3 ? gatherExceptions(t) : (t.error ? [t] : [])

  const isCached    = t.cached || t._cached
  const checkCount  = t.checkCount || t._checkCount || 0
  // File-level header (indent 0, more than one check): collapse the glyph run into counts
  // ("shell.t.js ✔97 ✘3") instead of printing one glyph per check.
  const isFileHeader = indent === 0 && !isCached && allChecks.length > 1
  const passCount   = isFileHeader ? allChecks.filter(c => c.state === 'passed').length : 0
  const failCount   = isFileHeader ? allChecks.length - passCount : 0
  const checkGlyphs = isCached
    ? (t.state === 'exception' ? glyphs.exception
      : t.state === 'failed'
        // Vermelho cacheado — `✔N ✘M`, o mesmo formato do header de arquivo, para
        // hot e cold lerem igual. `(cached)` no fim para não confundir com uma
        // rodada de verdade.
        ? `${glyphs.passed}${checkCount || 0} ${glyphs.failed}${t.failCount || 1} ${gray('(cached)')}`
        : `${glyphs.cached}${checkCount > 1 ? checkCount : ''}`)
    : isFileHeader
      ? `${glyphs.passed}${passCount}${failCount ? ` ${glyphs.failed}${failCount}` : ''}`
      : allChecks.map(c => glyphs[c.state] || '?').join('')
  const stateGlyph  = (allChecks.length === 0 && !isCached) ? (glyphs[t.state] || '') : ''

  const addr    = t.address || (t.caller ? `${t.caller.file}:${String(t.caller.line).padStart(3,'0')}` : '')
  const tookMs  = Math.round(t.duration || 0)
  const hogTag  = tookMs > HOG_MS ? ` ${glyphs.hog}` : ''
  const timeTag = (isFileHeader || tookMs > JUSTIFY_MS) ? ` (${tookMs}ms)${hogTag}` : ''

  const lines = []
  const selfMatch = !terms.length || matchesTerms(t.name, terms) || matchesTerms(addr, terms)

  if (selfMatch) {
    const left = `${pad}${t.name} ${stateGlyph}${checkGlyphs}`
    lines.push(isFileHeader && timeTag ? dotfill(left + ' ', '-', timeTag, width) : `${left}${timeTag}`)
    // Um arquivo hog (>1000ms) que PASSOU não deixa detalhe nenhum pra trás (não é falha,
    // não tem checkView) — sem isto, "quem está bloqueando" só se responde caindo pra
    // `-v:3`. Descer só quando o arquivo já é hog: a rodada comum não paga o custo.
    if (verbosity <= 2 && t.state === 'passed' && tookMs > HOG_MS) {
      const slow = sortSlow(gatherSlowLeaves(t))
      for (const s of slow) lines.push(slowRow(s, pad + '  '))
    }
  }

  const allOutput = verbosity < 3 ? gatherOutput(t) : (t.output || [])
  if (selfMatch && allOutput.length && (verbosity >= 3 || t.state !== 'passed')) {
    for (const [type, args] of allOutput) {
      const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
      lines.push(`${pad}  ${gray(`[${type}] ${text}`)}`)
    }
  }

  if (selfMatch) {
    const errors = (verbosity < 3 ? allChecks : (t.checks || [])).filter(c => c.state !== 'passed')
    const hasErrors = allExceptions.length > 0 || errors.length > 0
    if (hasErrors) lines.push('')
    for (const ex of allExceptions) {
      const v = errorView(ex.error, { width: width - pad.length - 2 })
      if (v) lines.push(v.split('\n').map(l => `${pad}  ${l}`).join('\n'))
    }
    for (const chk of errors) {
      const v = checkView(chk, { width: width - pad.length - 2 })
      if (v) lines.push(v.split('\n').map(l => `${pad}  ${l}`).join('\n'))
    }
  }

  if (verbosity >= 3) {
    for (const child of (t.tests || [])) {
      const v = view(child, { ...op, indent: indent + 1 })
      if (v) lines.push(v)
    }
  }

  return lines.filter(Boolean).join('\n')
}

// ─── fullView(main) — complete output ─────────────────────────
// `--hogs` NÃO passa mais por aqui — é `hogReport()`, uma leitura de tempo cega a erro. Isto
// é sempre o relatório orientado a FALHA (v0-v3).
export function fullView(main, op = {}) {
  let verbosity = op.verbosity ?? 1
  const width   = op.width    ?? process.stdout.columns ?? 80
  const title   = op.title    || '.'
  const terms   = normalizeTerms(op.nameTerms)
  const sum     = summary(main)
  const allPassed = sum.failed === 0 && sum.exception === 0

  if (verbosity === 0 && allPassed) return ''
  if (verbosity === 0) verbosity = 1

  if (verbosity === 1 && allPassed && !terms.length) {
    const ms = Math.round(main.duration || 0)
    const head = `${title}: ${glyphs.passed} ${sum.total} (${ms}ms)`
    // "não conseguimos identificar quem está bloqueando" — o colapso de UMA linha (o caso
    // comum: rodar um arquivo só) escondia exatamente o teste que pesa. Só desce a árvore
    // quando o TOTAL já é hog — nenhum custo extra na rodada rápida, que é a maioria.
    if (ms <= HOG_MS) return head
    const slow = sortSlow(gatherSlowLeaves(main))
    if (!slow.length) return head
    return [head, ...slow.map(t => slowRow(t))].join('\n')
  }

  const hr    = `\x1b[90m${'═'.repeat(width)}\x1b[39m`
  const lines = [hr, `${cl.bold(title)} Test Results`, hr]

  const filtered = terms.length ? (main.tests || []).filter(t => hasDeepMatch(t, terms)) : (main.tests || [])

  if (verbosity === 2) {
    // UMA linha por arquivo, econômica: nome+contagem sempre; `(Nms)` só quando passa de
    // 100ms (`JUSTIFY_MS`) — um arquivo de 2ms não precisa dizer "2ms", e listar isso em
    // toda linha inflava a saída sem ajudar a achar o hog. Nenhuma saída de
    // `log()`/`debug()`/console capturado aparece aqui — só falha.
    const passing = filtered.filter(t => t.state === 'passed')
    const failing = filtered.filter(t => t.state !== 'passed')
    if (passing.length) {
      for (const t of passing) {
        const n = t._cached ? (t.checkCount || '') : gatherChecks(t).length
        const ms = Math.round(t.duration || 0)
        const hogTag = ms > HOG_MS ? ` ${glyphs.hog}` : ''
        const timeTag = ms > JUSTIFY_MS ? ` (${ms}ms)${hogTag}` : ''
        lines.push(gray(`${t.name} ${glyphs.passed}${n > 1 ? n : ''}${timeTag}`))
        if (ms > HOG_MS) {
          const slow = sortSlow(gatherSlowLeaves(t))
          for (const s of slow) lines.push(slowRow(s))
        }
      }
    }
    if (failing.length) {
      if (passing.length) lines.push(hr)
      for (const t of failing) {
        const v = view(t, { verbosity, width, nameTerms: terms })
        if (v) lines.push(v)
      }
    }
  } else {
    for (const t of filtered) {
      const v = view(t, { verbosity, width, nameTerms: terms })
      if (v) lines.push(v)
    }
  }

  lines.push(hr)

  const files = (main.tests || []).length
  const hogs = (main.tests || []).filter(t => (t.duration || 0) > HOG_MS).length
  const footLeft = [
    files             && `📄${files}`,
    sum.tests         && `🧪${sum.tests}`,
    sum.total         && `${glyphs.passed}${sum.total - sum.failed - sum.exception}`,
    sum.failed        && `${glyphs.failed}${sum.failed}`,
    sum.exception     && `${glyphs.exception}${sum.exception}`,
    hogs              && `${glyphs.hog}${hogs}`,
  ].filter(Boolean).join('  ')
  const footRight = gray(`${Math.round(main.duration || 0)}ms`)
  const gap = Math.max(1, width - stripAnsi(footLeft).length - stripAnsi(footRight).length) - 1
  lines.push(`${footLeft}${' '.repeat(gap)}${footRight}`)

  return lines.join('\n')
}

// Seção final consolidada: TODO teste >1000ms, de TODAS as fases, uma lista só — o pedido
// era "um report dos hogs no fim do report", não só o inline por arquivo (que já existe em
// `fullView`). `mains` é `[{phase, main}]`; cada linha carrega a fase, pro mesmo nome
// repetido em duas fases não virar ambíguo.
// `standalone` (o modo `--hogs`, verbosity-independente) sempre imprime — cabeçalho, "nenhum
// hog" se for o caso, e o rodapé parede/soma. A seção automática de fim-de-relatório (sem
// `standalone`) fica muda quando não há hog: a maioria das rodadas é rápida, e um cabeçalho
// "Hogs" vazio em toda rodada limpa é ruído, não sinal.
// Uma linha por ARQUIVO, não por teste — "nome · Nchecks (Nms)". O nome de um passo de eval
// é a frase inteira do `.eval.js` (às vezes 200 caracteres); listar isso por linha inflava
// exatamente o que devia ser curto. Quem quer o passo exato já tem `-v:3` ou o inline de
// `fullView` (que continua por-teste, porque ali o contexto do arquivo já está na tela).
export function hogReport(mains, { width = 80, standalone = false } = {}) {
  const rows = []
  let wallMs = 0, sumMs = 0
  for (const { phase, main } of mains) {
    wallMs += main.duration || 0
    sumMs += sumLeafDurations(main).ms
    for (const file of main.tests || []) {
      if ((file.duration || 0) <= HOG_MS) continue
      const n = file._cached ? (file.checkCount || 0) : gatherChecks(file).length
      rows.push({ phase, name: file.name, n, ms: file.duration || 0 })
    }
  }
  if (!rows.length && !standalone) return ''
  rows.sort((a, b) => b.ms - a.ms)
  const hr = `\x1b[90m${'═'.repeat(width)}\x1b[39m`
  const lines = [hr, `${cl.bold(`${glyphs.hog} Hogs (>${HOG_MS}ms)`)}`, hr]
  if (rows.length) for (const { phase, name, n, ms } of rows)
    lines.push(`${glyphs.hog} ${phase}/${name} · ${n} (${Math.round(ms)}ms)`)
  else lines.push(gray(`nenhum arquivo passou de ${HOG_MS}ms`))
  if (standalone) {
    lines.push(hr)
    // Tempo real (parede) vs. soma de cada teste individual — as duas contas NÃO precisam
    // bater (paralelismo, boot, overhead de import): o número é pra olhar, não pra reconciliar.
    lines.push(gray(`parede: ${Math.round(wallMs)}ms  ·  soma dos testes: ${Math.round(sumMs)}ms`))
  }
  return lines.join('\n')
}

export default { view, fullView, summary, glyphs, JUSTIFY_MS, HOG_MS, hogReport, sumLeafDurations }
