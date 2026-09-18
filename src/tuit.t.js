// `.tuit` é o formato de regressão VISUAL: JSON parcial + a arte ASCII esperada.
// Um erro no parser desalinha bloco e arte, e o teste passa a comparar a coisa
// errada — falha que se parece com um bug de layout do app.
//
// `runTuitBlocks` depende de `pixel`/`soml` globais (bootados pelo projeto), então
// aqui se testa o PARSER, que é puro.
import { parseTuitText } from './tuit.js'

test('tuit', ({ test }) => {

  test('um bloco: objeto + arte até o fim', ({ check }) => {
    const b = parseTuitText("{ 'p Panel': {} }\nabc\ndef\n")
    check(b.length, 1, 'um bloco')
    check(b[0].expected, 'abc\ndef', 'a arte é o que vem depois do objeto')
  })

  test('front-matter --- é pulado', ({ check }) => {
    const b = parseTuitText("---\ntitle: x\n---\n{ 'p Panel': {} }\nabc\n")
    check(b.length, 1, 'o front-matter não vira bloco')
    check(b[0].expected, 'abc', 'a arte é lida normalmente')
  })

  test('// acima de um bloco vira o nome dele', ({ check }) => {
    const b = parseTuitText("// meu bloco\n{ 'p Panel': {} }\nabc\n")
    check(b[0].name, 'meu bloco', 'o comentário nomeia o bloco')
  })

  test('sem comentário, o nome é derivado do índice', ({ check }) => {
    const b = parseTuitText("{ 'a A': {} }\nx\n{ 'b B': {} }\ny\n")
    check(b[0].name, 'block-01', 'primeiro')
    check(b[1].name, 'block-02', 'segundo, com padding')
  })

  test('blocos múltiplos: cada arte vai até o próximo { ou //', ({ check }) => {
    const b = parseTuitText("{ 'a A': {} }\num\ndois\n{ 'b B': {} }\ntres\n")
    check(b.length, 2, 'dois blocos')
    check(b[0].expected, 'um\ndois', 'a arte do primeiro para no próximo objeto')
    check(b[1].expected, 'tres', 'a do segundo')
  })

  test('objeto multi-linha é juntado (chaves contadas fora de string)', ({ check }) => {
    const b = parseTuitText("{\n  'p Panel': {\n    w: 3,\n  },\n}\nabc\n")
    check(b.length, 1, 'o objeto quebrado em linhas é um bloco só')
    check(b[0].expected, 'abc', 'a arte começa depois do fecha-chaves')
  })

  test('chave dentro de string não confunde o balanceamento', ({ check }) => {
    const b = parseTuitText("{ 'p Panel': { t: '}' } }\nabc\n")
    check(b.length, 1, 'a } dentro da string não fecha o objeto')
    check(b[0].expected, 'abc', 'a arte é lida corretamente')
  })

  test('· é CONTEÚDO, não espaço de preenchimento', ({ check }) => {
    // Regressão: um trim que trate `·` como whitespace zera linhas de canvas
    // vazio inteiras (bug do runner arquivado, citado em tuit.js).
    const b = parseTuitText("{ 'p Panel': {} }\n···\n···\n")
    check(b[0].expected, '···\n···', 'as linhas de · sobrevivem inteiras')
  })

  test('espaço/tab no fim de linha é aparado', ({ check }) => {
    const b = parseTuitText("{ 'p Panel': {} }\nabc   \ndef\t\n")
    check(b[0].expected, 'abc\ndef', 'o trailing whitespace real sai')
  })

  test('linhas vazias nas pontas da arte são removidas', ({ check }) => {
    const b = parseTuitText("{ 'p Panel': {} }\n\nabc\n\n")
    check(b[0].expected, 'abc', 'sem linha vazia em cima nem embaixo')
  })

  test('o input é o objeto avaliado', ({ check }) => {
    const b = parseTuitText("{ 'p Panel': { w: 3 } }\nabc\n")
    check(b[0].input['p Panel'].w, 3, 'o literal vira objeto de verdade')
  })

  test('objectLine aponta a linha do objeto', ({ check }) => {
    const b = parseTuitText("// nome\n{ 'p Panel': {} }\nabc\n")
    check(b[0].objectLine, 2, 'a linha (1-based) onde o objeto começa')
  })

  test('texto vazio não produz bloco', ({ check }) => {
    check(parseTuitText('').length, 0, 'string vazia')
    check(parseTuitText(null).length, 0, 'null é tolerado')
  })

  test('objeto não fechado é erro explícito', ({ check, checkException }) => {
    checkException(() => parseTuitText("{ 'p Panel': {\nabc\n"),
      'objeto sem fechar avisa em vez de silenciar')
  })
})
