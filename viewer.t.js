// viewer.t.js — o relatório compacto (sprint 084c): barra por fase, vermelhos numa
// linha, e o par `received: false / expected: true` que some.
import { phaseLine, phaseMs, progressBar, compactFails, checkView, failInfo, fileReportSpan, fullView, fileLine, displayLen, failLines, failData, hogMs, HOG_MS } from './viewer.js'
import cl from '../utils/src/cl.js'

const strip = s => String(s || '').replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\[K/g, '')

test('viewer — relatório compacto', ({ test, check }) => {

  // `hogMs()` lê `globalThis.utestHogMs`. Se a SUÍTE foi rodada sob `bun utest.js . --hogs N`,
  // esse global vaza pro processo dos testes e as asserções que esperam o fence default (1000)
  // quebram. Cada teste que depende do default começa limpo; os que testam o override usam
  // try/finally. Aqui só garantimos o ponto de partida.
  delete globalThis.utestHogMs

  test('checkView omite `received: false` — 1 arg e `check(expr, true)`', ({ check }) => {
    // `check.js` guarda `a`/`b` já como string (`repr`). Um `check(x, true)` falho chega
    // como a:'false' b:'true'; um `check(x)` falho como a:'false' b:undefined. Nos dois, a
    // expressão já está no lineCode e `received: false` não acrescenta nada.
    const comExpected = { state: 'failed', a: 'false', b: 'true', lineCode: "check(x.includes('┌'), true)", address: 'f.js:012' }
    const o1 = strip(checkView(comExpected, { width: 80 }))
    check(o1.includes('received'), false, 'sem `received:` no `check(x, true)`')
    check(o1.includes('expected'), false, 'sem `expected:` no `check(x, true)`')
    check(o1.includes("check(x.includes('┌'), true)"), true, 'a linha-fonte fica')

    const umArg = { state: 'failed', a: 'false', lineCode: 'check(a === b)', address: 'f.js:007' }
    const o2 = strip(checkView(umArg, { width: 80 }))
    check(o2.includes('received'), false, 'sem `received: false` no check de 1 arg')
    check(o2.includes('check(a === b)'), true, 'a linha-fonte fica')

    // mas `received: 0` / `null` / string carregam informação — continuam
    const falsyReal = { state: 'failed', a: '0', lineCode: 'check(count)', address: 'f.js:009' }
    check(strip(checkView(falsyReal, { width: 80 })).includes('received: 0'), true,
      '`received: 0` não é trivial — aparece')
  })

  test('checkView mantém o par quando o valor é informação', ({ check }) => {
    const real = { state: 'failed', a: '4', b: '5', lineCode: 'check(2 + 2, 5)', address: 'f.js:003' }
    const out = strip(checkView(real, { width: 80 }))
    check(out.includes('received: 4'), true)
    check(out.includes('expected: 5'), true)
  })

  test('checkView combina received/expected numa linha quando cabem; separa quando estoura', ({ check }) => {
    const curto = { state: 'failed', a: '1', b: '2', lineCode: 'check(1, 2)', address: 'f.js:003' }
    const o1 = strip(checkView(curto, { width: 80 }))
    check(/received: 1 {2}expected: 2/.test(o1), true, 'valores curtos → uma linha, 2 espaços')
    check(o1.split('\n').filter(l => l.includes('received') || l.includes('expected')).length, 1,
      'uma linha só para o par')

    const longo = { state: 'failed', a: 'x'.repeat(40), b: 'y'.repeat(40), lineCode: 'check(a, b)', address: 'f.js:003' }
    const o2 = strip(checkView(longo, { width: 60 }))
    check(o2.split('\n').filter(l => l.includes('received') || l.includes('expected')).length, 2,
      'não cabe em 60 → volta às duas linhas')
  })

  test('compactFails — só os vermelhos, só o número de falhas', ({ check }) => {
    const main = { tests: [
      { name: 'a.eval.js', state: 'passed', _cached: true, checkCount: 3, failCount: 0 },
      { name: 'b.eval.js', state: 'failed', _cached: true, checkCount: 2, failCount: 2 },
      { name: 'c.eval.js', state: 'failed', _cached: true, checkCount: 0, failCount: 1 },
    ] }
    const out = strip(compactFails(main, { width: 200 }))
    check(out.includes('a.eval.js'), false, 'o verde RÁPIDO não aparece')
    check(/b\.eval\.js ✘2/.test(out), true, 'b: só ✘2, sem ✔2')
    check(/c\.eval\.js ✘1/.test(out), true)
    check(out.includes('✔'), false, 'nenhum ✔ no log compacto')
  })

  test('compactFails — hog verde: SÓ com `hogs:true` (o `--hogs`); sem o flag, silêncio', ({ check }) => {
    // O TOTAL de hogs sempre aparece no `(Ns 🐢M)` da linha-título (`phaseLine`). O detalhe
    // POR ARQUIVO é uma leitura à parte: só sob `--hogs`. Sem o flag, um `unit` todo verde
    // (mesmo lento) não puxa NENHUMA linha de detalhe — o `compactFails` volta vazio.
    const main = { tests: [
      { name: 'fast.t.js', state: 'passed', _cached: true, checkCount: 9, lastMs: 40 },
      { name: 'shell.t.js', state: 'passed', _cached: true, checkCount: 97, lastMs: 8637 },
    ] }
    check(compactFails(main, { width: 200 }), '', 'sem `hogs:true` → nada (o total mora no phaseLine)')

    const out = strip(compactFails(main, { width: 200, hogs: true }))
    check(out.includes('fast.t.js'), false, 'o verde rápido não aparece nem com o flag')
    check(out.includes('shell.t.js 🐢8'), true, 'com `--hogs`: badge = 🐢 + múltiplo do limiar (8637ms / 1000 → 🐢8)')
    check(out.includes('ms)'), false, 'nenhum `(Nms)` — só o badge')
    check(out.includes('✘'), false, 'nenhum ✘ — não há vermelho')
  })

  test('compactFails — arquivo abaixo de HOG_MS não carrega tempo nenhum', ({ check }) => {
    const main = { tests: [{ name: 'r.eval.js', state: 'failed', _cached: true, failCount: 2, lastMs: 340 }] }
    check(strip(compactFails(main, { width: 200 })), 'r.eval.js ✘2', 'só `nome ✘M`, zero tempo')
  })

  test('compactFails — vermelhos por inteiro, hogs cortados nos 5 + `+N more`', ({ check }) => {
    const reds = Array.from({ length: 6 }, (_, i) => ({
      name: `r${i}.eval.js`, state: 'failed', _cached: true, failCount: 1, lastMs: 100,
    }))
    const hogs = Array.from({ length: 9 }, (_, i) => ({
      name: `h${i}.eval.js`, state: 'passed', _cached: true, checkCount: 1, lastMs: 2000 + i * 100,
    }))
    const out = strip(compactFails({ tests: [...reds, ...hogs] }, { width: 200, hogs: true }))
    for (let i = 0; i < 6; i++) check(out.includes(`r${i}.eval.js ✘1`), true, `red ${i} listado (todos)`)
    const hogShown = out.match(/h\d\.eval\.js 🐢\d+/g) || []
    check(hogShown.length, 5, 'só os 5 hogs mais lentos, cada um com badge 🐢N (múltiplo do limiar)')
    check(out.includes('h8.eval.js 🐢'), true, 'o mais lento (h8, 2800ms) está entre os 5')
    check(out.includes('h0.eval.js 🐢'), false, 'o menos lento (h0) foi para o `+N more`')
    check(/\+4 more 🐢/.test(out), true, '9 hogs − 5 = +4 more 🐢')
  })

  test('compactFails — reds e hogs em grupos, hog começa em linha nova (com `--hogs`)', ({ check }) => {
    const main = { tests: [
      { name: 'r.eval.js', state: 'failed', _cached: true, failCount: 1, lastMs: 50 },
      { name: 'h.eval.js', state: 'passed', _cached: true, checkCount: 1, lastMs: 3000 },
    ] }
    // Sem o flag: só o grupo de vermelhos. O hog verde some (o total já está no phaseLine).
    check(strip(compactFails(main, { width: 200 })), 'r.eval.js ✘1', 'sem `--hogs`: só o vermelho')

    const rows = strip(compactFails(main, { width: 200, hogs: true })).split('\n')
    check(rows.length, 2, 'com `--hogs`: duas linhas — uma por grupo')
    check(rows[0].includes('r.eval.js ✘1') && !rows[0].includes('h.eval.js'), true, 'linha 1 = só reds')
    check(rows[1].includes('h.eval.js 🐢3'), true, 'linha 2 = hogs, badge 🐢N (3000ms / 1000 → 🐢3)')
  })

  test('compactFails — um vermelho que TAMBÉM é hog: `nome 🐢N ✘M`', ({ check }) => {
    const main = { tests: [
      { name: 'quick.eval.js', state: 'failed', _cached: true, failCount: 1, lastMs: 80 },
      { name: 'slow.eval.js',  state: 'failed', _cached: true, failCount: 2, lastMs: 10064 },
    ] }
    const out = strip(compactFails(main, { width: 200 }))
    check(out.includes('quick.eval.js ✘1'), true, 'abaixo de hogMs(): só ✘1, sem tempo')
    check(out.includes('quick.eval.js ✘1 '), false, 'nada depois do ✘1')
    check(out.includes('slow.eval.js 🐢10 ✘2'), true, 'hog vermelho ganha o badge 🐢N (10064ms / 1000 → 🐢10)')
  })

  test('fileReportSpan — ordem canônica dos badges: 🐢 💥 ✘ ✔', ({ check }) => {
    // Um arquivo cacheado com hog + exceção + falha + passados. `checks:false` → sem ✔.
    const t = { name: 'x.t.js', state: 'failed', _cached: true, lastMs: 3200, excCount: 1, failCount: 2, checkCount: 9 }
    check(strip(fileReportSpan(t)), 'x.t.js 🐢3 💥1 ✘2', 'sem checks: 🐢 (3200/1000) 💥 ✘, nessa ordem')
    check(strip(fileReportSpan(t, { checks: true })), 'x.t.js 🐢3 💥1 ✘2 ✔9', 'com checks: ✔ por último')

    // sem delta `%` em lugar nenhum — `prevMs` é ignorado
    const reran = { tests: [{ name: 'h.eval.js', state: 'failed', failCount: 1, lastMs: 6000, prevMs: 10000 }] }
    check(strip(compactFails(reran, { width: 200 })).includes('%'), false, 'nunca mais `%` de variação')
    check(strip(compactFails(reran, { width: 200 })), 'h.eval.js 🐢6 ✘1', 'hog vermelho: 🐢 antes de ✘')

    // arquivo verde e rápido, sem checks → só o nome
    check(strip(fileReportSpan({ name: 'q.t.js', state: 'passed', _cached: true, checkCount: 3, lastMs: 20 })), 'q.t.js', 'verde rápido, checks off → só o nome')
  })

  test('compactFails — vazio quando tudo passou E nada é hog', ({ check }) => {
    const main = { tests: [{ name: 'a.eval.js', state: 'passed', _cached: true, checkCount: 1, lastMs: 40 }] }
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

  test('hogMs — o limiar de hog é `globalThis.utestHogMs`, senão o `HOG_MS` default', ({ check }) => {
    check(hogMs(), HOG_MS, 'sem override → HOG_MS (1000)')
    try {
      globalThis.utestHogMs = 100
      check(hogMs(), 100, '`--hogs 100` (via globalThis) → 100')
    } finally {
      delete globalThis.utestHogMs
    }
    check(hogMs(), HOG_MS, 'limpo → volta ao default')
  })

  test('compactFails — o limiar move: `--hogs 100` pega arquivos que 1000 não pegava, badge = múltiplo de 100', ({ check }) => {
    const main = { tests: [
      { name: 'quick.t.js',  state: 'passed', _cached: true, checkCount: 5, lastMs: 60 },
      { name: 'mid.t.js',    state: 'passed', _cached: true, checkCount: 9, lastMs: 450 },
      { name: 'slow.t.js',   state: 'passed', _cached: true, checkCount: 3, lastMs: 2300 },
    ] }
    // Limiar default (1000): só `slow.t.js` é hog.
    const d = strip(compactFails(main, { width: 200, hogs: true }))
    check(d.includes('slow.t.js 🐢2'), true, 'default: slow (2300ms / 1000 → 🐢2)')
    check(d.includes('mid.t.js'), false, 'default: mid (450ms) não é hog')

    try {
      globalThis.utestHogMs = 100
      const o = strip(compactFails(main, { width: 200, hogs: true }))
      check(o.includes('mid.t.js 🐢4'), true, '`--hogs 100`: mid entra, 450 / 100 → 🐢4')
      check(o.includes('slow.t.js 🐢23'), true, '`--hogs 100`: slow vira 2300 / 100 → 🐢23')
      check(o.includes('quick.t.js'), false, '60ms < 100 → ainda não é hog')
    } finally {
      delete globalThis.utestHogMs
    }
  })

  test('hogBadge — mínimo 1: um arquivo mal acima do limiar não mostra 🐢0', ({ check }) => {
    try {
      globalThis.utestHogMs = 1000
      const main = { tests: [{ name: 'edge.t.js', state: 'failed', _cached: true, failCount: 1, lastMs: 1001 }] }
      check(strip(compactFails(main, { width: 200 })).includes('edge.t.js 🐢1 ✘1'), true, '1001ms → 🐢1, nunca 🐢0')
    } finally {
      delete globalThis.utestHogMs
    }
  })

  test('phaseLine — CAIXA ALTA, dotfill, ordem (Σs 🐢N) ✘N 📄🧪✔, borda à direita', ({ check }) => {
    // o parên é a SOMA do `lastMs` dos arquivos da fase EM SEGUNDOS (nunca ms, nunca parede)
    // + a contagem de hogs; vem PRIMEIRO no bloco direito, antes de `✘` e do `📄 🧪 ✔`.
    const main = { tests: [
      { name: 'x.t.js', state: 'passed', _cached: true, checkCount: 10, lastMs: 30000 },
      { name: 'y.t.js', state: 'failed', _cached: true, checkCount: 8, failCount: 2, lastMs: 12000 },
    ] }
    const raw = phaseLine(main, { width: 80, title: 'unit' })
    const out = strip(raw)
    check(out.includes('UNIT'), true, 'nome em caixa alta')
    check(out.includes('.....'), true, 'dotfill')
    check(out.includes('(42s 🐢42)'), true, '42s totais, 42s deles em hogs')
    check(out.indexOf('(42s') < out.indexOf('✘2'), true, '(Σs) vem antes de ✘')
    check(out.indexOf('✘2') < out.indexOf('📄'), true, '✘ vem antes de 📄')
    check(out.includes('ms'), false, 'nenhum `ms` na linha-título — só segundos')
    check(/✔\d+\s*$/.test(out), true, 'termina no ✔N (bloco fixo à direita)')
    check(out.split('\n').length, 1, 'uma linha só')
    check(/\x1b\[4[0-8]/.test(raw), false, 'sem cor de FUNDO')
  })

  test('phaseLine — sem hog, o parén é só `(Ns)` — nenhum 🐢', ({ check }) => {
    const fast = { tests: [{ name: 'a.t.js', state: 'passed', _cached: true, checkCount: 3, lastMs: 300 }] }
    const out = strip(phaseLine(fast, { width: 80, title: 'x' }))
    check(out.includes('(0s)'), true, '300ms → 0s totais, zero em hogs')
    check(out.includes('🐢'), false, 'sem hog → sem 🐢 no parén')
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
    const out = strip(phaseLine(sum, { title: '', ms: 90000, files: 50, hogSecs: 50, bare: true }))
    check(out.includes('..'), false, 'sem dotfill')
    check(out.startsWith('(90s 🐢50)'), true, 'começa no (Σs 🐢N) — 90000ms → 90s, hogSecs passado explícito')
    check(out.includes('ms'), false, 'nenhum ms')
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

  test('failInfo — { line, code } de um check falho', ({ check }) => {
    const c = { state: 'failed', address: 'f.js:012', lineCode: '  check(a, b)  ' }
    check(failInfo(c).line, 'f.js:012')
    check(failInfo(c).code, 'check(a, b)', 'trim')
  })

  test('fullView — o kind não muda o formato: só o rótulo da linha-título', ({ check }) => {
    // Do ponto de vista do runner, `unit`/`eval`/`int`/`tui` são a MESMA coisa a
    // renderizar — `fullView` só troca o `title`. Mesma árvore, dois títulos → saída
    // idêntica a menos do nome da fase.
    const mk = () => ({ tests: [
      { name: 'a', state: 'passed', _cached: true, checkCount: 3, lastMs: 20 },
      { name: 'b', state: 'failed', _cached: true, checkCount: 1, failCount: 2, lastMs: 1200 },
    ] })
    const asUnit = strip(fullView(mk(), { verbosity: 1, width: 80, title: 'unit' }))
    const asEval = strip(fullView(mk(), { verbosity: 1, width: 80, title: 'eval' }))
    check(asUnit.replace(/UNIT/g, 'X'), asEval.replace(/EVAL/g, 'X'),
      'trocado o rótulo, o resto é byte-a-byte igual')
    check(asUnit.includes('b 🐢1 ✘2'), true, 'o vermelho-hog (1200ms) ganha o badge 🐢1 em qualquer kind')
    check(asUnit.includes('received'), false, 'nenhum log/checkView num relatório amplo')
  })

  test('fullView v1 — fase toda verde (mesmo com hog): UMA linha, só o phaseLine', ({ check }) => {
    // Contrato: sem vermelho e sem `--hogs`, o v1 é uma linha por fase. O total de hogs já
    // está no `(Ns 🐢M)` do phaseLine; o detalhe por arquivo é leitura à parte (`--hogs`).
    const greenWithHog = { tests: [
      { name: 'fast.t.js', state: 'passed', _cached: true, checkCount: 9, lastMs: 30 },
      { name: 'shell.t.js', state: 'passed', _cached: true, checkCount: 97, lastMs: 8600 },
    ] }
    const out = strip(fullView(greenWithHog, { verbosity: 1, width: 80, title: 'unit' }))
    check(out.split('\n').filter(Boolean).length, 1, 'uma linha só — sem bloco de detalhe')
    check(out.includes('🐢8'), true, 'o TOTAL de hogs na linha-título = Σ dos multiplicadores 🐢 dos arquivos (8600ms → 🐢8)')
    check(out.includes('shell.t.js'), false, 'nenhum nome de arquivo — o detalhe é do `--hogs`')

    // Com `hogs:true`, o detalhe por arquivo volta.
    const withFlag = strip(fullView(greenWithHog, { verbosity: 1, width: 80, title: 'unit', hogs: true }))
    check(withFlag.split('\n').filter(Boolean).length >= 2, true, 'com o flag: título + detalhe')
    check(withFlag.includes('shell.t.js 🐢8'), true, 'o hog aparece no bloco com badge 🐢N (8600ms / 1000 → 🐢8)')
  })

  test('a régua é em COLUNAS de terminal, não em unidades UTF-16', ({ check }) => {
    // `'🐢'.length` é 2 (par surrogado) para 2 colunas; `'✔'.length` é 1 para 1 coluna. O
    // que quebra a conta é o emoji com seletor de variação/ZWJ, onde `.length` conta 3-5
    // para as mesmas 2 colunas.
    check(displayLen('abc'), 3)
    check(displayLen('🐢'), 2, 'emoji ocupa 2 colunas')
    check(displayLen('✔'), 1, 'o check ocupa 1')
    check(displayLen('\x1b[32m✔\x1b[39m'), 1, 'ANSI não conta')
    check(displayLen('📄9 🧪133 ✔326'), 14)
  })

  test('fileLine cabe na largura pedida — o glifo não estoura a régua', ({ check }) => {
    // A barra de título era medida com `.length`, e o `-v:2` ainda somava 2 de indentação
    // por fora: cada linha de arquivo saía 2 colunas além da régua do relatório.
    const t = { name: 'x.t.js', state: 'failed', checkCount: 97, failCount: 3, lastMs: 2400 }
    for (const w of [40, 60, 80, 120]) {
      check(displayLen(fileLine(t, { width: w })), w, `fileLine bate ${w} colunas exatas`)
    }
  })

  test('fullView v2 — nenhuma linha passa da régua, contando a indentação do chamador', ({ check }) => {
    const main = { tests: [
      { name: 'a.t.js', state: 'passed', _cached: true, checkCount: 97, lastMs: 2400 },
      { name: 'b.eval.js', state: 'failed', _cached: true, checkCount: 3, failCount: 2, lastMs: 80 },
    ] }
    const out = fullView(main, { verbosity: 2, width: 80, title: 'unit' })
    // O chamador indenta 2 tudo que vem SOB a linha-título — é contra isso que a conta tem
    // que fechar, não contra a linha crua.
    const [head, ...rest] = out.split('\n')
    check(displayLen(head) <= 80, true, 'a linha-título cabe')
    for (const l of rest.filter(Boolean))
      check(displayLen('  ' + l) <= 80, true, `cabe já indentada: ${strip(l).slice(0, 30)}`)
  })

  test('o vermelho cacheado se redesenha na largura de AGORA', ({ check }) => {
    // O storage guarda o DADO do check, não a linha pronta: gravar formatado congelava a
    // largura do terminal daquele run, e o replay estourava (ou encolhia) a régua depois.
    const cached = { name: 'x.eval.js', state: 'failed', _cached: true, checkCount: 0, failCount: 1,
      _failLines: [{ state: 'failed', lineCode: "check(alguma.expressao.bem.longa.que.nao.cabe(), 'valor')",
        address: 'plans/5-apps/5.28-2-um-nome-de-feature-comprido.eval.js:110' }] }
    for (const w of [60, 80, 140]) {
      const out = failLines(cached, { width: w })
      check(out.length, 1, `${w}: uma linha`)
      check(displayLen(out[0]) <= w, true, `${w}: cabe na régua de agora`)
    }
    // E o conteúdo sobrevive aos dois cortes: o começo do código e o fim do endereço.
    const wide = strip(failLines(cached, { width: 200 })[0])
    check(wide.includes('check(alguma.expressao'), true, 'o código aparece')
    check(wide.includes(':110'), true, 'a linha do endereço aparece')
  })

  test('uma linha pré-formatada de um results.json antigo é ignorada, não quebra', ({ check }) => {
    const legado = { name: 'x.eval.js', state: 'failed', _cached: true, _failLines: ['✘ linha já pronta'] }
    check(failLines(legado, { width: 80 }), [], 'string no lugar do dado não vira render')
  })

  test('fullView v2 — todo arquivo verde aparece, num rio contínuo sem dotfill', ({ check }) => {
    // O `-v:1` só fala de quem pede atenção (vermelho/hog). O `-v:2` mostra TODO arquivo,
    // mas um PASSADO não paga o custo de uma linha própria (dotfill + tempo) — isso é
    // ruído numa suíte grande. Os verdes viram um rio contínuo, do mais caro pro mais
    // barato, `nome ✔N` separado por dois espaços, sem quebra de linha entre arquivos e
    // sem tempo individual (o tempo agregado já está na linha-título da fase).
    const main = { tests: [
      { name: 'rapido.t.js', state: 'passed', _cached: true, checkCount: 5,  lastMs: 3 },
      { name: 'lento.t.js',  state: 'passed', _cached: true, checkCount: 20, lastMs: 240 },
    ] }
    const out = strip(fullView(main, { verbosity: 2, width: 80, title: 'unit' }))
    check(out.includes('lento.t.js'), true, 'o arquivo verde aparece — v2 não é só vermelho')
    check(out.includes('rapido.t.js'), true)
    check(out.includes('(240ms)'), false, 'passado não carrega tempo individual — dotfill some')
    const lines = out.split('\n').filter(Boolean)
    check(lines.length, 2, 'linha-título + UMA linha-rio com os dois verdes')
    check(lines[1].indexOf('lento.t.js') < lines[1].indexOf('rapido.t.js'), true, 'o mais caro vem primeiro')
    check(lines[1].includes('lento.t.js ✔20'), true, 'nome + contagem, sem dotfill por arquivo')
  })

  test('fullView v2 — escopo estreito: compacta + linha do erro + endereço, SEM log()', ({ check }) => {
    // `-v:2` (o nível que uma FRENTE/FEATURE assume) mostra, por baixo de cada vermelho, a
    // linha do check e o `f.js:NN` do stack — mas NÃO o `log()` do teste (isso é `-v:3`).
    const main = { tests: [{
      name: 'x.eval.js', state: 'failed', address: 'x.eval.js',
      output: [['log', ['saída engolida no v2']]],
      checks: [], duration: 40,
      tests: [{
        name: 'passo', state: 'failed', output: [['log', ['saída engolida no v2']]],
        checks: [{ state: 'failed', a: '4', b: '5', lineCode: 'check(2 + 2, 5)', address: 'x.eval.js:012' }],
        tests: [],
      }],
    }] }
    const out = strip(fullView(main, { verbosity: 2, width: 80, title: 'eval' }))
    check(/x\.eval\.js .*✘1/.test(out), true, 'a barra de título do arquivo, com a contagem')
    check(out.includes('check(2 + 2, 5)'), true, 'a linha do check aparece')
    check(out.includes('x.eval.js:012'), true, 'o endereço do stack aparece')
    check(out.includes('saída engolida'), false, 'o log() do teste NÃO aparece no v2')
  })

  test('fullView v2 — passados no rio, falhos no bloco cheio (fileLine + checkView)', ({ check }) => {
    const main = { tests: [
      { name: 'ok-a.t.js', state: 'passed', _cached: true, checkCount: 5, lastMs: 3 },
      { name: 'ok-b.t.js', state: 'passed', _cached: true, checkCount: 9, lastMs: 7 },
      {
        name: 'red.eval.js', state: 'failed', address: 'red.eval.js', lastMs: 80,
        checks: [{ state: 'failed', a: '4', b: '5', lineCode: 'check(2 + 2, 5)', address: 'red.eval.js:012' }],
        tests: [],
      },
    ] }
    const out = strip(fullView(main, { verbosity: 2, width: 80, title: 'eval' }))
    const lines = out.split('\n').filter(Boolean)
    check(lines[1].includes('ok-a.t.js ✔5') && lines[1].includes('ok-b.t.js ✔9'), true,
      'os dois verdes na MESMA linha-rio, sem o vermelho misturado')
    check(lines[1].includes('red.eval.js'), false, 'o falho não entra no rio dos passados')
    check(out.includes('check(2 + 2, 5)'), true, 'o falho mostra a linha do check')
    check(out.includes('received: 4') && out.includes('expected: 5'), true, 'received/expected inteiros')
    check(out.includes('red.eval.js:012'), true, 'o endereço (caller line) aparece')
  })

  test('fullView v2 — só vermelho: sem linha-rio (nenhum arquivo passado para listar)', ({ check }) => {
    const main = { tests: [{
      name: 'red.eval.js', state: 'failed', address: 'red.eval.js', lastMs: 10,
      checks: [{ state: 'failed', lineCode: 'check(a)', address: 'red.eval.js:009' }], tests: [],
    }] }
    const out = strip(fullView(main, { verbosity: 2, width: 80, title: 'eval' }))
    const lines = out.split('\n').filter(Boolean)
    check(lines.length, 3, 'título + fileLine do falho + a linha do check — sem linha-rio entre elas')
    check(lines[1].startsWith('red.eval.js'), true, 'logo após o título já vem o bloco do falho')
  })

  test('fullView v2 — vermelhos ordenados do mais lento pro menos (igual ao bloco compacto)', ({ check }) => {
    const main = { tests: [
      { name: 'slow.eval.js', state: 'failed', address: 'slow.eval.js', lastMs: 5000,
        checks: [{ state: 'failed', lineCode: 'check(a)', address: 'slow.eval.js:009' }], tests: [] },
      { name: 'fast.eval.js', state: 'failed', address: 'fast.eval.js', lastMs: 50,
        checks: [{ state: 'failed', lineCode: 'check(b)', address: 'fast.eval.js:009' }], tests: [] },
    ] }
    const out = strip(fullView(main, { verbosity: 2, width: 80, title: 'eval' }))
    check(out.indexOf('slow.eval.js:009') < out.indexOf('fast.eval.js:009'), true,
      'slow (5s) detalha antes de fast (50ms)')
  })

  // ─── contrato de saída por verbosidade — a matriz que o usuário lê ─────────
  // Uma fixture única (verde, vermelho de 2-args, exceção, hog verde, hog+vermelho,
  // `output` no verde e no vermelho) rodada nos 4 níveis, para travar o que aparece e o
  // que some em CADA um. Sem isto, uma regressão de report só é pega pelo olho.
  const fixture = () => ({ tests: [
    { name: 'green.t.js', state: 'passed', _cached: true, checkCount: 12, lastMs: 20,
      output: [['log', ['ruído do verde']]] },
    { name: 'red.eval.js', state: 'failed', address: 'red.eval.js', lastMs: 60,
      output: [['log', ['contexto do vermelho']]],
      checks: [{ state: 'failed', a: '4', b: '5', lineCode: 'check(2 + 2, 5)', address: 'red.eval.js:012' }],
      tests: [{ name: 'passo', state: 'failed',
        output: [['log', ['contexto do vermelho']]],
        checks: [{ state: 'failed', a: '4', b: '5', lineCode: 'check(2 + 2, 5)', address: 'red.eval.js:012' }],
        tests: [] }] },
    { name: 'boom.t.js', state: 'exception', address: 'boom.t.js', lastMs: 15,
      error: { message: 'algo explodiu', stack: 'Error: algo explodiu\n    at fn (boom.t.js:7:3)' },
      checks: [], tests: [] },
    { name: 'slowgreen.t.js', state: 'passed', _cached: true, checkCount: 3, lastMs: 4200 },
    { name: 'slowred.eval.js', state: 'failed', address: 'slowred.eval.js', lastMs: 9100,
      checks: [{ state: 'failed', a: '1', b: '2', lineCode: 'check(x, 2)', address: 'slowred.eval.js:030' }],
      tests: [] },
  ] })

  test('v0 — suíte com vermelho: NÃO fica em branco (só cala se 100% verde)', ({ check }) => {
    const dirty = strip(fullView(fixture(), { verbosity: 0, width: 100, title: 'unit' }))
    check(dirty.length > 0, true, 'há vermelho → v0 rende (cai para o formato do v1)')
    check(dirty.includes('UNIT'), true, 'a linha-título aparece')

    const clean = fullView({ tests: [{ name: 'a.t.js', state: 'passed', _cached: true, checkCount: 2, lastMs: 5 }] },
      { verbosity: 0, width: 100, title: 'unit' })
    check(clean, '', 'v0 + tudo verde = string vazia (o silêncio do v0)')
  })

  test('v1 — título + compactFails(só vermelho/exceção); hog verde NÃO puxa linha', ({ check }) => {
    const out = strip(fullView(fixture(), { verbosity: 1, width: 100, title: 'unit' }))
    check(out.includes('UNIT'), true, 'linha-título')
    check(/red\.eval\.js ✘2/.test(out), true, 'o vermelho, com contagem (1 check + 1 aninhado idêntico)')
    check(/slowred\.eval\.js 🐢9 ✘1/.test(out), true, 'vermelho que é hog: badge 🐢N (9100ms / 1000 → 🐢9)')
    check(out.includes('boom.t.js'), true, 'a exceção também é listada')
    check(out.includes('slowgreen.t.js'), false, 'o hog VERDE não aparece (só no --hogs)')
    check(out.includes('received:'), false, 'nenhum checkView num relatório amplo v1')
    check(out.includes('ruído do verde'), false, 'nenhum log() do teste em v1')
    check(out.includes('🐢'), true, 'o total de hogs está na linha-título')
  })

  test('v1 --hogs — o detalhe por arquivo do hog verde volta', ({ check }) => {
    const out = strip(fullView(fixture(), { verbosity: 1, width: 100, title: 'unit', hogs: true }))
    check(out.includes('slowgreen.t.js 🐢4'), true, 'o hog verde ganha a linha (4200ms / 1000 → 🐢4)')
    check(/slowred\.eval\.js 🐢9 ✘1/.test(out), true, 'o hog vermelho segue com ✘ e badge 🐢N')
  })

  test('v2 — verdes num rio, cada vermelho vira fileLine + checkView (received/expected), sem log()', ({ check }) => {
    const out = strip(fullView(fixture(), { verbosity: 2, width: 100, title: 'unit' }))
    check(out.includes('green.t.js ✔12'), true, 'o verde no rio, com contagem')
    check(out.includes('slowgreen.t.js 🐢4 ✔3'), true, 'o hog verde entra no rio dos passados, com o 🐢 sticky antes do ✔')
    check(out.includes('check(2 + 2, 5)'), true, 'a linha do check do vermelho')
    check(out.includes('received: 4') && out.includes('expected: 5'), true, 'o par inteiro em v2')
    check(out.includes('red.eval.js:012'), true, 'o endereço (caller line)')
    check(out.includes('algo explodiu'), true, 'a mensagem da exceção')
    check(out.includes('contexto do vermelho'), false, 'o log() do teste é do v3, não do v2')
  })

  test('v3 — a árvore por teste + o log() capturado sob o vermelho', ({ check }) => {
    const out = strip(fullView(fixture(), { verbosity: 3, width: 100, title: 'unit' }))
    check(out.includes('passo'), true, 'o nó filho do vermelho aparece (árvore por teste)')
    check(out.includes('[log] contexto do vermelho'), true, 'o console capturado sob o vermelho')
    check(out.includes('received: 4') && out.includes('expected: 5'), true, 'o par segue em v3')
    // v3 é o nível "mostre tudo": o `log()` de um teste que PASSOU também aparece (só v1/v2
    // é que engolem o output do verde).
    check(out.includes('[log] ruído do verde'), true, 'em v3 até o log() do verde aparece')
  })

  test('--json — failData persiste o par + lineCode + address para o re-render frio', ({ check }) => {
    const red = fixture().tests[1]
    const [d] = failData(red)
    check(d.state, 'failed')
    check(d.a, '4', 'received cru')
    check(d.b, '5', 'expected cru')
    check(d.lineCode, 'check(2 + 2, 5)', 'a linha-fonte')
    check(d.address, 'red.eval.js:012', 'o endereço')

    // failData de uma exceção guarda message + stack (para o errorView redesenhar)
    const [ex] = failData(fixture().tests[2])
    check(ex.state, 'exception')
    check(ex.error.message, 'algo explodiu')
    check(ex.error.stack.includes('boom.t.js:7:3'), true, 'o stack sobrevive')
  })

  test('--json — failInfo devolve { line, code } de um check, trim no code', ({ check }) => {
    const c = { state: 'failed', address: 'x.js:009', lineCode: '  check(a, b)  ' }
    check(failInfo(c).line, 'x.js:009')
    check(failInfo(c).code, 'check(a, b)')
  })

  test('checkView — re-render FRIO (só o dado de failData, sem `error` vivo) mantém o par e o endereço', ({ check }) => {
    // O caminho do `--watch` / cache: `_failLines` traz objetos de `failData`, sem o
    // `error`. `checkView` tem que rieprodzir a mesma linha a partir deles.
    const cached = { name: 'x.eval.js', state: 'failed', _cached: true, failCount: 1,
      _failLines: [{ state: 'failed', a: '4', b: '5', lineCode: 'check(2 + 2, 5)', address: 'x.eval.js:012' }] }
    const [block] = failLines(cached, { width: 100 })
    const out = strip(block)
    check(out.includes('check(2 + 2, 5)'), true, 'a linha-fonte no frio')
    check(out.includes('received: 4'), true, 'received no frio')
    check(out.includes('expected: 5'), true, 'expected no frio')
    check(out.includes('x.eval.js:012'), true, 'o endereço no frio')
  })

  test('checkView — sem `error`, sem `lineCode` e sem `address`: degrada em `check()` mas NÃO some', ({ check }) => {
    // A rede: mesmo no pior caso (o `callstack` devolveu pilha vazia, nada foi persistido),
    // o vermelho ainda rende — o par que `check.js` gravou não pode sumir.
    const bare = { state: 'failed', a: 'true', b: 'false' }
    const out = strip(checkView(bare, { width: 80 }))
    check(out.includes('check()'), true, 'cai no literal `check()`')
    check(out.includes('received: true'), true, 'received continua')
    check(out.includes('expected: false'), true, 'expected continua')
  })

  // ── Escopo de UM arquivo: a saída seca (sprint 019) ──────────────────────────
  // O render de arquivo-único mora no bloco de dispatch de `utest.js`, não numa fn de
  // `viewer.js` — então estes casos spawnam o runner de verdade contra um `.t.js` scratch.
  test('escopo de arquivo VERDE → uma linha seca `✔N (Wms)`, sem phaseLine nem nome', ({ check }) => {
    const { mkdtempSync, writeFileSync, rmSync } = require('fs')
    const { join } = require('path')
    const { tmpdir } = require('os')
    const dir = mkdtempSync(join(tmpdir(), 'uview-file-'))
    writeFileSync(join(dir, 'TEST.yaml'), 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n')
    writeFileSync(join(dir, 'ok.js'), 'export const n = 2\n')
    writeFileSync(join(dir, 'ok.t.js'),
      "import { n } from './ok.js'\ntest('soma', ({ check }) => { check(n + n, 4); check(n, 2) })\n")
    const r = Bun.spawnSync({
      cmd: ['bun', join(import.meta.dir, 'utest.js'), 'ok.t.js'],
      cwd: dir, env: { ...process.env }, stdout: 'pipe', stderr: 'pipe',
    })
    const out = strip(r.stdout.toString()).trim()
    rmSync(dir, { recursive: true, force: true })
    check(/^✔2 \(\d+ms\)$/.test(out), true, `uma linha só, ✔2 e tempo: ${JSON.stringify(out)}`)
    check(out.includes('unit:'), false, 'sem a phaseLine da fase')
    check(out.includes('ok.t.js'), false, 'sem o nome do arquivo')
    check(out.includes('---'), false, 'sem o dotfill da entryLine')
  })

  test('escopo de arquivo com FALHA → direto no arquivo: fileLine + checkView, sem frame/tip/coverage', ({ check }) => {
    const { mkdtempSync, writeFileSync, rmSync } = require('fs')
    const { join } = require('path')
    const { tmpdir } = require('os')
    const dir = mkdtempSync(join(tmpdir(), 'uview-file-'))
    writeFileSync(join(dir, 'TEST.yaml'), 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n')
    writeFileSync(join(dir, 'bad.t.js'),
      "test('erros', ({ check }) => {\n" +
      "  check(2 + 2, 5)\n" +
      "  check(1 === 2, true)\n" +
      "  check(() => { throw new Error('Boom!') })\n" +
      "})\n")
    const r = Bun.spawnSync({
      cmd: ['bun', join(import.meta.dir, 'utest.js'), 'bad.t.js'],
      cwd: dir, env: { ...process.env }, stdout: 'pipe', stderr: 'pipe',
    })
    const out = strip(r.stdout.toString())
    rmSync(dir, { recursive: true, force: true })
    // fileLine + os erros, nada de cabeçalho/rodapé
    check(/^bad\.t\.js .*✘/.test(out.trim()), true, `começa direto na barra do arquivo: ${JSON.stringify(out.split('\n')[0])}`)
    check(out.includes('utest results'), false, 'sem o cabeçalho `utest results`')
    check(out.includes('tip:'), false, 'sem a linha `tip:`')
    check(out.includes('coverage:'), false, 'sem a linha `coverage:`')
    check(out.includes('unit:'), false, 'sem a phaseLine `unit:`')
    check(out.includes('═'), false, 'sem o frame de réguas')
    // checkView: callerLine + par combinado
    check(out.includes('check(2 + 2, 5)'), true, 'o callerLine do check falho')
    check(/bad\.t\.js:0*2/.test(out), true, 'o endereço linha 2')
    check(/received: 4 {2}expected: 5/.test(out), true, 'received/expected combinados numa linha')
    // `check(1 === 2, true)` — o par trivial some
    check(out.includes('check(1 === 2, true)'), true, 'a linha-fonte do check(x, true) falho')
    check(/check\(1 === 2, true\)[\s\S]*?received: false/.test(out), false,
      'sem `received: false` quando o esperado era `true`')
    // a exceção: header + o endereço (o throw foi na própria linha do check → sem frame extra)
    check(out.includes('💥 Boom!'), true, 'o header da exceção')
    check(/bad\.t\.js:0*4/.test(out), true, 'o endereço da exceção')
  })

  test('`--hogs N` = modo laser — ZERO moldura, só os arquivos-hog + tip para --trace', ({ check }) => {
    const { mkdtempSync, writeFileSync, rmSync } = require('fs')
    const { join } = require('path')
    const { tmpdir } = require('os')
    const dir = mkdtempSync(join(tmpdir(), 'uview-hogs-'))
    writeFileSync(join(dir, 'TEST.yaml'), 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n')
    // um teste lento de propósito (>50ms) e um instantâneo
    writeFileSync(join(dir, 'slow.t.js'),
      "test('lento', ({ check }) => { const t = Date.now(); while (Date.now() - t < 90) {} check(1, 1) })\n")
    writeFileSync(join(dir, 'quick.t.js'), "test('rápido', ({ check }) => check(2, 2))\n")
    const run = (extra = []) => strip(Bun.spawnSync({
      cmd: ['bun', join(import.meta.dir, 'utest.js'), '.', '--hogs', '50', ...extra],
      cwd: dir, env: { ...process.env }, stdout: 'pipe', stderr: 'pipe',
    }).stdout.toString())

    const v1 = run()
    // ZERO moldura estrutural — nada de `─────`, `utest results`, phaseLine, `coverage:`
    check(v1.includes('utest results'), false, 'sem `utest results`')
    check(v1.includes('coverage:'), false, 'sem a linha `coverage:`')
    check(/─────/.test(v1), false, 'sem régua')
    check(/^UNIT /m.test(v1), false, 'sem phaseLine')
    // só o hog, com o badge sticky (busy-wait ~90ms / 50 → 🐢1 ou 🐢2)
    check(/slow\.t\.js 🐢\d+/.test(v1), true, `o hog com 🐢N sticky: ${JSON.stringify(v1.match(/slow\.t\.js[^\n]*/)?.[0])}`)
    check(v1.includes('quick.t.js'), false, 'o rápido (<50ms) não aparece')
    check(v1.includes('✔'), false, '`-v1`: só `nome 🐢N`, sem contagem de checks')
    // o tip guia para o --trace do mais lento
    check(/tip: run .*utest slow\.t\.js --trace/.test(v1), true, `tip aponta o --trace do mais lento: ${JSON.stringify(v1.match(/tip:[^\n]*/)?.[0])}`)

    // `-v2 --hogs` = os mesmos hogs + a contagem de checks
    const v2 = run(['-v2'])
    check(/slow\.t\.js 🐢\d+ ✔1/.test(v2), true, `-v2: \`nome 🐢N ✔P\`: ${JSON.stringify(v2.match(/slow\.t\.js[^\n]*/)?.[0])}`)
  })
})
