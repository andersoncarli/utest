// Eval da feature 8.2 — .utest/STATE: histórico de scans + deteção de mudança de config.
// Prova de campo: abrir o state de verdade (contra o `../iodb` real), gravar rodadas,
// e demonstrar exatamente o critério da feature — configHash detecta mudança de
// TEST.yaml, um --force (recordScan de novo) silencia o aviso, e arquivo novo ganha
// um id próprio, estável entre rodadas.
//
// Os passos `t.sandbox` de um mesmo arquivo compartilham a MESMA árvore scratch em
// sequência — cada bloco usa seu próprio subdiretório-raiz para não pisar no do anterior.
export default (t) => {
  t.sandbox("state: primeira rodada não acusa mudança; STATE.yaml projeta o último registro", async ({ sh, check, write, exists }) => {
    const U = process.cwd()
    write("r1/TEST.yaml", 'exclude: []\nunit:\n  include: ["**/*.t.js"]\n')
    write("r1/probe.js",
      `import { openState } from ${JSON.stringify(U + "/state.js")}\n` +
      `const root = process.cwd()\n` +
      `const state = await openState(root)\n` +
      `console.log("CONFIG_CHANGED_FIRST=" + state.configChanged)\n` +
      `state.recordScan({ phase: "unit", included: ["a.t.js", "b.t.js"], excluded: ["node_modules/**"] })\n`)
    const r = await sh(`cd r1 && bun probe.js`)
    check(r.out.includes("CONFIG_CHANGED_FIRST=false"), true, "sem registro anterior, configChanged fica false")
    check(exists("r1/.utest/STATE.yaml"), true, ".utest/STATE.yaml existe após recordScan")

    const proj = await sh(`cat r1/.utest/STATE.yaml`)
    check(proj.out.includes("a.t.js"), true, "projeção reflete o included da rodada")
    check(proj.out.includes("node_modules"), true, "projeção reflete o excluded da rodada")
  })

  t.sandbox("state: editar TEST.yaml acusa configChanged; recordScan de novo (o --force) silencia", async ({ sh, check, write }) => {
    const U = process.cwd()
    write("r2/TEST.yaml", 'exclude: []\nunit:\n  include: ["**/*.t.js"]\n')
    write("r2/probe1.js",
      `import { openState } from ${JSON.stringify(U + "/state.js")}\n` +
      `const state = await openState(process.cwd())\n` +
      `state.recordScan({ phase: "unit", included: ["a.t.js"], excluded: [] })\n`)
    await sh(`cd r2 && bun probe1.js`)

    // muda a config — simula edição manual do TEST.yaml
    write("r2/TEST.yaml", 'exclude: []\nunit:\n  include: ["**/*.t.js", "**/*.test.js"]\n')

    write("r2/probe2.js",
      `import { openState } from ${JSON.stringify(U + "/state.js")}\n` +
      `const state = await openState(process.cwd())\n` +
      `console.log("CONFIG_CHANGED=" + state.configChanged)\n`)
    const after = await sh(`cd r2 && bun probe2.js`)
    check(after.out.includes("CONFIG_CHANGED=true"), true, "editar TEST.yaml entre rodadas acusa configChanged")

    write("r2/probe3.js",
      `import { openState } from ${JSON.stringify(U + "/state.js")}\n` +
      `const state = await openState(process.cwd())\n` +
      `state.recordScan({ phase: "unit", included: ["a.t.js"], excluded: [] })\n`) // o --force
    await sh(`cd r2 && bun probe3.js`)

    write("r2/probe4.js",
      `import { openState } from ${JSON.stringify(U + "/state.js")}\n` +
      `const state = await openState(process.cwd())\n` +
      `console.log("CONFIG_CHANGED_AFTER_FORCE=" + state.configChanged)\n`)
    const settled = await sh(`cd r2 && bun probe4.js`)
    check(settled.out.includes("CONFIG_CHANGED_AFTER_FORCE=false"), true, "--force (recordScan de novo) silencia o aviso na rodada seguinte")
  })

  t.sandbox("state: arquivo novo ganha id próprio e estável; arquivo já visto não muda de id", async ({ sh, check, write }) => {
    const U = process.cwd()
    write("r3/TEST.yaml", 'exclude: []\nunit:\n  include: ["**/*.t.js"]\n')
    write("r3/probe1.js",
      `import { openState } from ${JSON.stringify(U + "/state.js")}\n` +
      `const state = await openState(process.cwd())\n` +
      `state.recordScan({ phase: "unit", included: ["a.t.js"], excluded: [] })\n` +
      `console.log("ID_A=" + state.fileId("a.t.js"))\n` +
      `console.log("ID_NEVER_SEEN=" + state.fileId("never-seen.t.js"))\n`)
    const r1 = await sh(`cd r3 && bun probe1.js`)
    const idA = (r1.out.match(/ID_A=(.+)/) || [])[1]
    check(typeof idA, "string", "arquivo novo ganha um id (chave do iodb)")
    check(r1.out.includes("ID_NEVER_SEEN=null"), true, "arquivo nunca visto não tem id")

    write("r3/probe2.js",
      `import { openState } from ${JSON.stringify(U + "/state.js")}\n` +
      `const state = await openState(process.cwd())\n` +
      `state.recordScan({ phase: "unit", included: ["a.t.js", "b.t.js"], excluded: [] })\n` +
      `console.log("ID_A_AGAIN=" + state.fileId("a.t.js"))\n` +
      `console.log("ID_B=" + state.fileId("b.t.js"))\n`)
    const r2 = await sh(`cd r3 && bun probe2.js`)
    check(r2.out.includes(`ID_A_AGAIN=${idA}`), true, "id de arquivo já visto é estável entre rodadas")
    const idB = (r2.out.match(/ID_B=(.+)/) || [])[1]
    check(typeof idB, "string", "arquivo novo na segunda rodada também ganha id")
    check(idB !== idA, true, "ids de arquivos diferentes são distintos")
  })

  t.sandbox("state: custo zero quando desligado (enabled:false) — degrada no-op", async ({ sh, check, write, exists }) => {
    const U = process.cwd()
    write("r4/TEST.yaml", 'exclude: []\nunit:\n  include: ["**/*.t.js"]\n')
    write("r4/probe.js",
      `import { openState } from ${JSON.stringify(U + "/state.js")}\n` +
      `const state = await openState(process.cwd(), { enabled: false })\n` +
      `console.log("CONFIG_CHANGED=" + state.configChanged)\n` +
      `state.recordScan({ phase: "unit", included: [], excluded: [] })\n`)
    const r = await sh(`cd r4 && bun probe.js`)
    check(r.out.includes("CONFIG_CHANGED=false"), true, "enabled:false mantém configChanged false")
    check(exists("r4/.utest/STATE.yaml"), false, "nenhum .utest/STATE.yaml é criado quando desligado")
  })
}
