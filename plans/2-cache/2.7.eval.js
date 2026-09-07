// Eval da feature 2.7 — o cache sobre o ledger: o ledger arbitra o frescor por sha256,
// o results.json em paralelo.
//
// Prova de campo contra o `../iodb` real: montar um projetinho, rodar `utest` nele duas
// vezes, e provar as três coisas que a feature promete — quente e frio dão o MESMO número,
// o `results.json` continua sendo escrito enquanto o ledger arbitra, e um `touch` sem
// edição NÃO faz o arquivo re-rodar (o ganho sobre o mtime, e a única divergência entre os
// dois árbitros).
export default (t) => {

  t.sandbox("2.7: quente e frio reportam o MESMO número, e o results.json é escrito em paralelo", async ({ sh, check, write, exists }) => {
    const U = process.cwd() // ROOT do utest — de onde ../iodb é visível
    write("TEST.yaml", "exclude: []\n")
    write("soma.js", "export const soma = (a, b) => a + b\n")
    write("soma.t.js",
      `import { soma } from './soma.js'\n` +
      `test('soma', ({ check }) => { check(soma(1, 2), 3); check(soma(0, 0), 0) })\n`)

    // FRIO: nada no cache, tudo roda de verdade.
    const frio = await sh(`bun ${JSON.stringify(U + "/utest.js")} .`)
    const n = (s) => (s.replace(/\x1b\[[0-9;]*m/g, "").match(/✔(\d+)/) || [])[1]
    check(typeof n(frio.out), "string", "a rodada fria reportou um número de checks")

    // QUENTE: tudo do cache, com o ledger arbitrando.
    const quente = await sh(`bun ${JSON.stringify(U + "/utest.js")} .`)
    check(n(quente.out), n(frio.out), "quente e frio reportam o MESMO número — o portão da frente 2")

    // As DUAS persistências, lado a lado.
    check(exists(".utest/ledger.dash"), true, "o ledger gravou a rodada")
    check(exists(".utest/results.json"), true, "e o results.json continua sendo escrito em paralelo")
  })

  t.sandbox("2.7: O GANHO — touch sem editar não faz o arquivo re-rodar", async ({ sh, check, write }) => {
    const U = process.cwd()
    write("TEST.yaml", "exclude: []\n")
    write("m.js", "export const K = 7\n")
    write("m.t.js", `import { K } from './m.js'\ntest('m', ({ check }) => { check(K, 7) })\n`)

    await sh(`bun ${JSON.stringify(U + "/utest.js")} .`)   // aquece

    // `touch` muda o inode e não os bytes. O `results.json` (mtime) diria stale; o ledger
    // (sha256) sabe que o conteúdo é o mesmo. É o caso do `git checkout` que devolve os
    // mesmos bytes com mtime novo — trocar de branch e voltar deixa de re-rodar a suíte.
    await sh(`touch m.t.js m.js`)
    const depois = await sh(`bun ${JSON.stringify(U + "/utest.js")} .`)
    const clean = depois.out.replace(/\x1b\[[0-9;]*m/g, "")

    // O sinal de que NÃO re-rodou: a fase inteira fecha em 0s. Um teste que roda de
    // verdade custa milissegundos mensuráveis; um cache hit não custa nenhum.
    check(/\(0s\)/.test(clean), true, "após o touch a fase fecha em 0s — nada re-rodou")
  })

  t.sandbox("2.7: editar o CONTEÚDO derruba o frescor nos dois árbitros", async ({ sh, check, write }) => {
    const U = process.cwd()
    // Subdiretório PRÓPRIO: os passos sandbox deste arquivo compartilham a mesma árvore
    // scratch em sequência, e as fixtures dos passos anteriores contariam junto no total.
    write("edit/TEST.yaml", "exclude: []\n")
    write("edit/v.js", "export const V = 1\n")
    write("edit/v.t.js", `import { V } from './v.js'\ntest('v', ({ check }) => { check(typeof V, 'number') })\n`)

    const run = () => sh(`cd edit && bun ${JSON.stringify(U + "/utest.js")} .`)
    const n = (r) => (r.out.replace(/\x1b\[[0-9;]*m/g, "").match(/✔(\d+)/) || [])[1]

    check(n(await run()), "1", "aquecido: 1 check")

    // Agora os bytes MUDAM de verdade — os dois árbitros têm que concordar em stale, e o
    // teste re-roda reportando o check novo.
    write("edit/v.t.js",
      `import { V } from './v.js'\n` +
      `test('v', ({ check }) => { check(typeof V, 'number'); check(V > 0, true) })\n`)
    check(n(await run()), "2", "o teste editado re-rodou e reportou os 2 checks novos")
  })

  t.sandbox("2.7: custo zero — sem o ledger, o results.json arbitra e tudo roda como hoje", async ({ sh, check, write, exists }) => {
    const U = process.cwd()
    write("off/TEST.yaml", "exclude: []\n")
    write("off/s.js", "export const S = 2\n")
    write("off/s.t.js", `import { S } from './s.js'\ntest('s', ({ check }) => { check(S, 2) })\n`)

    // `openCacheLedger(root, { enabled: false })` é o MESMO caminho de código que a
    // ausência de `../iodb` toma: ambos devolvem o no-op, e o `TestCache` fica no
    // `results.json` — a arbitragem por mtime de sempre.
    write("off/probe.js",
      `import { openCacheLedger } from ${JSON.stringify(U + "/cacheLedger.js")}\n` +
      `import { TestCache } from ${JSON.stringify(U + "/cache.js")}\n` +
      `const l = await openCacheLedger(process.cwd(), { enabled: false })\n` +
      `console.log("ENABLED=" + l.enabled)\n` +
      `console.log("JUDGE=" + TestCache(process.cwd(), { ledger: l }).judge)\n` +
      `console.log("JUDGE_ON=" + TestCache(process.cwd(), { ledger: { enabled: true } }).judge)\n`)
    const r = await sh(`cd off && bun probe.js`)
    check(r.out.includes("ENABLED=false"), true, "desligado não arbitra")
    check(r.out.includes("JUDGE=results.json"), true, "e o results.json volta a ser o árbitro")
    check(r.out.includes("JUDGE_ON=ledger"), true, "com o ledger ligado, é ele quem arbitra")
  })
}
