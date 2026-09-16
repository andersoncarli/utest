// Eval da feature 9.1 — adotar o formato sprint 2.0 (arquivo unico).
// Prova de campo: rodar o codemod real (`sprint-normalize.js` do sprint-cli) sobre um
// par plan+report sintetico, e verificar o criterio da feature — secoes reconhecidas
// por igualdade viram as 7+5 ancoras canonicas, secao fora do vocabulario fica livre
// (nada se perde), e o corpo de cada secao sobrevive palavra por palavra.
export default (t) => {
  t.sandbox("normalize: par sintetico com vocabulario variado vira NNN-slug.md com ancoras canonicas", async ({ sh, check, write }) => {
    write("fixture.md",
      `---\n` +
      `sprint: "999"\n` +
      `slug: fixture\n` +
      `title: "sprint fixture para eval da 9.1"\n` +
      `features: ["9.1"]\n` +
      `state: closed\n` +
      `---\n` +
      `# 999 — sprint fixture\n\n` +
      `resumo do sprint fixture.\n\n` +
      `# PLAN\n\n` +
      `## Objetivo\n\ntexto do objetivo original.\n\n` +
      `## Passos\n\n**1. fazer x** roda \`cmd x\`\n\n` +
      `## Uma Secao Que Nao Casa Com Nada\n\ntexto que deve sobreviver como secao livre.\n\n` +
      `# REPORT\n\n` +
      `## O que entregou\n\ntexto do que foi entregue.\n\n` +
      `## Budget: previsto vs real\n\n| | tokens |\n|---|---|\n| real | 10k |\n`)

    write("run-normalize.js",
      `import { normalize } from ${JSON.stringify(process.env.HOME + "/sprint-cli/v2/tools/sprint-normalize.js")}\n` +
      `const r = normalize("fixture.md", { apply: true })\n` +
      `console.log("EXACT=" + r.exact)\n` +
      `console.log("KEPT=" + JSON.stringify(r.kept))\n`)
    const r = await sh(`bun run-normalize.js`)
    check(r.out.includes("EXACT=4"), true, "4 secoes reconhecidas por igualdade: Objetivo, Passos, O que entregou, Budget")
    check(r.out.includes('KEPT=["plan:Uma Secao Que Nao Casa Com Nada"]'), true, "secao fora do vocabulario fica livre, com o titulo do autor preservado — nada e descartado")

    const after = await sh(`cat fixture.md`)
    check(after.out.includes("## Por que este sprint existe agora"), true, "'Objetivo' normalizado para a ancora canonica do PLAN")
    check(after.out.includes("## Plano de materializacao"), true, "'Passos' normalizado para a ancora canonica")
    check(after.out.includes("## Uma Secao Que Nao Casa Com Nada"), true, "secao livre mantem o titulo original, nao e apagada")
    check(after.out.includes("texto que deve sobreviver como secao livre."), true, "corpo da secao livre sobrevive integralmente")
    check(after.out.includes("## O que aconteceu"), true, "'O que entregou' normalizado para a ancora canonica do REPORT")
    check(after.out.includes("texto do objetivo original."), true, "corpo da secao normalizada sobrevive integralmente")
  })

  t.sandbox("normalize: os 23 sprints reais do utest ja estao 100% normalizados (0 secoes livres)", async ({ sh, check, write }) => {
    const U = process.cwd()
    write("probe-real.mjs",
      `import { normalize } from ${JSON.stringify(process.env.HOME + "/sprint-cli/v2/tools/sprint-normalize.js")}\n` +
      `import { readdirSync } from "fs"\n` +
      `const files = readdirSync(${JSON.stringify(U + "/sprints")}).filter(f => /^\\d{3}-.+\\.md$/.test(f) && !/\\.(plan|report)\\.md$/.test(f))\n` +
      `let exact = 0, kept = 0\n` +
      `for (const f of files) {\n` +
      `  const r = normalize(${JSON.stringify(U + "/sprints/")} + f, { apply: false })\n` +
      `  if (!r) continue\n` +
      `  exact += r.exact; kept += r.kept.length\n` +
      `}\n` +
      `console.log("FILES=" + files.length)\n` +
      `console.log("EXACT=" + exact)\n` +
      `console.log("LIVRES=" + kept)\n`)
    const r = await sh(`bun probe-real.mjs`)
    check(r.out.includes("FILES=23"), true, "os 23 sprints unificados estao em sprints/ na raiz do utest")
    check(r.out.includes("LIVRES=0"), true, "nenhuma secao livre restante nos 23 sprints — a normalizacao ja rodou")
  })

  t.sandbox("gaps: sem par plan.md/report.md remanescente da leva original (001-023)", async ({ sh, check }) => {
    const U = process.cwd()
    const r = await sh(`ls ${U}/sprints/*.plan.md ${U}/sprints/*.report.md 2>/dev/null | grep -vE '02[4-8]-' || true`)
    check(r.out.trim(), "", "nenhum par .plan.md/.report.md da leva 001-023 sobrevive em sprints/ (024-028 sao sprints novos, fora do escopo desta feature)")
  })
}
