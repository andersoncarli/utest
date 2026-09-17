// Eval do fix em src/cache.js (ISSUES/014, sprint 026): `.t.js` "cru" (sem test()/check(),
// só console.assert/console.log) passa isolado mas dentro de `utest .` o cache gravava
// state:'failed' para ele — a causa era `src/cache.js` tratando `!result.checks` (zero
// checks, legítimo pra um arquivo cru) como sinônimo de falha, ignorando `result.failed`
// (o veredito real). Fix: as duas gravações (sidecar e `results.json`) passam a usar só
// `result.failed`/`result.exception`.
export default (t) => {
  t.sandbox("arquivo cru (sem check()) que passa não vira falso-vermelho no agregado", async ({ sh, check, write }) => {
    write("TEST.yaml", 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n')
    write("cru.t.js", 'console.assert(1 + 1 === 2, "math ok")\nconsole.log("cru ok")\n')
    write("normal.t.js", "test('normal', ({ check }) => check(1, 1))\n")

    const lastLine = out => out.trim().split("\n").pop()

    const iso = await sh("utest cru.t.js --force --json")
    const isoEntry = JSON.parse(lastLine(iso.out))[0]
    check(isoEntry.state, "passed", "isolado: cru.t.js passa")

    const agg = await sh("utest . --force --json")
    const arr = JSON.parse(lastLine(agg.out))
    const cru = arr.find(o => o.file === "cru.t.js")
    const normal = arr.find(o => o.file === "normal.t.js")
    check(cru.state, "passed", "agregado: cru.t.js continua passed, não vira falso-vermelho")
    check(normal.state, "passed", "agregado: normal.t.js passa normalmente")
  })

  t.sandbox("o mesmo veredito correto sobrevive à leitura do cache quente", async ({ sh, check, write }) => {
    write("TEST.yaml", 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n')
    write("cru.t.js", 'console.assert(true, "ok")\n')

    await sh("utest . --force")
    const hot = await sh("utest . --json")
    const entry = JSON.parse(hot.out.trim()).find(o => o.file === "cru.t.js")
    check(entry.state, "passed", "cache quente: cru.t.js segue passed, mesmo com checks:0")
    check(entry.checks, 0, "checks:0 é legítimo pra um arquivo sem check() — não é falha")
  })
}
