// A barra viva e o hyperlink do tip são a parte de 4.4 que é função pura. A barra
// é reescrita com `\r` a cada arquivo: se ela passar da largura, o terminal
// quebra a linha e o `\r` deixa um rastro de lixo em vez de sobrescrever.
//
// NB: `--watch` (re-rodar ao salvar, delta em vez de varredura) NÃO é coberto
// aqui — exige watcher e timing reais. Segue sendo verificação manual.
import { progressBar, link, visibleLen, displayLen } from './viewer.js'

test('progress', ({ test }) => {

  test('a barra nunca passa da largura pedida', ({ check }) => {
    for (const w of [40, 80, 120]) {
      const out = progressBar('unit', 3, 10, 'src/algum/arquivo.t.js', { width: w })
      check(displayLen(out) <= w, true, `largura ${w}: ${displayLen(out)} colunas`)
    }
  })

  test('o preenchimento acompanha done/total', ({ check }) => {
    const vazio = progressBar('unit', 0, 10, 'a.t.js')
    const meio  = progressBar('unit', 5, 10, 'a.t.js')
    const cheio = progressBar('unit', 10, 10, 'a.t.js')
    check((vazio.match(/█/g) || []).length, 0, 'em 0/10 nada está preenchido')
    check((meio.match(/█/g) || []).length, 10, 'em 5/10 metade dos 20 chars')
    check((cheio.match(/█/g) || []).length, 20, 'em 10/10 a barra inteira')
  })

  test('total 0 não divide por zero', ({ check }) => {
    const out = progressBar('unit', 0, 0, 'a.t.js')
    check((out.match(/█/g) || []).length, 0, 'barra vazia, sem NaN')
    check(/NaN/.test(out), false, 'nada de NaN na saída')
  })

  test('mostra a contagem done/total', ({ check }) => {
    const out = progressBar('unit', 3, 10, 'a.t.js')
    check(/3\/10/.test(out), true, `a contagem aparece: ${out}`)
  })

  test('o nome da fase aparece em maiúsculas', ({ check }) => {
    check(/UNIT/.test(progressBar('unit', 1, 2, 'a.t.js')), true, 'unit -> UNIT')
    check(/EVAL/.test(progressBar('eval', 1, 2, 'a.t.js')), true, 'eval -> EVAL')
  })

  test('um caminho longo é truncado pela ESQUERDA, preservando o fim', ({ check }) => {
    const longo = 'src/um/caminho/bem/longo/mesmo/que/nao/cabe/de/jeito/nenhum/arquivo.t.js'
    const out = progressBar('unit', 1, 2, longo, { width: 60 })
    check(displayLen(out) <= 60, true, 'ainda cabe na largura')
    // o dotfill ainda apara o final para encaixar a contagem, entao o que se
    // garante e que o TRECHO FINAL do caminho sobreviveu — nao o nome completo.
    check(/arquivo/.test(out), true, `o fim do caminho sobrevive: ${out}`)
    check(/…/.test(out), true, 'e a elisão é marcada')
  })

  test('sem arquivo não quebra', ({ check }) => {
    const out = progressBar('unit', 1, 2, null)
    check(/undefined|null/.test(out), false, `nada de undefined impresso: ${out}`)
  })

  test('link monta um OSC 8 com uri e texto', ({ check }) => {
    const out = link('file:///tmp/a.t.js', 'a.t.js')
    check(out.includes('file:///tmp/a.t.js'), true, 'a uri entra')
    check(out.includes('a.t.js'), true, 'o texto visível entra')
    check(out.startsWith('\x1b]8;;'), true, 'abre a sequência OSC 8')
    check(out.endsWith('\x1b]8;;\x07'), true, 'e a fecha')
  })

  test('o OSC 8 não conta para a largura visível', ({ check }) => {
    const out = link('file:///tmp/um/caminho/bem/longo.t.js', 'a.t.js')
    check(visibleLen(out), 6, 'só o texto conta — a uri é invisível na tela')
  })
})
