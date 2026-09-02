// viewer.t.js — o relatório compacto (sprint 084c): barra por fase, vermelhos numa
// linha, e o par `received: false / expected: true` que some.
import { phaseLine, phaseMs, progressBar, compactFails, checkView, failInfo, deltaTag } from './viewer.js'
import cl from '../utils/src/cl.js'

const strip = s => String(s || '').replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\[K/g, '')

test('viewer — relatório compacto', ({ test, check }) => {

  test('checkView omite o par trivial `check(expr, true)`', ({ check }) => {
    // `check.js` guarda `a`/`b` já como string (`repr`), então o falho de um `check(x, true)`
    // chega aqui como a:'false' b:'true'.
    const trivial = { state: 'failed', a: 'false', b: 'true', lineCode: "check(x.includes('┌'), true)", address: 'f.js:012' }
    const out = strip(checkView(trivial, { width: 80 }))
    check(out.includes('received'), false, 'sem `received:` no par trivial')
    check(out.includes('expected'), false, 'sem `expected:` no par trivial')
    check(out.includes("check(x.includes('┌'), true)"), true, 'a linha-fonte fica')
  })

  test('checkView mantém o par quando o valor é informação', ({ check }) => {
    const real = { state: 'failed', a: '4', b: '5', lineCode: 'check(2 + 2, 5)', address: 'f.js:003' }
    const out = strip(checkView(real, { width: 80 }))
    check(out.includes('received: 4'), true)
    check(out.includes('expected: 5'), true)
  })

  test('compactFails — só os vermelhos, só o número de falhas', ({ check }) => {
    const main = { tests: [
      { name: 'a.eval.js', state: 'passed', _cached: true, checkCount: 3, failCount: 0 },
      { name: 'b.eval.js', state: 'failed', _cached: true, checkCount: 2, failCount: 2 },
      { name: 'c.eval.js', state: 'failed', _cached: true, checkCount: 0, failCount: 1 },
    ] }
    const out = strip(compactFails(main, { width: 200 }))
    check(out.includes('a.eval.js'), false, 'o verde não aparece')
    check(/b\.eval\.js ✘2/.test(out), true, 'b: só ✘2, sem ✔2')
    check(/c\.eval\.js ✘1/.test(out), true)
    check(out.includes('✔'), false, 'nenhum ✔ no log compacto')
  })

  test('compactFails — tempo SEMPRE presente (última execução), 🐢 quando é hog', ({ check }) => {
    const main = { tests: [
      { name: 'quick.eval.js', state: 'failed', _cached: true, failCount: 1, lastMs: 80 },
      { name: 'slow.eval.js',  state: 'failed', _cached: true, failCount: 2, lastMs: 1429 },
    ] }
    const out = strip(compactFails(main, { width: 200 }))
    check(out.includes('quick.eval.js ✘1 (80ms)'), true, 'cacheado também mostra (Nms)')
    check(out.includes('slow.eval.js ✘2 (🐢 1429ms)'), true, 'hog → 🐢 dentro do parêntese')
  })

  test('compactFails — deltaTag só quando re-rodou (há prevMs)', ({ check }) => {
    const cachedOnly = { tests: [{ name: 'a.eval.js', state: 'failed', failCount: 1, lastMs: 200 }] }
    const reran      = { tests: [{ name: 'a.eval.js', state: 'failed', failCount: 1, lastMs: 200, prevMs: 100 }] }
    check(strip(compactFails(cachedOnly, { width: 200 })).includes('%'), false, 'sem prevMs → sem delta')
    check(strip(compactFails(reran, { width: 200 })).includes('+100%'), true, '200 vs 100 → +100%')
  })

  test('compactFails — vazio quando tudo passou', ({ check }) => {
    const main = { tests: [{ name: 'a.eval.js', state: 'passed', _cached: true, checkCount: 1 }] }
    check(compactFails(main, { width: 80 }), '')
  })

  test('compactFails — soft-wrap na largura, sem partir um token', ({ check }) => {
    const tests = Array.from({ length: 10 }, (_, i) => ({
      name: `feature-${i}.eval.js`, state: 'failed', _cached: true, checkCount: 0, failCount: 1,
    }))
    const out = strip(compactFails({ tests }, { width: 60 }))
    for (const r of out.split('\n')) check(r.length <= 60 || !r.includes('  '), true, `linha cabe em 60: "${r}"`)
    check(out.split('\n').every(r => r.startsWith('feature-')), true, 'só tokens de arquivo, sem linha de dica (essa mora no utest.js)')
  })

  test('phaseLine — CAIXA ALTA, dotfill, ordem (Σms) ✘N 📄🧪✔, borda à direita', ({ check }) => {
    // o `(Nms)` é a SOMA do `lastMs` dos arquivos da fase — nunca um tempo de parede — e
    // vem PRIMEIRO no bloco direito, antes de `✘` e do `📄 🧪 ✔`.
    const main = { tests: [
      { name: 'x.t.js', state: 'passed', _cached: true, checkCount: 10, lastMs: 30 },
      { name: 'y.t.js', state: 'failed', _cached: true, checkCount: 8, failCount: 2, lastMs: 12 },
    ] }
    const raw = phaseLine(main, { width: 80, title: 'unit' })
    const out = strip(raw)
    check(out.includes('UNIT'), true, 'nome em caixa alta')
    check(out.includes('.....'), true, 'dotfill')
    check(out.indexOf('(42ms)') < out.indexOf('✘2'), true, '(Σms) vem antes de ✘')
    check(out.indexOf('✘2') < out.indexOf('📄'), true, '✘ vem antes de 📄')
    check(/✔\d+\s*$/.test(out), true, 'termina no ✔N (bloco fixo à direita)')
    check(out.split('\n').length, 1, 'uma linha só')
    check(/\x1b\[4[0-8]/.test(raw), false, 'sem cor de FUNDO')
  })

  test('phaseLine — fase verde não tem ✘, e 📄🧪✔ ficam na mesma coluna', ({ check }) => {
    const green = { tests: [{ name: 'a.t.js', state: 'passed', _cached: true, checkCount: 3, lastMs: 5 }] }
    const red   = { tests: [
      { name: 'a.t.js', state: 'passed', _cached: true, checkCount: 3, lastMs: 5 },
      { name: 'b.t.js', state: 'failed', _cached: true, checkCount: 1, failCount: 1, lastMs: 3 },
    ] }
    const g = strip(phaseLine(green, { width: 80, title: 'x' }))
    const r = strip(phaseLine(red,   { width: 80, title: 'x' }))
    check(g.includes('✘'), false, 'verde sem ✘')
    check(g.indexOf('📄'), r.indexOf('📄'), '📄 na MESMA coluna com e sem ✘')
  })

  test('phaseLine — bare devolve só o bloco-direito (a linha coverage)', ({ check }) => {
    const sum = { passed: 100, failed: 3, exception: 0, total: 103, tests: 40 }
    const out = strip(phaseLine(sum, { title: '', ms: 999, files: 50, bare: true }))
    check(out.includes('..'), false, 'sem dotfill')
    check(out.startsWith('(999ms)'), true, 'começa no (Σms)')
    check(out.includes('✘3'), true)
    check(out.trim().endsWith('✔100'), true)
  })

  test('phaseMs — Σ do lastMs dos arquivos da fase, cai em duration só se não há lastMs', ({ check }) => {
    check(phaseMs({ tests: [{ lastMs: 100 }, { lastMs: 250 }, { lastMs: 0 }] }), 350)
    check(phaseMs({ tests: [{ duration: 40 }, { lastMs: 10 }] }), 50, 'mistura: usa lastMs quando existe, senão duration')
    check(phaseMs({ tests: [] }), 0)
  })

  test('progressBar — 20 chars de barra + caminho + done/total', ({ check }) => {
    const out = strip(progressBar('eval', 5, 20, 'plans/5-apps/5.26.eval.js', { width: 80 }))
    check(out.includes('EVAL'), true)
    check(out.includes('5/20'), true)
    check(out.includes('5.26.eval.js'), true)
    check((out.match(/[█░]/g) || []).length, 20, 'a barra tem exatamente 20 células')
  })

  test('deltaTag — só destaca variação ≥20%, verde mais rápido / vermelho mais lento', ({ check }) => {
    check(deltaTag(100, 100), '', 'sem variação, sem tag')
    check(strip(deltaTag(110, 100)), '', '10% é ruído, sem tag')
    check(strip(deltaTag(150, 100)), ' +50%', 'mais lento')
    check(strip(deltaTag(60, 100)), ' -40%', 'mais rápido')
    check(deltaTag(100, 0), '', 'sem `prev`, sem tag')
  })

  test('failInfo — { line, code } de um check falho', ({ check }) => {
    const c = { state: 'failed', address: 'f.js:012', lineCode: '  check(a, b)  ' }
    check(failInfo(c).line, 'f.js:012')
    check(failInfo(c).code, 'check(a, b)', 'trim')
  })
})
