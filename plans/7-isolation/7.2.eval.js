// Eval da feature 7.2 — vazamento cross-arquivo: exceção/check assíncrono tardio
// atribuído ao arquivo errado (in-process).
//
// A verificação declarada no frontmatter: `utest . 3×` comparando total e 💥 — e
// isolado, cada suíte é estável. O sprint 024 (ISSUES/007) achou a causa: `check.test`
// (global usado pelo fallback sem bind) só era restaurado no `finally` de `runTest` sem
// checar se ainda apontava pro nó certo — um straggler (setTimeout, promise solta, ou o
// `Promise.race` do timeout vencendo) que disparasse DEPOIS podia herdar o `check.test`
// de um arquivo seguinte. O conserto: seala e zera `check.test` se ainda for o `t` que
// está fechando, em vez de restaurar cegamente.
export default (t) => {
  t.sandbox("utest . repetido: total de checks estável entre rodadas, com um straggler assíncrono no meio", async ({ sh, check, write }) => {
    const U = process.cwd()
    write("TEST.yaml", 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n')
    // `a.t.js` dispara um check DEPOIS que o corpo do teste já terminou (setTimeout sem
    // await) — o straggler que o sprint 024 mirou. `b.t.js` tem um teste que ESPERA
    // (await de um setTimeout maior) — segura o processo vivo tempo suficiente para o
    // straggler de `a.t.js` disparar ENQUANTO `b.t.js` ainda está com `check.test`
    // apontado para ele: é a janela exata do vazamento (ISSUES/007).
    write("a.t.js",
      "test('a com straggler', ({ check }) => {\n" +
      "  setTimeout(() => { check(1, 2, 'straggler tardio de a.t.js') }, 20)\n" +
      "  check(1, 1, 'a passa na hora')\n" +
      "})\n")
    write("b.t.js",
      "test('b segura o processo vivo', async ({ check }) => {\n" +
      "  await new Promise(r => setTimeout(r, 200))\n" +
      "  check(2, 2, 'b passa'); check(3, 3, 'b passa de novo')\n" +
      "})\n")

    const runs = []
    for (let i = 0; i < 3; i++) {
      const r = await sh("utest") + " . --force --json")
      const arr = JSON.parse(r.out.trim())
      const total = arr.reduce((a, o) => a + (o.checks || 0), 0)
      const bEntry = arr.find(o => o.file === "b.t.js")
      runs.push({ total, bState: bEntry?.state, bChecks: bEntry?.checks })
    }

    check(runs[0].total, runs[1].total, "total de checks igual entre rodada 1 e 2")
    check(runs[1].total, runs[2].total, "total de checks igual entre rodada 2 e 3")
    check(runs.every(r => r.bState === "passed"), true, "b.t.js nunca herda o straggler de a.t.js — sempre passed")
    check(runs.every(r => r.bChecks === 2), true, "b.t.js sempre com seus 2 checks próprios, nunca inflado")
  })

  t.sandbox("straggler tardio reabre o veredito de QUEM o soltou, não de quem roda depois", async ({ sh, check, write }) => {
    const U = process.cwd()
    write("TEST.yaml", 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n')
    write("solto.t.js",
      "test('solto com straggler que falha', ({ check }) => {\n" +
      "  setTimeout(() => { check(false, true, 'chega tarde e falha') }, 20)\n" +
      "  check(1, 1, 'corpo passa antes do straggler')\n" +
      "})\n")
    write("vizinho.t.js",
      "test('vizinho segura o processo vivo', async ({ check }) => {\n" +
      "  await new Promise(r => setTimeout(r, 200))\n" +
      "  check(9, 9)\n" +
      "})\n")

    const r = await sh("utest") + " . --force --json")
    const arr = JSON.parse(r.out.trim())
    const solto = arr.find(o => o.file === "solto.t.js")
    const vizinho = arr.find(o => o.file === "vizinho.t.js")

    check(solto.state, "failed", "solto.t.js reabre pra failed — o straggler voltou pro dono certo")
    check(vizinho.state, "passed", "vizinho.t.js segue limpo — não herdou a falha alheia")
  })

  t.sandbox("isolado, cada arquivo é estável (a garantia que prova que era vazamento, não bug de arquivo)", async ({ sh, check, write }) => {
    const U = process.cwd()
    write("TEST.yaml", 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n')
    write("a.t.js",
      "test('a com straggler', ({ check }) => {\n" +
      "  setTimeout(() => { check(1, 2) }, 30)\n" +
      "  check(1, 1)\n" +
      "})\n")

    const r1 = await sh("utest") + " a.t.js --force --json")
    const r2 = await sh("utest") + " a.t.js --force --json")
    const s1 = JSON.parse(r1.out.trim())[0]
    const s2 = JSON.parse(r2.out.trim())[0]
    check(s1.checks, s2.checks, "a.t.js isolado tem a mesma contagem entre rodadas")
    check(s1.state, s2.state, "a.t.js isolado tem o mesmo veredito entre rodadas")
  })
}
