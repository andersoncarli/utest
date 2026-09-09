// Eval da feature 3.4 — os ganchos de extensão: registerExecutor / registerEntries /
// registerPhaseSetup, e o `resetRegistry` que o `utest.js` chama entre fases.
//
// Um tipo pode não ser um módulo ESM chamando `test()` (`.tuit` é JSON+arte;
// `.eval.js` exporta `(t) => {}`), e uma fase pode ter arquivos fora da árvore que
// `scan()` varre. Os três ganchos irmãos de `register()` deixam um consumidor
// externo (o `sprint eval --sweep` do soml) plugar executor, provedor de entries
// e setup de fase. Este roteiro prova o registro dos três contra o `kinds.js`
// real, que uma fase com provider ignora `include`/`exclude` do TEST.yaml, e —
// a prova de campo do sprint 017 — que um `.t.js` da fase `unit` que chama
// `register*` por conta própria NÃO faz a fase seguinte partir de um registry
// poluído.
export default (t) => {

  t.sandbox("3.4: os três ganchos registram e os *For devolvem a fn; resetRegistry zera", async ({ sh, check, write }) => {
    const U = process.cwd()
    write("probe.js",
      `import { register, kinds, registerExecutor, executorFor, registerEntries, entriesFor, ` +
      `registerPhaseSetup, phaseSetupFor, resetRegistry } from ${JSON.stringify(U + "/kinds.js")}\n` +
      `register('demo')\n` +
      `registerExecutor('demo', (entry, h) => [{ name: 'p', fn: () => {}, op: null }])\n` +
      `registerEntries('demo', async () => [{ path: '/x', target: null }])\n` +
      `registerPhaseSetup('demo', async () => () => {})\n` +
      `console.log('KIND=' + kinds().includes('demo'))\n` +
      `console.log('EXEC=' + (typeof executorFor('demo')))\n` +
      `console.log('ENTRIES=' + (typeof entriesFor('demo')))\n` +
      `console.log('SETUP=' + (typeof phaseSetupFor('demo')))\n` +
      `resetRegistry()\n` +
      `console.log('AFTER_KIND=' + kinds().slice().sort().join(','))\n` +
      `console.log('AFTER_EXEC=' + executorFor('demo'))\n` +
      `console.log('AFTER_ENTRIES=' + entriesFor('demo'))\n` +
      `console.log('AFTER_SETUP=' + phaseSetupFor('demo'))\n`)
    const r = await sh(`bun probe.js`)
    check(r.out.includes("KIND=true"), true, "register() abre o tipo")
    check(r.out.includes("EXEC=function"), true, "executorFor devolve a fn registrada")
    check(r.out.includes("ENTRIES=function"), true, "entriesFor idem")
    check(r.out.includes("SETUP=function"), true, "phaseSetupFor idem")
    check(r.out.includes("AFTER_KIND=it,t,test,tuit"), true, "resetRegistry volta KINDS ao vocabulário do import")
    check(r.out.includes("AFTER_EXEC=null"), true, "e limpa o executor")
    check(r.out.includes("AFTER_ENTRIES=null"), true, "o entry-provider")
    check(r.out.includes("AFTER_SETUP=null"), true, "e o phase-setup")
  })

  t.sandbox("3.4: uma fase com provider ignora include/exclude do TEST.yaml por completo", async ({ sh, check, write }) => {
    const U = process.cwd()
    // TEST.yaml declara a fase `prov` SEM `include:` — não há walk. Um `boot:`
    // registra `registerEntries('prov', ...)` com uma entry inventada que não
    // existe sob root; e mesmo com um `*.t.js` real no disco (que o `include`
    // pegaria), a fase roda SÓ o que o provider deu.
    write("TEST.yaml", 'exclude: []\nboot: ./TEST.boot.js\nunit:\n  include:\n    - "**/*.t.js"\nprov: {}\n')
    write("TEST.boot.js",
      `import { register, registerExecutor, registerEntries } from ${JSON.stringify(U + "/kinds.js")}\n` +
      `export default () => {\n` +
      `  register('prov')\n` +
      `  registerExecutor('prov', () => [\n` +
      `    { name: 'do-provider', fn: ({ check }) => check(1 + 1, 2), op: null }\n` +
      `  ])\n` +
      `  registerEntries('prov', async () => [{ path: process.cwd() + '/entry-do-provider', target: null }])\n` +
      `}\n`)
    write("real.js", "export const R = 1\n")
    write("real.t.js", `import { R } from './real.js'\ntest('nao-e-da-fase-prov', ({ check }) => check(R, 1))\n`)

    const r = await sh(`bun ${JSON.stringify(U + "/utest.js")} prov -v:2`)
    const clean = r.out.replace(/\x1b\[[0-9;]*m/g, "")
    check(clean.includes("entry-do-provider"), true, "a entry veio do registerEntries, não de um walk do disco")
    check(/PROV\s*[.\s]*\(\d+s\)\s*📄1\s*🧪1/.test(clean), true, "1 entry / 1 teste — o passo do registerExecutor rodou")
    check(clean.includes("nao-e-da-fase-prov"), false, "o *.t.js real do disco NÃO entrou — provider ignora o include")
  })

  t.sandbox("3.4: utest/ não importa nada de projeto — tudo entra por boot:", async ({ sh, check, write }) => {
    const U = process.cwd()
    // Sem `boot:` no TEST.yaml, a fase provider não tem como existir — a prova de
    // que a especificidade do projeto mora no `TEST.boot.js`, não em `utest.js`.
    write("TEST.yaml", 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\nprov: {}\n')
    write("m.js", "export const K = 3\n")
    write("m.t.js", `import { K } from './m.js'\ntest('so-unit', ({ check }) => check(K, 3))\n`)
    const r = await sh(`bun ${JSON.stringify(U + "/utest.js")} .`)
    const clean = r.out.replace(/\x1b\[[0-9;]*m/g, "")
    check(clean.toUpperCase().includes("UNIT"), true, "a fase unit roda")
    check(/PROV\b/i.test(clean), false, "a fase `prov` sem boot: que a registre não aparece")
  })

  t.real("3.4: um .t.js da fase unit que chama register* NÃO polui a fase seguinte (sprint 017)", async ({ sh, check, write }) => {
    const U = process.cwd()
    // O bug do issue #3: `~/tui/plugins/eval/utest-phase.t.js` chama
    // `registerEvalPhase({ entries: async () => [] })` na fase `unit` e deixa
    // `ENTRY_PROVIDERS` apontando pra um fixture vazio. Sob `utest .`, a fase
    // `prov` seguinte pegava esse fixture (0 entries) e SUMIA do relatório —
    // enquanto `utest prov` sozinho funcionava (a `unit` nunca rodava). O sprint
    // 017 pôs `resetRegistry()` + re-`runBoot()` entre cada par de fases.
    const dir = ".eval-tmp-3.4"
    write(`${dir}/TEST.yaml`,
      'exclude: []\nboot: ./TEST.boot.js\nunit:\n  include:\n    - "**/*.t.js"\nprov: {}\n')
    write(`${dir}/TEST.boot.js`,
      `import { register, registerExecutor, registerEntries } from ${JSON.stringify(U + "/kinds.js")}\n` +
      `export default () => {\n` +
      `  register('prov')\n` +
      `  registerExecutor('prov', () => [{ name: 'prova-real', fn: ({ check }) => check(2 + 2, 4), op: null }])\n` +
      `  registerEntries('prov', async () => [\n` +
      `    { path: process.cwd() + '/a-real-prov', target: null },\n` +
      `    { path: process.cwd() + '/b-real-prov', target: null }\n` +
      `  ])\n` +
      `}\n`)
    // O `.t.js` da fase unit que POLUI: registra um entry-provider vazio para `prov`.
    write(`${dir}/poluidor.js`, "export const P = 1\n")
    write(`${dir}/poluidor.t.js`,
      `import { P } from './poluidor.js'\n` +
      `import { registerEntries } from ${JSON.stringify(U + "/kinds.js")}\n` +
      `registerEntries('prov', async () => [])\n` +
      `test('o poluidor roda na fase unit', ({ check }) => check(P, 1))\n`)

    const script = `
cd ${dir}
echo "=== utest . (unit DEPOIS prov, mesmo processo) ==="
bun ${JSON.stringify(U + "/utest.js")} .
echo "=== utest prov (sozinho, sem a unit antes) ==="
bun ${JSON.stringify(U + "/utest.js")} prov
cd ..
rm -rf ${dir}
`
    const r = await sh(script)
    const clean = r.out.replace(/\x1b\[[0-9;]*m/g, "")
    const [dotRun, provRun] = clean.split("=== utest prov")
    // O relatório v0/v1 não lista nome de teste — a contagem da phase-line é a
    // prova. Sem o reset do 017, a fase `prov` sob `utest .` pegava o fixture
    // vazio do poluidor (📄0 🧪0) e sumia; com o reset, os 2 entries reais do
    // `boot:` aparecem — a MESMA contagem que `utest prov` sozinho.
    const provCount = s => (s.match(/PROV\s*(?:\(\d+s\))?\s*📄(\d+)\s*🧪(\d+)/) || []).slice(1).join('/')
    check(provCount(dotRun), "2/2", "`utest .`: a fase prov roda os 2 entries reais do boot:, não o fixture vazio do poluidor")
    check(provCount(provRun), "2/2", "`utest prov` sozinho: a mesma contagem — o reset entre fases igualou os dois caminhos")
    check(/UNIT\s*(?:\(\d+s\))?\s*📄1/.test(dotRun), true, "e a fase unit (com o poluidor) rodou antes, no mesmo processo")
  })
}
