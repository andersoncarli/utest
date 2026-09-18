// Eval da feature 1.2 (sprint 030): a familia check() / checkFail /
// checkException, demonstrada pelo VEREDITO que o utest devolve — um check que
// passa deixa o arquivo verde, um que falha deixa vermelho.
//
// Cada caso monta um projeto minimo e roda o utest de verdade: a evidencia e a
// saida do binario, nao o retorno da funcao.
export default (t) => {
  const YAML = 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n'

  // req 1: check(a) — a booleano sem b (ou b string de mensagem) passa se a === true
  t.sandbox("check(a) com um booleano só passa quando a === true", async ({ sh, check, write }) => {
    write("TEST.yaml", YAML)
    write("bool.t.js", [
      "test('booleano solto', ({ check }) => {",
      "  check(true)",
      "  check(1 + 1 === 2)",
      "  check(true, 'com mensagem string')",
      "})",
    ].join("\n"))
    const r = await sh("utest bool.t.js --force")
    check(/✘/.test(r.out + r.err), false,
      `três checks verdadeiros não produzem falha: ${JSON.stringify(r.out + r.err)}`)
  })

  t.sandbox("check(false) reprova o arquivo", async ({ sh, check, write }) => {
    write("TEST.yaml", YAML)
    write("falso.t.js", "test('booleano falso', ({ check }) => { check(false) })\n")
    const r = await sh("utest falso.t.js --force")
    check(/✘|✗|fail/i.test(r.out + r.err), true,
      `check(false) deixa vermelho: ${JSON.stringify(r.out + r.err)}`)
  })

  // req 2: check(a, b) — compara repr(a) === repr(b) via toSource; função é
  // avaliada dos dois lados
  t.sandbox("check(a, b) compara por representação, e avalia função dos dois lados", async ({ sh, check, write }) => {
    write("TEST.yaml", YAML)
    write("repr.t.js", [
      "test('comparação por repr', ({ check }) => {",
      "  check({ a: 1 }, { a: 1 })",          // objetos distintos, mesma repr
      "  check([1, 2], [1, 2])",
      "  check(() => 40 + 2, 42)",            // função avaliada em a
      "  check(42, () => 40 + 2)",            // função avaliada em b
      "})",
    ].join("\n"))
    const r = await sh("utest repr.t.js --force")
    check(/✘/.test(r.out + r.err), false,
      `repr iguais passam e funções são avaliadas: ${JSON.stringify(r.out + r.err)}`)
  })

  // req 3: check(undefined) só passa contra a string 'undefined'
  t.sandbox("check(undefined) só passa contra a string 'undefined'", async ({ sh, check, write }) => {
    write("TEST.yaml", YAML)
    write("undef-ok.t.js", "test('undefined explícito', ({ check }) => { check(undefined, 'undefined') })\n")
    const ok = await sh("utest undef-ok.t.js --force")
    check(/✘/.test(ok.out + ok.err), false,
      `undefined contra 'undefined' passa: ${JSON.stringify(ok.out + ok.err)}`)

    write("undef-no.t.js", "test('undefined contra undefined', ({ check }) => { check(undefined, undefined) })\n")
    const no = await sh("utest undef-no.t.js --force")
    check(/✘|✗|fail/i.test(no.out + no.err), true,
      `undefined contra undefined NÃO passa: ${JSON.stringify(no.out + no.err)}`)
  })

  // req 4: checkFail inverte passed<->failed; checkException passa se fn() lança
  t.sandbox("checkFail inverte o veredito", async ({ sh, check, write }) => {
    write("TEST.yaml", YAML)
    write("cfail.t.js", [
      "test('checkFail', ({ checkFail }) => {",
      "  checkFail(1, 2)",   // falharia -> passa
      "})",
    ].join("\n"))
    const r = await sh("utest cfail.t.js --force")
    check(/✘/.test(r.out + r.err), false,
      `checkFail sobre uma comparação falsa passa: ${JSON.stringify(r.out + r.err)}`)

    write("cfail-no.t.js", "test('checkFail invertido', ({ checkFail }) => { checkFail(1, 1) })\n")
    const no = await sh("utest cfail-no.t.js --force")
    check(/✘|✗|fail/i.test(no.out + no.err), true,
      `checkFail sobre uma comparação verdadeira falha: ${JSON.stringify(no.out + no.err)}`)
  })

  t.sandbox("checkException passa quando fn() lança, falha quando não lança", async ({ sh, check, write }) => {
    write("TEST.yaml", YAML)
    write("cexc.t.js", [
      "test('checkException', ({ checkException }) => {",
      "  checkException(() => { throw new Error('boom') })",
      "})",
    ].join("\n"))
    const r = await sh("utest cexc.t.js --force")
    check(/✘/.test(r.out + r.err), false,
      `fn que lança passa: ${JSON.stringify(r.out + r.err)}`)

    write("cexc-no.t.js", "test('sem exceção', ({ checkException }) => { checkException(() => 1) })\n")
    const no = await sh("utest cexc-no.t.js --force")
    check(/✘|✗|fail/i.test(no.out + no.err), true,
      `fn que não lança falha: ${JSON.stringify(no.out + no.err)}`)
  })

  // req 5: um Error passado como a re-lança e vira estado 'exception'
  t.sandbox("um Error passado como 'a' vira exceção (💥), não uma falha comum", async ({ sh, check, write }) => {
    write("TEST.yaml", YAML)
    write("err.t.js", "test('Error como a', ({ check }) => { check(new Error('estourou')) })\n")
    const r = await sh("utest err.t.js --force")
    check(/💥|estourou/.test(r.out + r.err), true,
      `Error vira estado de exceção: ${JSON.stringify(r.out + r.err)}`)
  })

  // req 6: o par received/expected só é gravado quando falha; o par trivial
  // check(expr, true) é omitido no view
  t.sandbox("received/expected aparece no -v:2 de um check que falhou", async ({ sh, check, write }) => {
    write("TEST.yaml", YAML)
    write("rx.t.js", "test('received/expected', ({ check }) => { check(40, 42) })\n")
    const r = await sh("utest rx.t.js --force -v:2")
    const out = r.out + r.err
    check(/40/.test(out) && /42/.test(out), true,
      `mostra os dois lados da comparação que falhou: ${JSON.stringify(out)}`)
  })

  t.sandbox("o par trivial check(expr, true) é omitido no view", async ({ sh, check, write }) => {
    write("TEST.yaml", YAML)
    write("triv.t.js", "test('trivial', ({ check }) => { check(1 === 2, true) })\n")
    const r = await sh("utest triv.t.js --force -v:2")
    const out = r.out + r.err
    check(/expected/i.test(out), false,
      `não imprime expected para o par trivial: ${JSON.stringify(out)}`)
  })
}
