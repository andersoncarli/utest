// Eval da feature 4.1 — relatorio compacto: help (-h/--help), badges DEPOIS do tempo em
// fileLine, e callstack de excecao visivel em v1 (compactFails) sem precisar de -v2.
export default (t) => {
  t.sandbox("-h/--help imprime a tabela de flags e sai, sem rodar suite", async ({ sh, check }) => {
    const r = await sh("utest -h")
    const out = r.out.replace(/\x1b\[[0-9;]*m/g, "")
    check(out.includes("--help"), true, "a tabela cita --help")
    check(out.includes("--hogs"), true, "a tabela cita --hogs")
  })

  t.sandbox("-H continua o modo laser de hogs (antigo -h)", async ({ sh, check, write }) => {
    write("TEST.yaml", 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n')
    write("lento.t.js",
      "test('lento', ({ check }) => { const t = Date.now(); while (Date.now() - t < 5) {}; check(1, 1) })\n")
    const r = await sh("utest . -H 1 --force")
    const out = r.out.replace(/\x1b\[[0-9;]*m/g, "")
    check(/lento\.t\.js/.test(out), true, "-H lista o arquivo lento (modo laser)")
  })

  t.sandbox("fileLine: badges (icones) vem DEPOIS do dotfill, nao colados no nome", async ({ sh, check, write }) => {
    write("TEST.yaml", 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n')
    write("lento.t.js",
      "test('falha lenta', ({ check }) => { const t = Date.now(); while (Date.now() - t < 15) {}; check(1, 2) })\n")
    const r = await sh("utest lento.t.js --force")
    const out = r.out.replace(/\x1b\[[0-9;]*m/g, "")
    const head = out.split("\n")[0]
    check(/^lento\.t\.js\s✘/.test(head), false, "o badge NAO vem colado no nome, antes do dotfill/tempo")
    check(/\(\d+ms\)\s*✘1/.test(head), true, `o badge vem apos "(Nms)": ${JSON.stringify(head)}`)
  })

  t.sandbox("compactFails (v1, multi-arquivo): excecao de build mostra mensagem sem -v2", async ({ sh, check, write }) => {
    write("TEST.yaml", 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n')
    write("ok.t.js", "test('ok', ({ check }) => check(1, 1))\n")
    write("falha.t.js", "test('falha', ({ check }) => check(1, 2))\n")
    write("quebrado.t.js",
      "test('quebrado', ({ check }) => {\n  const x = [1, 2\n  check(x.length, 2)\n})\n")
    const r = await sh("utest .")
    const out = r.out.replace(/\x1b\[[0-9;]*m/g, "")
    check(out.includes("quebrado.t.js"), true, "o arquivo quebrado aparece no resumo")
    check(out.includes("falha.t.js"), true, "o arquivo com falha de check aparece no resumo")
    check(/💥.+(Expected|error|Error)/i.test(out), true, `a mensagem da excecao aparece sem -v2: ${JSON.stringify(out)}`)
  })
}
