// Eval da feature 3.2 — findTarget: pareamento teste↔alvo, descasque progressivo,
// `.eval.js`↔`.md` de feature.
//
// findTarget é o que liga um teste ao arquivo que ele mede — e o cache pareado
// (frente 2) depende de acertar esse alvo. Este roteiro prova as seis regras do
// frontmatter contra o `scanner.js` real, e fecha com a prova de campo do sprint
// 017: um `.t.js` dado por CAMINHO num subdiretório fundo tem que imprimir o
// relatório completo, não sumir num `coverage: —`.
//
// Nível `sandbox`: cada passo monta uma árvore scratch, chama `findTarget` (ou o
// `utest.js` inteiro) e afere. O `U = process.cwd()` é o ROOT do `~/utest`, de
// onde `scanner.js` e `utest.js` são importáveis por caminho absoluto.
export default (t) => {

  t.sandbox("3.2: par direto — foo.t.js / .test.js / .tuit / .it.js → foo.js", async ({ sh, check, write }) => {
    const U = process.cwd()
    write("m.js", ""); write("m.t.js", "")
    write("n.js", ""); write("n.test.js", "")
    write("p.js", ""); write("p.tuit", "")
    write("q.js", ""); write("q.it.js", "")
    write("probe.js",
      `import { findTarget } from ${JSON.stringify(U + "/scanner.js")}\n` +
      `import { basename } from 'path'\n` +
      `const b = f => f ? basename(f) : null\n` +
      `const r = process.cwd()\n` +
      `console.log('T=' + b(findTarget(r + '/m.t.js')))\n` +
      `console.log('TEST=' + b(findTarget(r + '/n.test.js')))\n` +
      `console.log('TUIT=' + b(findTarget(r + '/p.tuit')))\n` +
      `console.log('IT=' + b(findTarget(r + '/q.it.js')))\n`)
    const r = await sh(`bun probe.js`)
    check(r.out.includes("T=m.js"), true, ".t.js pareia com o .js de mesmo nome-base")
    check(r.out.includes("TEST=n.js"), true, ".test.js idem")
    check(r.out.includes("TUIT=p.js"), true, ".tuit idem")
    check(r.out.includes("IT=q.js"), true, ".it.js idem")
  })

  t.sandbox("3.2: descasque progressivo — a.b.c.t.js → a.b.js → a.js (o 1º no disco)", async ({ sh, check, write }) => {
    const U = process.cwd()
    // Só `a.js` existe: o strip tem que descer `a.b.c` → `a.b` → `a` até achar.
    write("a.js", ""); write("a.b.c.t.js", "")
    // Aqui `x.y.js` existe: o strip PARA no primeiro que casa, não desce até `x.js`.
    write("x.y.js", ""); write("x.js", ""); write("x.y.z.t.js", "")
    write("probe.js",
      `import { findTarget } from ${JSON.stringify(U + "/scanner.js")}\n` +
      `import { basename } from 'path'\n` +
      `const b = f => f ? basename(f) : null\n` +
      `const r = process.cwd()\n` +
      `console.log('DEEP=' + b(findTarget(r + '/a.b.c.t.js')))\n` +
      `console.log('STOP=' + b(findTarget(r + '/x.y.z.t.js')))\n`)
    const r = await sh(`bun probe.js`)
    check(r.out.includes("DEEP=a.js"), true, "desce ponto a ponto até o primeiro que existe")
    check(r.out.includes("STOP=x.y.js"), true, "e para no primeiro — não desce além do que casa")
  })

  t.sandbox("3.2: prefere o par exato ao descascado; não atravessa pasta", async ({ sh, check, write }) => {
    const U = process.cwd()
    write("a.js", ""); write("a.b.js", ""); write("a.b.t.js", "")   // par exato: a.b.js
    write("sib.js", ""); write("sub/sib.t.js", "")                   // alvo seria irmão, não sobe
    write("probe.js",
      `import { findTarget } from ${JSON.stringify(U + "/scanner.js")}\n` +
      `import { basename } from 'path'\n` +
      `const b = f => f ? basename(f) : null\n` +
      `const r = process.cwd()\n` +
      `console.log('EXATO=' + b(findTarget(r + '/a.b.t.js')))\n` +
      `console.log('CRUZA=' + findTarget(r + '/sub/sib.t.js'))\n`)
    const r = await sh(`bun probe.js`)
    check(r.out.includes("EXATO=a.b.js"), true, "o par exato vence o descasque para a.js")
    check(r.out.includes("CRUZA=null"), true, "o alvo é irmão — findTarget não sobe de pasta")
  })

  t.sandbox("3.2: .eval.js de módulo → o .js irmão; sem nada casando → null", async ({ sh, check, write }) => {
    const U = process.cwd()
    write("slider.js", ""); write("slider.eval.js", "")   // mesma regra do .t.js
    write("orfao.eval.js", "")                            // sem .js nem .md → null
    write("probe.js",
      `import { findTarget } from ${JSON.stringify(U + "/scanner.js")}\n` +
      `import { basename } from 'path'\n` +
      `const b = f => f ? basename(f) : null\n` +
      `const r = process.cwd()\n` +
      `console.log('SLIDER=' + b(findTarget(r + '/slider.eval.js')))\n` +
      `console.log('ORFAO=' + findTarget(r + '/orfao.eval.js'))\n` +
      // O strip `1.1.eval.js` → `1.1.eval` + `.js` daria o próprio arquivo; o guard
      // `v === name` e a variante `.eval.js` → `.js` impedem.
      `console.log('SELF=' + findTarget(r + '/9.9.eval.js'))\n`)
    write("9.9.eval.js", "")
    const r = await sh(`bun probe.js`)
    check(r.out.includes("SLIDER=slider.js"), true, ".eval.js pareia com o .js de mesmo nome-base")
    check(r.out.includes("ORFAO=null"), true, "sem alvo no disco → null")
    check(r.out.includes("SELF=null"), true, ".eval.js NÃO pareia com o próprio arquivo")
  })

  t.sandbox("3.2: N.F.eval.js sem .js irmão → o .md da feature (<base>.md ou <base>-<slug>.md)", async ({ sh, check, write }) => {
    const U = process.cwd()
    // Exato: `3.9.eval.js` → `3.9.md`.
    write("3.9.md", "# f\n"); write("3.9.eval.js", "")
    // Glob de slug (o nome de feature do sprint-cli): `4.2.eval.js` → `4.2-o-slug.md`.
    write("4.2-o-slug-longo-da-feature.md", "# f\n"); write("4.2.eval.js", "")
    write("probe.js",
      `import { findTarget } from ${JSON.stringify(U + "/scanner.js")}\n` +
      `import { basename } from 'path'\n` +
      `const b = f => f ? basename(f) : null\n` +
      `const r = process.cwd()\n` +
      `console.log('EXATO=' + b(findTarget(r + '/3.9.eval.js')))\n` +
      `console.log('SLUG=' + b(findTarget(r + '/4.2.eval.js')))\n`)
    const r = await sh(`bun probe.js`)
    check(r.out.includes("EXATO=3.9.md"), true, "<base>.md exato quando existe")
    check(r.out.includes("SLUG=4.2-o-slug-longo-da-feature.md"), true, "senão o glob <base>-<slug>.md")
  })

  t.sandbox("3.2: ESTE roteiro resolve para ESTE .md (o verify_manual da feature)", async ({ sh, check, write }) => {
    const U = process.cwd()
    // `plans/3-scan/3.2.eval.js` sem `.js` irmão → o glob `3.2-*.md` → o próprio
    // frontmatter que declara os requisitos. É o que fecha o laço: o roteiro sabe
    // qual `.md` é a fonte da verdade dele.
    write("probe.js",
      `import { findTarget } from ${JSON.stringify(U + "/scanner.js")}\n` +
      `import { basename } from 'path'\n` +
      `console.log('MD=' + basename(findTarget(${JSON.stringify(U + "/plans/3-scan/3.2.eval.js")})))\n`)
    const r = await sh(`bun probe.js`)
    check(r.out.includes("MD=3.2-findtarget-pareamento-teste-alvo-descasque-progressivo-eval-js-md-de-feature.md"),
      true, "3.2.eval.js → 3.2-…-md-de-feature.md")
  })

  t.real("3.2: um .t.js por CAMINHO num subdir fundo imprime o relatório completo (sprint 017)", async ({ sh, check, write }) => {
    const U = process.cwd()
    // O bug do issue #1: o ramo `_isFile` de `runPhase` montava o glob-match a mão
    // (`**/`→`(.*/)?` e DEPOIS `*`→`[^/]*`), corrompendo o `.` interno para
    // `(.[^/]*/)?` — que casa exatamente UM nível de pasta. Um `.t.js` a dois
    // subdirs de fundura não pertencia a fase nenhuma → `entries: []` → o render
    // imprimia só `coverage: —` e saía 0. O sprint 017 trocou por
    // `scanner.js#makeFilter` (o mesmo `compileGlob` do walk).
    const dir = ".eval-tmp-3.2"
    write(`${dir}/TEST.yaml`, 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n')
    write(`${dir}/plugins/deep/nest/m.js`, "export const K = 41\n")
    write(`${dir}/plugins/deep/nest/m.t.js`,
      `import { K } from './m.js'\n` +
      `test('dois níveis de fundura', ({ check }) => { check(K, 41); check(K + 1, 42) })\n`)
    const script = `
cd ${dir}
bun ${JSON.stringify(U + "/utest.js")} plugins/deep/nest/m.t.js; echo "EXIT=$?"
cd ..
rm -rf ${dir}
`
    const r = await sh(script)
    const clean = r.out.replace(/\x1b\[[0-9;]*m/g, "")
    check(clean.includes("EXIT=0"), true, "exit 0 — o arquivo verde")
    check(clean.trim().endsWith("coverage: —") || /coverage: —\s*EXIT/.test(clean), false,
      "NÃO é o output vazio de fase sem entries (o bug do issue #1)")
    check(/✔2/.test(clean.replace(/\s+/g, "")), true, "os 2 checks do arquivo aparecem no relatório")
    check(clean.includes("dois níveis de fundura"), true, "e o nome do teste também")
  })
}
