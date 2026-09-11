import fs from 'fs'
import callstack from '../utils/src/callstack.js'
import cl from '../utils/src/cl.js'

const stripAnsi = s => String(s || '').replace(/\x1b\[[0-9;]*m/g, '')
// cl.gray uses dim-black (\x1b[2;30m) which is barely visible; use bright-black instead
const gray = s => `\x1b[90m${s}\x1b[39m`

// OSC 8 hyperlink — `\x1b]8;;<uri>\x07<texto>\x1b]8;;\x07`. Terminais que suportam (iTerm2,
// VS Code, WezTerm, kitty…) tornam o `texto` clicável; os que não, mostram só o `texto`, o
// escape some. Um `file://` abre o arquivo no editor a partir do terminal do VS Code.
// `stripAnsi` já remove `\x1b[...m` mas NÃO o OSC 8 — quem mede largura usa `visibleLen`.
export const link = (uri, text) => `\x1b]8;;${uri}\x07${text}\x1b]8;;\x07`
export const visibleLen = s => stripAnsi(String(s || '')).replace(/\x1b\]8;;[^\x07]*\x07/g, '').length

// Largura em COLUNAS de terminal, não em unidades UTF-16. `'🐢'.length` é 2 (par
// surrogado) e ele ocupa 2 colunas — bate por acidente; `'✔'.length` é 1 e ele ocupa 1.
// Mas a coincidência acaba num emoji com seletor de variação ou ZWJ, onde `.length` conta
// 3-5 para 2 colunas de tela. Contar por CODEPOINT e somar 2 só para os intervalos largos
// (emoji e CJK) é o que mantém a régua honesta.
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]|[\u{1F300}-\u{1FAFF}]|[\u{1F000}-\u{1F2FF}]/u
export const displayLen = (s) => {
  let n = 0
  for (const ch of stripAnsi(s).replace(/\x1b\]8;;[^\x07]*\x07/g, '')) {
    if (ch === '️' || ch === '‍' || ch === '︎') continue   // VS16 / ZWJ / VS15 não ocupam coluna
    n += WIDE.test(ch) ? 2 : 1
  }
  return n
}

// O `right` (o endereço, o tempo) é a informação de MENOR volume e MAIOR valor — é ele que
// se mantém; quem cede é o `left`, cortado com `…`. Sem isto uma expressão longa de `check()`
// empurrava a linha para além da régua, e o relatório vazava do terminal.
function dotfill(left, fill, right, width = 80) {
  const r = displayLen(right || '')
  const room = width - r - 1                       // -1 = pelo menos um caractere de fill
  let l = displayLen(left)
  if (l > room) { left = truncEnd(left, room); l = displayLen(left) }
  const gap = Math.max(1, width - l - r)
  return `${left}${gray(fill.repeat(gap))}${right || ''}`
}

// Corta pelo COMEÇO — para caminho/endereço, onde o fim (`…nome.eval.js:045`) é o que
// identifica.
function truncStart(s, max) {
  const plain = stripAnsi(String(s || ''))
  if (displayLen(plain) <= max) return plain
  let out = '', n = 0
  for (const ch of [...plain].reverse()) {
    const w = displayLen(ch)
    if (n + w > max - 1) break
    out = ch + out; n += w
  }
  return '…' + out
}

// Corta preservando os escapes ANSI já abertos (some com a cor no fim, que é o que o
// `\x1b[39m` de quem montou a string fecha depois).
function truncEnd(s, max) {
  if (max <= 1) return '…'
  let out = '', n = 0
  const re = /(\x1b\[[0-9;]*m)|(\x1b\]8;;[^\x07]*\x07)|([\s\S])/gu
  for (let m; (m = re.exec(String(s)));) {
    if (m[1] || m[2]) { out += m[0]; continue }
    const w = displayLen(m[3])
    if (n + w > max - 1) break
    out += m[3]; n += w
  }
  return out + '…'
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
// O limiar de hog para ESTA execução — o DIVISOR do badge `🐢N` e o fence de seleção.
// `--hogs <N>` (em `utest.js`) grava `globalThis.utestHogMs = N`; daí em diante todo ponto
// que classifica ou mede hog — o `🐢` inline do `-v:2`, `phaseHogTotal`, a linha-título, o
// rodapé, `compactFails`, `fullView` — lê o mesmo N. Sem `--hogs` → `HOG_MS` (1000): só
// testes acima de 1s ganham badge, `🐢N` = segundos inteiros. Com `--hogs 100`, um arquivo
// de 7200ms → `🐢72` (72× o limite pedido). É uma FUNÇÃO, não uma const relida: o
// `globalThis` só existe depois do parse de args, e os módulos são importados antes disso.
export const hogMs = () => globalThis.utestHogMs ?? HOG_MS

const RUNNER   = /utest\.js/i
// Match exact runner/framework filenames (anchored) and node:/bun:/internal/ prefixes.
// Avoid loose patterns like `test\.js` that would also match `io-engine.test.js`.
const INTERNAL = /^(check|runner|worker|shims|setup|withTempDir)\.js$|^utest\.js$|^test\.js$|node:|bun:|internal\//i

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
    const seen = new Set([addr])  // skip frames already shown in the header
    // Uma linha de frame: `  <func> ........... <file>:NNN`, indentada 2, o nome da função à
    // esquerda (ou nada, para um frame de módulo/arrow) e o endereço à direita.
    const frameLine = f => {
      const fAddr = `${f.file}:${String(f.line).padStart(3, '0')}`
      return gray('  ' + dotfill(f.func ? f.func + ' ' : ' ', '.', ' ' + fAddr, width - 2))
    }
    for (const f of extractFrames(errLike).slice(0, 6)) {
      const fAddr = `${f.file}:${String(f.line).padStart(3, '0')}`
      if (seen.has(fAddr)) continue
      seen.add(fAddr)
      out.push(frameLine(f))
    }
    // ≥1 linha de callstack sob uma exceção sempre que houver uma DISTINTA do header — se
    // `extractFrames` (que pula internals) não achou nenhum frame novo, o parse cru de
    // `err.stack` é a rede, também pulando internals. Se o único frame real É o próprio
    // endereço do header (o throw foi na linha do teste), não há o que acrescentar — o
    // header já diz de onde veio.
    if (out.length === 1) {
      const raw = parseStack(errLike?.stack).find(f =>
        !INTERNAL.test(f.file) && !seen.has(`${f.file}:${String(f.line).padStart(3, '0')}`))
      if (raw) out.push(frameLine(raw))
    }
    return out.join('\n')
  }

  const left = `${glyphs.failed} ${lineCode || 'check()'}`
  // O endereço é longo em nome de arquivo de feature (`5.28-2-o-atalho-…eval.js:045`) e
  // roubava a linha inteira do `check()`, que é o que se lê primeiro. Ele cede primeiro,
  // pela ESQUERDA (o `:NNN` e o fim do nome são o que identifica), e só então o código.
  let out = dotfill(left, '.', ' ' + gray(truncStart(addr, Math.max(16, Math.floor(width * 0.45)))), width)
  // Um `check` que falhou com `received: false` não acrescenta nada — a expressão já está
  // no `lineCode` acima, e um check de 1 arg que falha é sempre falsy. Cobre `check(expr)`
  // (sem esperado) e `check(expr, true)` (esperado explícito, que também some). `check.js`
  // guarda `a`/`b` já como string (`repr()`), então a comparação é contra `'false'`/`'true'`.
  // Qualquer outro par (`check(x, 40)`, strings, `received: 0`/`null`) carrega informação
  // real e continua aparecendo.
  const trivialFalsy = c.a === 'false' && (c.b === undefined || c.b === 'true')
  if (!trivialFalsy) {
    const rcv = c.a !== undefined ? `received: ${cl.red(String(c.a))}` : ''
    const exp = c.b !== undefined ? `expected: ${cl.green(String(c.b))}` : ''
    // Quando os dois cabem numa linha (com 2 espaços de separação, sob a indentação de 2),
    // combina — `received: 1  expected: 2` num par de valores curtos economiza uma linha e
    // deixa a comparação lado a lado. Se estoura a largura, volta às duas linhas.
    if (rcv && exp && displayLen(`  ${rcv}  ${exp}`) <= width) out += `\n  ${rcv}  ${exp}`
    else {
      if (rcv) out += `\n  ${rcv}`
      if (exp) out += `\n  ${exp}`
    }
  }
  return out
}

// Fallback: parse `err.stack` sem `callstack`. Ele CAPTURA internamente e devolve
// `stack: []` quando algo falha (ex.: `globalThis.G` ausente num subprocesso ou no filho
// do `--watch` — o `G.config` bare na lib estoura e a pilha some), então o `try/catch`
// daqui nunca dispara. Sem esta rede, um vermelho re-renderizado nesse contexto perde o
// endereço E o `lineCode`, saindo só `check()`. Formatos aceitos: `at fn (path:li:co)` e
// `at path:li:co` (Bun, frame de módulo / arrow).
const STACK_LINE = /^\s*at\s+(?:.+?\s+\()?(.+?):(\d+):(\d+)\)?$/
function parseStack(stack) {
  const out = []
  for (const raw of String(stack || '').split('\n')) {
    const m = raw.match(STACK_LINE)
    if (!m) continue
    const p = m[1]
    if (p === 'native' || p === 'unknown' || /^(node|bun):/.test(p)) continue
    out.push({ file: p.split('/').pop(), path: p, line: +m[2] })
  }
  return out
}
function callerLineOf(f) {
  try {
    const src = fs.readFileSync(f.path.replace(/^file:(\/\/)?/, ''), 'utf8').split('\n')
    return (src[f.line - 1] || '').split('//')[0].trim()
  } catch { return '' }
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
  for (const f of parseStack(errLike.stack)) {
    if (!INTERNAL.test(f.file)) return callerLineOf(f)
  }
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
  for (const f of parseStack(errLike.stack)) {
    if (!INTERNAL.test(f.file)) return `${f.file}:${String(f.line).padStart(3, '0')}`
  }
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

// A barra de título de UM arquivo: `nome 🐢N 💥K ✘M ✔P ······· (243ms)`. É a linha que o
// `-v:2` mostra por arquivo e a que encabeça a forma direta (`utest <arquivo>`). O nome
// vem SUBLINHADO (é um cabeçalho — o que está abaixo o detalha), e os badges seguem a
// ordem canônica de `fileReportSpan`: 🐢 (múltiplo do limite), 💥 (exceções, separado),
// ✘ (falhas de check), ✔ (passados). Derivada do REGISTRO (`checkCount`/`failCount`/
// `excCount`/`lastMs`), não da árvore viva — o arquivo cacheado render igual ao que rodou.
export function fileLine(t, { width = 80, minMs = 10 } = {}) {
  const ms = t.lastMs || Math.round(t.duration || 0)
  const s = summary(t)
  const passed = s.passed || t.checkCount || 0
  const exc    = t._cached ? (t.excCount || 0)  : (s.exception || 0)
  const fail   = t._cached ? (t.failCount || 0) : (s.failed || 0)
  // um vermelho reproduzível sem contagem própria ainda mostra ✘1
  const failN  = fail || (!exc && t.state !== 'passed' ? 1 : 0)
  const badges = [
    ms > hogMs() && gray(hogBadge(ms)),
    exc   && `${glyphs.exception}${exc}`,
    failN && `${glyphs.failed}${failN}`,
    passed && `${glyphs.passed}${passed}`,
  ].filter(Boolean).join(' ')
  // Abaixo do limiar o tempo não é informação — só a coluna que ele empurraria.
  const time = ms >= minMs ? ` (${ms}ms)` : ''
  return dotfill(`${cl('_', t.name)} ${badges} `, '·', time, width)
}

// O bloco de erro de UM arquivo vermelho, já indentado: a linha do check/exceção e o
// endereço no stack. Um arquivo que veio do CACHE não tem `checks`/`error` vivos — só as
// linhas que a última execução real rendeu (`_failLines`, do storage). Renderizar a partir
// delas é o que mantém `-v:2` idêntico quente e frio, a mesma regra que o tempo já segue.
// `indent:false` é a forma que vai para o STORAGE — cru, sem os 4 espaços que só o
// relatório quer; quem grava não pode assumir a moldura de quem lê.
export function failLines(t, { width = 80, indent = true } = {}) {
  const pad = block => indent ? block.split('\n').map(l => `    ${l}`).join('\n') : block
  // O que o storage guarda é o DADO do check (`failInfo`), não a linha pronta: a largura do
  // terminal de agora não é a de quando o resultado foi gravado, e uma linha pré-formatada
  // chegaria estourando (ou curta demais) toda vez que a janela mudasse de tamanho.
  // Um `results.json` gravado por uma versão anterior guarda a linha pronta (string) em vez
  // do dado; ela não sabe se redesenhar, então é ignorada e o arquivo re-renderiza no
  // próximo run de verdade.
  const stored = (t._failLines || []).filter(c => c && typeof c === 'object')
  const blocks = stored.length
    ? stored.map(c => checkView(c, { width: width - 4 }))
    : [
      ...gatherExceptions(t).map(ex => errorView(ex.error, { width: width - 4 })),
      ...gatherChecks(t).filter(c => c.state !== 'passed').map(c => checkView(c, { width: width - 4 })),
    ]
  return blocks.filter(Boolean).map(pad)
}

// O mínimo que `checkView` precisa para redesenhar a linha de um vermelho numa rodada
// futura, em qualquer largura. Vai para o `results.json`.
export function failData(t) {
  return [
    ...gatherExceptions(t).map(ex => ({
      state: 'exception', error: { message: ex.error?.message ?? String(ex.error), stack: ex.error?.stack },
    })),
    ...gatherChecks(t).filter(c => c.state !== 'passed').map(c => ({
      state: c.state, a: c.a, b: c.b,
      lineCode: c.lineCode || extractLineCode(c.error || c.op?.error),
      address: c.address || extractAddr(c.error || c.op?.error),
    })),
  ]
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

// Uma linha "🐢 nome (Nms)" — tartaruga só quando ESTE teste passa de `hogMs()`, não porque o
// arquivo em volta dele é hog (um filho de 105ms dentro de um arquivo de 3s não é o hog).
const slowRow = (t, pad = '  ') => {
  const ms = Math.round(t.duration || 0)
  return gray(`${pad}${ms > hogMs() ? glyphs.hog + ' ' : '  '}${t.name} (${ms}ms)`)
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

// `{ line, code }` de um check falho — o mesmo `lineCode`/`addr` que `checkView` mostra,
// mas cru, para o `--json`. Um check de `.eval.js` não guarda `lineCode` no objeto (é
// derivado do `.stack` de `op.error` na hora de renderizar), então a extração roda aqui
// também.
export function failInfo(c) {
  const errLike = c.error || c.op?.error
  return {
    line: c.address || extractAddr(errLike) || null,
    code: (c.lineCode || extractLineCode(errLike) || '').trim() || null,
  }
}

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
  // O tempo mostrado vem SEMPRE da última execução real — `lastMs` (do storage), com
  // `duration` (a parede desta rodada) só como fallback pra quem ainda não tem registro.
  // Um arquivo cacheado tem `duration` ~0 (não rodou); ler dele apagava o `(Nms)` e o `🐢`
  // de um hog no replay quente. O resto da família (`fileLine`, `phaseMs`, `compactFails`)
  // já lê assim — quente == frio.
  const tookMs  = t.lastMs || Math.round(t.duration || 0)
  const hogTag  = tookMs > hogMs() ? ` ${glyphs.hog}` : ''
  const timeTag = (isFileHeader || tookMs > JUSTIFY_MS) ? ` (${tookMs}ms)${hogTag}` : ''

  const lines = []
  const selfMatch = !terms.length || matchesTerms(t.name, terms) || matchesTerms(addr, terms)

  if (selfMatch) {
    // Um cabeçalho de arquivo (indent 0, vários checks) é a MESMA barra de `fileLine` —
    // nome sublinhado, badges `🐢 💥 ✘ ✔` na ordem canônica, `·` até `(Nms)`. Sem isto o
    // `view()` montava uma barra própria (`✔P ✘M`, sem 🐢, sem 💥 separado, dotfill `-`).
    if (isFileHeader) {
      lines.push(pad + fileLine(t, { width: width - pad.length }))
    } else {
      const left = `${pad}${t.name} ${stateGlyph}${checkGlyphs}`
      lines.push(`${left}${timeTag}`)
    }
    // Um arquivo hog (>1000ms) que PASSOU não deixa detalhe nenhum pra trás (não é falha,
    // não tem checkView) — sem isto, "quem está bloqueando" só se responde caindo pra
    // `-v:3`. Descer só quando o arquivo já é hog: a rodada comum não paga o custo.
    if (verbosity <= 2 && t.state === 'passed' && tookMs > hogMs()) {
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

// Σ do tempo da ÚLTIMA execução de cada arquivo da fase (`lastMs`, do storage) — NÃO o
// tempo de parede da rodada, que num replay de cache é ~0. É este número que o relatório
// mostra, e é o mesmo esteja o cache quente ou frio: o cache fica invisível.
export const phaseMs = (main) =>
  (main?.tests || []).reduce((n, t) => n + (t.lastMs || Math.round(t.duration || 0) || 0), 0)

// Σ dos multiplicadores `🐢N` dos arquivos-hog da fase — o MESMO `floor(ms/hogMs())` do
// badge por-arquivo, somado. Sem `--hogs` (limite 1000) isso equivale aos segundos gastos
// em hogs; com `--hogs 100`, dois hogs de `🐢7` e `🐢4` dão `(1s 🐢11)`. A linha-título e o
// rodapé mostram esse total; `hogBadge` mostra a parcela de um arquivo.
export const phaseHogTotal = (main) =>
  (main?.tests || []).reduce((n, t) => {
    const ms = t.lastMs || Math.round(t.duration || 0)
    return ms > hogMs() ? n + Math.max(1, Math.floor(ms / hogMs())) : n
  }, 0)
// alias antigo — chamadores externos não quebram
export const phaseHogSecs = phaseHogTotal

// ─── phaseLine — a linha-título de uma fase ──────────────────
// `EVAL ......... (66s 🐢52) ✘45 📄77 🧪174 ✔129` — nome em CAIXA ALTA, dotfill, e à direita:
// `(Σs 🐢N)` — o tempo TOTAL dos testes da fase em SEGUNDOS, e `🐢N` = a soma dos
// multiplicadores `🐢` dos arquivos-hog da fase (sem `--hogs`, cada `🐢` é 1s, então o total
// ~= segundos em hog; com `--hogs 100` é a soma dos `floor(ms/100)`). Depois `✘N` (`💥N`) e
// o bloco fixo `📄 🧪 ✔`, na MESMA coluna em toda fase. MS só no nível do teste (`-v:3`).
//
// Aceita um `main` (com `tests[]`) OU um `sum` já pronto + `ms`/`files`/`hogSecs` (a linha
// `coverage` passa o segundo).
export function phaseLine(mainOrSum, { width = 80, title = '.', ms, files, hogSecs: hogArg, bare = false } = {}) {
  const isMain  = Array.isArray(mainOrSum?.tests)
  const sum     = isMain ? summary(mainOrSum) : mainOrSum
  const fileN   = isMain ? (mainOrSum.tests || []).length : (files ?? 0)
  const hogSecs = isMain ? phaseHogTotal(mainOrSum) : (hogArg ?? 0)
  const dur     = ms ?? (isMain ? phaseMs(mainOrSum) : 0) ?? 0
  const passN   = sum.total - sum.failed - sum.exception
  const alarms = [
    sum.failed    && `${glyphs.failed}${sum.failed}`,
    sum.exception && `${glyphs.exception}${sum.exception}`,
  ].filter(Boolean).join(' ')
  const fixed = [
    fileN     && `📄${fileN}`,
    sum.tests && `🧪${sum.tests}`,
    passN     && `${glyphs.passed}${passN}`,
  ].filter(Boolean).join(' ')
  // `(66s 🐢52)` — segundos totais dos testes da fase, e a soma dos multiplicadores `🐢` dos
  // hogs. Sem `--hogs` as duas são a mesma grandeza (tempo); com `--hogs 100` o segundo é
  // "quantas centenas de ms os hogs custaram".
  const paren = `(${Math.round(dur / 1000)}s${hogSecs ? ` ${glyphs.hog}${hogSecs}` : ''})`
  const right = `${gray(paren)} ${alarms ? alarms + ' ' : ''}${fixed}`
  if (bare) return right   // só o bloco-direito — a linha `coverage` monta o resto
  const left  = title ? `${cl.bold(String(title).toUpperCase())} ` : ''
  return dotfill(left, '.', ' ' + right, width)
}
// mantém o nome antigo como alias — nenhum chamador quebra
export const bgPhase = phaseLine

// ─── progressBar — a linha viva do que está rodando AGORA ────
// `EVAL [████████░░░░░░░░░░░░] plans/5-apps/5.26.eval.js ....` — 20 chars de barra
// (`done/total`), o resto para o caminho do arquivo, dotfill. Reescrita a cada arquivo
// pelo chamador com `\r` (sem `\n`), apagada com `\r\x1b[K` no fim da fase. Só num TTY.
const BAR_W = 20
export function progressBar(phase, done, total, file, { width = 80 } = {}) {
  const filled = total > 0 ? Math.round((done / total) * BAR_W) : 0
  const bar = '█'.repeat(filled) + '░'.repeat(BAR_W - filled)
  const left = `${cl.bold(phase.toUpperCase())} ${gray(`[${bar}]`)} `
  const right = ` ${gray(`${done}/${total}`)}`
  const room = Math.max(0, width - displayLen(left) - displayLen(right))
  const name = String(file || '')
  const shown = name.length > room ? '…' + name.slice(-(room - 1)) : name
  return dotfill(left + shown, '.', right, width)
}

// ─── compactFails — o que uma fase deixou para trás, em UMA linha ─────
// O detalhe de uma fase é o MESMO para todo kind: um token por arquivo que precisa de
// atenção — VERMELHO (`nome ✘M`) OU HOG (`nome 🐢N`, um arquivo acima de `HOG_MS`). Um
// arquivo que é os dois: `nome ✘M 🐢10`. Um hog NÃO conta como falha, mas ganha o badge
// da tartaruga. Sem isto, uma fase toda verde com hogs mostrava só a linha-título
// enquanto a `eval` (com vermelhos) mostrava um bloco — pareciam kinds diferentes.
//
// O TEMPO é BADGE GROSSO — `🐢N` = `floor(ms / hogMs())`, quantas vezes o arquivo passou do
// limite de hog da rodada. Sem `--hogs` (limite 1000) é SEGUNDOS INTEIROS: 7200ms → `🐢7`.
// Com `--hogs 100`: 7200ms → `🐢72`, 350ms → `🐢3`. Nunca `(🐢 10064ms)`. Um arquivo abaixo
// de `hogMs()` (badge daria 0) não carrega tempo NENHUM: a precisão de ms num cacheado não
// diz nada e só custa tokens. MS só aparece no nível do teste individual (`-v:3`). É o MESMO
// `🐢N` da linha-título — lá é a soma desses multiplicadores dos arquivos da fase.
//
// VERMELHOS sempre por inteiro. HOGS cortados nos `HOG_CAP` mais lentos, o resto vira
// `+N more 🐢`. Soft-wrap.
const HOG_CAP = 5
// `🐢N` — N = quantas vezes o arquivo passou do limite da rodada (`floor(ms/hogMs())`,
// mínimo 1: se `isHog` já o selecionou, passou ≥1×). Sem `--hogs` isso é segundos inteiros.
const hogBadge = ms => `${glyphs.hog}${Math.max(1, Math.floor(ms / hogMs()))}`

// ─── fileReportSpan — a apresentação canônica de UM arquivo num rio ──────────
// Um span = `nome` + os badges que se aplicam àquele arquivo, na ordem FIXA:
//   <nome> [🐢N] [💥K] [✘M] [✔P]
// 🐢 primeiro — num hog o tempo é a manchete; depois exceções, falhas de check, passados.
// `✔P` só com `{checks:true}` (o `-v:2`); nos outros modos a contagem de verdes é ruído.
// Um arquivo sem badge nenhum (verde, rápido, checks off) volta só o nome.
// É a ÚNICA verdade de "como um arquivo aparece numa linha" — `compactFails`, o rio de
// `fullView` v2 e o modo `--hogs` do runner delegam todos aqui. Sem delta `%`: variação de
// tempo entre rodadas não guiava nada e só poluía.
export function fileReportSpan(t, { checks = false } = {}) {
  const ms   = t.lastMs || Math.round(t.duration || 0)
  const exc  = t._cached ? (t.excCount  || 0) : summary(t).exception
  const fail = t._cached ? (t.failCount || 0) : summary(t).failed
  const parts = [t.name]
  if (ms > hogMs()) parts.push(gray(hogBadge(ms)))
  if (exc)  parts.push(`${glyphs.exception}${exc}`)
  if (fail) parts.push(`${glyphs.failed}${fail}`)
  if (checks) {
    const pass = t._cached ? (t.checkCount || 0) : summary(t).passed
    if (pass) parts.push(`${glyphs.passed}${pass}`)
  }
  return parts.join(' ')
}
// `hogs:true` (o flag `--hogs`) traz de volta o grupo de hogs PUROS (verde e lento) numa
// linha própria. Sem ele, o detalhe por arquivo de um hog verde não aparece — só o total
// no `(Ns 🐢M)` da linha-título. Um hog que TAMBÉM é vermelho mantém o badge `🐢N` ao lado
// do `✘M` sempre: o erro já puxa o arquivo para o bloco, e o tempo é contexto do erro.
export function compactFails(main, { width = 80, hogs: showHogs = false } = {}) {
  const msOf = t => t.lastMs || Math.round(t.duration || 0)
  const isRed = t => t.state !== 'passed'
  const isHog = t => msOf(t) > hogMs()
  const flagged = (main.tests || []).filter(t => isRed(t) || (showHogs && isHog(t)))
  if (!flagged.length) return ''

  const reds = flagged.filter(isRed).sort((a, b) => msOf(b) - msOf(a))
  const allHogs = showHogs
    ? flagged.filter(t => isHog(t) && !isRed(t)).sort((a, b) => msOf(b) - msOf(a))
    : []
  const hogs = allHogs.slice(0, HOG_CAP)
  const hidden = allHogs.length - hogs.length

  // `fileReportSpan` monta `nome [🐢N] [💥K] [✘M]` — o `compactFails` nunca liga `checks`
  // (a contagem de verdes é do `-v:2`, não deste bloco de atenção). Um vermelho que também é
  // hog já sai com os dois badges na ordem certa.
  const tok = t => fileReportSpan(t, { checks: false })

  // Vermelhos e hogs são grupos distintos — o de hogs começa em linha nova, para o
  // `nome ✘M` e o `nome 🐢Ns` não se misturarem no meio de uma linha.
  const groups = [reds.map(tok)]
  if (hogs.length) {
    const hogTokens = hogs.map(tok)
    if (hidden > 0) hogTokens.push(gray(`+${hidden} more ${glyphs.hog}`))
    groups.push(hogTokens)
  }

  return wrapTokenGroups(groups, width)
}

// Empacota cada GRUPO de tokens num rio contínuo, dois espaços entre tokens, quebrando
// só quando a linha estoura `width` — nunca no meio de um token. Um grupo novo sempre
// começa linha nova (não emenda no fim do grupo anterior).
function wrapTokenGroups(groups, width) {
  const lines = []
  for (const group of groups) {
    if (!group.length) continue
    let cur = ''
    for (const tk of group) {
      const add = cur ? cur + '  ' + tk : tk
      if (stripAnsi(add).length > width && cur) { lines.push(cur); cur = tk }
      else cur = add
    }
    if (cur) lines.push(cur)
  }
  return lines.join('\n')
}

// ─── fullView(main) — complete output ─────────────────────────
// `--hogs` NÃO passa mais por aqui — é `hogReport()`, uma leitura de tempo cega a erro. Isto
// é sempre o relatório orientado a ATENÇÃO (v0-v3).
//
// **v0-v1** (escopo largo): a linha-título da fase (`phaseLine`) e — se há vermelho OU hog —
//   os arquivos que pedem atenção numa linha compacta (`compactFails`). NENHUM `checkView`.
// **v2** (o nível que escopo estreito assume): a visão POR ARQUIVO — a linha-título da fase
//   e, sob ela, uma barra por arquivo (`fileLine`: nome, `✔N ✘M`, dotfill, tempo acima de
//   10ms), do mais caro pro mais barato, com a linha do erro (`checkView`) sob cada
//   vermelho. SEM o output do teste (`log()`). Responde "quais arquivos e quanto tempo"
//   sem descer aos testes individuais.
// **v3**: v2 + a árvore por TESTE e o output do `log()`. `view()` decide isso pelo
//   `verbosity`.
export function fullView(main, op = {}) {
  let verbosity = op.verbosity ?? 1
  const width   = op.width    ?? process.stdout.columns ?? 80
  const title   = op.title    || '.'
  const terms   = normalizeTerms(op.nameTerms)
  const sum     = summary(main)
  const allPassed = sum.failed === 0 && sum.exception === 0

  if (verbosity === 0 && allPassed) return ''
  if (verbosity === 0) verbosity = 1

  if (verbosity <= 1) {
    // A linha-título vai à largura CHEIA (dotfill até a borda); o que vem abaixo dela é
    // indentado 2 pelo chamador, então soft-wrap com `width - 2`. Sem vermelho e sem o flag
    // `--hogs`, `compactFails` volta vazio → o v1 é UMA linha por fase (só o `phaseLine`,
    // que já carrega o total `(Ns 🐢M)`). O detalhe por arquivo do hog só com `--hogs`.
    const lines = [phaseLine(main, { width, title })]
    const cf = compactFails(main, { width: width - 2, hogs: op.hogs ?? false })
    if (cf) lines.push(cf)
    return lines.join('\n')
  }

  if (verbosity === 2) {
    // O degrau entre o resumo por fase (v1) e a árvore por teste (v3): quem quer saber
    // "quais arquivos, quanto tempo" sem ler 1300 nomes de teste — mas sem gastar uma
    // LINHA por arquivo verde, que é só ruído quando a suíte é grande. Os PASSADOS viram
    // um rio contínuo (`wrapTokenGroups`, o mesmo soft-wrap de `compactFails`) — um
    // `dotfill` por arquivo aqui não caberia numa tela de verdade. Só os FALHOS quebram
    // para o relatório cheio: a barra de título (`fileLine`) e, sob ela, o check inteiro
    // (`failLines` — `received`/`expected`/endereço). O `log()` do teste fica para o `-v:3`.
    const lines = [phaseLine(main, { width, title })]
    const files = terms.length
      ? (main.tests || []).filter(t => hasDeepMatch(t, terms))
      : (main.tests || [])
    // `width - 2`: o chamador indenta 2 tudo que vem sob a linha-título da fase (que é a
    // única a ir à largura CHEIA). Medir contra `width` aqui estourava a régua em 2 colunas.
    const innerWidth = width - 2
    const msOf = t => t.lastMs || Math.round(t.duration || 0)
    const sorted = [...files].sort((a, b) => msOf(b) - msOf(a))
    const passed = sorted.filter(t => t.state === 'passed')
    const failed = sorted.filter(t => t.state !== 'passed')

    if (passed.length) {
      // O rio de verdes do v2 usa o span canônico com `checks:true` — `nome [🐢N] ✔P`. Um
      // verde que é hog carrega o `🐢N` (`floor(ms/hogMs())`, segundos sem `--hogs`); sem
      // isto o `-v2 --hogs` listava o arquivo lento sem dizer o quão lento.
      const river = wrapTokenGroups([passed.map(t => fileReportSpan(t, { checks: true }))], innerWidth)
      if (river) lines.push(river)
    }
    for (const t of failed) {
      lines.push(fileLine(t, { width: innerWidth }))
      lines.push(...failLines(t, { width: innerWidth }))
    }
    return lines.join('\n')
  }

  const hr    = `\x1b[90m${'═'.repeat(width)}\x1b[39m`
  const lines = [hr, `${cl.bold(title)} Test Results`, hr]

  const filtered = terms.length ? (main.tests || []).filter(t => hasDeepMatch(t, terms)) : (main.tests || [])

  for (const t of filtered) {
    const v = view(t, { verbosity, width, nameTerms: terms })
    if (v) lines.push(v)
  }

  lines.push(hr)

  const files = (main.tests || []).length
  const hogs = (main.tests || []).filter(t => (t.lastMs || Math.round(t.duration || 0)) > hogMs()).length
  const footLeft = [
    files             && `📄${files}`,
    sum.tests         && `🧪${sum.tests}`,
    sum.total         && `${glyphs.passed}${sum.total - sum.failed - sum.exception}`,
    sum.failed        && `${glyphs.failed}${sum.failed}`,
    sum.exception     && `${glyphs.exception}${sum.exception}`,
    hogs              && `${glyphs.hog}${hogs}`,
  ].filter(Boolean).join('  ')
  const footRight = gray(`${Math.round(main.duration || 0)}ms`)
  const gap = Math.max(1, width - displayLen(footLeft) - displayLen(footRight)) - 1
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
      if ((file.duration || 0) <= hogMs()) continue
      const n = file._cached ? (file.checkCount || 0) : gatherChecks(file).length
      rows.push({ phase, name: file.name, n, ms: file.duration || 0 })
    }
  }
  if (!rows.length && !standalone) return ''
  rows.sort((a, b) => b.ms - a.ms)
  const hr = `\x1b[90m${'═'.repeat(width)}\x1b[39m`
  const lines = [hr, `${cl.bold(`${glyphs.hog} Hogs (>${hogMs()}ms)`)}`, hr]
  if (rows.length) for (const { phase, name, n, ms } of rows)
    lines.push(`${glyphs.hog} ${phase}/${name} · ${n} (${Math.round(ms)}ms)`)
  else lines.push(gray(`nenhum arquivo passou de ${hogMs()}ms`))
  if (standalone) {
    lines.push(hr)
    // Tempo real (parede) vs. soma de cada teste individual — as duas contas NÃO precisam
    // bater (paralelismo, boot, overhead de import): o número é pra olhar, não pra reconciliar.
    lines.push(gray(`parede: ${Math.round(wallMs)}ms  ·  soma dos testes: ${Math.round(sumMs)}ms`))
  }
  return lines.join('\n')
}

export default { view, fullView, failLines, failData, fileLine, fileReportSpan, summary, glyphs, JUSTIFY_MS, HOG_MS, hogMs, hogReport, sumLeafDurations, bgPhase, phaseLine, phaseMs, phaseHogSecs, phaseHogTotal, progressBar, compactFails, failInfo }
