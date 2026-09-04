// viewer.t.js — o relatório compacto (sprint 084c): barra por fase, vermelhos numa
// linha, e o par `received: false / expected: true` que some.
import { phaseLine, phaseMs, progressBar, compactFails, checkView, failInfo, deltaTag, fullView, fileLine, displayLen, failLines } from './viewer.js'
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
    check(out.includes('a.eval.js'), false, 'o verde RÁPIDO não aparece')
    check(/b\.eval\.js ✘2/.test(out), true, 'b: só ✘2, sem ✔2')
    check(/c\.eval\.js ✘1/.test(out), true)
    check(out.includes('✔'), false, 'nenhum ✔ no log compacto')
  })

  test('compactFails — arquivo verde mas HOG entra como `nome 🐢N` (badge = segundos)', ({ check }) => {
    // o detalhe da fase é o mesmo para todo kind: um `unit` todo verde com hogs mostra os
    // hogs igual a como a `eval` mostra os vermelhos. O tempo é BADGE (segundos inteiros),
    // não `(Nms)` — a precisão de ms num cacheado não diz nada e custa tokens.
    const main = { tests: [
      { name: 'fast.t.js', state: 'passed', _cached: true, checkCount: 9, lastMs: 40 },
      { name: 'shell.t.js', state: 'passed', _cached: true, checkCount: 97, lastMs: 8637 },
    ] }
    const out = strip(compactFails(main, { width: 200 }))
    check(out.includes('fast.t.js'), false, 'o verde rápido não aparece — sem tempo, sem linha')
    check(out.includes('shell.t.js 🐢9'), true, 'badge = 🐢 + segundos (8637ms → 🐢9), sem sufixo')
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
    const out = strip(compactFails({ tests: [...reds, ...hogs] }, { width: 200 }))
    for (let i = 0; i < 6; i++) check(out.includes(`r${i}.eval.js ✘1`), true, `red ${i} listado (todos)`)
    const hogShown = out.match(/h\d\.eval\.js 🐢\d/g) || []
    check(hogShown.length, 5, 'só os 5 hogs mais lentos, cada um com badge 🐢N (segundos)')
    check(out.includes('h8.eval.js 🐢'), true, 'o mais lento (h8, 2800ms) está entre os 5')
    check(out.includes('h0.eval.js 🐢'), false, 'o menos lento (h0) foi para o `+N more`')
    check(/\+4 more 🐢/.test(out), true, '9 hogs − 5 = +4 more 🐢')
  })

  test('compactFails — reds e hogs em grupos, hog começa em linha nova', ({ check }) => {
    const main = { tests: [
      { name: 'r.eval.js', state: 'failed', _cached: true, failCount: 1, lastMs: 50 },
      { name: 'h.eval.js', state: 'passed', _cached: true, checkCount: 1, lastMs: 3000 },
    ] }
    const rows = strip(compactFails(main, { width: 200 })).split('\n')
    check(rows.length, 2, 'duas linhas — uma por grupo')
    check(rows[0].includes('r.eval.js ✘1') && !rows[0].includes('h.eval.js'), true, 'linha 1 = só reds')
    check(rows[1].includes('h.eval.js 🐢3'), true, 'linha 2 = hogs, com badge')
  })

  test('compactFails — um vermelho que TAMBÉM é hog: `nome ✘M 🐢N`', ({ check }) => {
    const main = { tests: [
      { name: 'quick.eval.js', state: 'failed', _cached: true, failCount: 1, lastMs: 80 },
      { name: 'slow.eval.js',  state: 'failed', _cached: true, failCount: 2, lastMs: 10064 },
    ] }
    const out = strip(compactFails(main, { width: 200 }))
    check(out.includes('quick.eval.js ✘1'), true, 'abaixo de HOG_MS: só ✘1, sem tempo')
    check(out.includes('quick.eval.js ✘1 '), false, 'nada depois do ✘1')
    check(out.includes('slow.eval.js ✘2 🐢10'), true, 'hog vermelho ganha o badge 🐢N')
  })

  test('compactFails — deltaTag SÓ para um HOG que re-rodou (recompensa ganho real)', ({ check }) => {
    // um teste rápido que re-rodou NÃO ganha `%` — 20% de 200ms é ruído de GC. Só um hog
    // (>HOG_MS) que re-rodou mostra a variação.
    const fastReran = { tests: [{ name: 'a.eval.js', state: 'failed', failCount: 1, lastMs: 200, prevMs: 100 }] }
    check(strip(compactFails(fastReran, { width: 200 })), 'a.eval.js ✘1', 'teste rápido re-rodou: sem tempo, sem %')

    const hogReran = { tests: [{ name: 'h.eval.js', state: 'failed', failCount: 1, lastMs: 6000, prevMs: 10000 }] }
    const out = strip(compactFails(hogReran, { width: 200 }))
    check(out.includes('h.eval.js ✘1 🐢6'), true, 'hog: badge 🐢6 = 6 segundos')
    check(out.includes('-40%'), true, 'hog re-rodou 40% mais rápido → -40% (ganho real, recompensado)')

    const hogCached = { tests: [{ name: 'h.eval.js', state: 'passed', _cached: true, checkCount: 1, lastMs: 6000 }] }
    check(strip(compactFails(hogCached, { width: 200 })).includes('%'), false, 'hog cacheado (sem prevMs): badge sem %')
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
    check(asUnit.includes('b ✘2 🐢1'), true, 'o vermelho-hog (1200ms) ganha o badge 🐢1 em qualquer kind')
    check(asUnit.includes('received'), false, 'nenhum log/checkView num relatório amplo')
  })

  test('fullView — fase toda verde COM hog tem bloco de detalhe, igual à fase com vermelho', ({ check }) => {
    // era ESTA a assimetria: `unit` todo verde com hogs colapsava na linha-título, `eval`
    // (com vermelho) tinha um bloco — pareciam kinds diferentes.
    const greenWithHog = { tests: [
      { name: 'fast.t.js', state: 'passed', _cached: true, checkCount: 9, lastMs: 30 },
      { name: 'shell.t.js', state: 'passed', _cached: true, checkCount: 97, lastMs: 8600 },
    ] }
    const out = strip(fullView(greenWithHog, { verbosity: 1, width: 80, title: 'unit' }))
    check(out.split('\n').length >= 2, true, 'linha-título + pelo menos uma linha de detalhe')
    check(out.includes('shell.t.js 🐢9'), true, 'o hog aparece no bloco com badge (8600ms → 9s)')
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
})
