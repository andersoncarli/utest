// Eval da feature 8.1 — o ledger append-only encadeado sobre iodb.
// Prova de campo: abrir o ledger de verdade (contra o `../iodb` real do projeto),
// gravar uma rodada completa (start/test/end + um append de plugin fora da rodada),
// e verificar a cadeia inteira — inclusive que adulterar um registro no meio
// derruba `valid` a partir dali. É o mesmo roteiro do critério da feature.
export default (t) => {
  t.sandbox("ledger: rodada completa grava run:start+test:result+run:end e verify() fecha valida", async ({ sh, check, write, exists }) => {
    const U = process.cwd() // ROOT do utest — de onde ../iodb é visível
    write("a.t.js", "// fixture exercitada pelo ledger\n")
    write("probe.js",
      `import { openLedger } from ${JSON.stringify(U + "/ledger.js")}\n` +
      `const root = process.cwd()\n` +
      `const ledger = await openLedger(root, { phase: "eval" })\n` +
      `ledger.start([root + "/a.t.js"])\n` +
      `ledger.test(root + "/a.t.js", { name: "a.t.js", status: "passed", elapsed: 3, cached: false })\n` +
      `ledger.write("plugin:custom", { anything: "fora da rodada" })\n` +
      `ledger.end({ tests: 1, failed: 0 })\n` +
      `const v = ledger.verify()\n` +
      `console.log("RUN_ID_TYPE=" + typeof ledger.runId)\n` +
      `console.log("VERIFY_VALID=" + v.valid)\n`)
    const r = await sh(`bun probe.js`)
    check(r.out.includes("RUN_ID_TYPE=string"), true, "runId gerado")
    check(r.out.includes("VERIFY_VALID=true"), true, "cadeia fecha válida com start+test+plugin+end")

    check(exists(".utest/ledger.dash"), true, ".utest/ledger.dash existe após a rodada")
  })

  t.sandbox("ledger: adulterar um registro no meio derruba valid a partir dali", async ({ sh, check, write }) => {
    const U = process.cwd()
    write("probe-write.js",
      `import { openLedger } from ${JSON.stringify(U + "/ledger.js")}\n` +
      `const root = process.cwd()\n` +
      `const files = []\n` +
      `for (let i = 0; i < 10; i++) files.push(root + "/f" + i + ".t.js")\n` +
      `const ledger = await openLedger(root, { phase: "eval" })\n` +
      `ledger.start(files)\n` +
      `for (const f of files) ledger.test(f, { name: f, status: "passed", elapsed: 1 })\n` +
      `ledger.end({ tests: files.length, failed: 0 })\n` +
      `console.log("BEFORE_VALID=" + ledger.verify().valid)\n`)
    const before = await sh(`bun probe-write.js`)
    check(before.out.includes("BEFORE_VALID=true"), true, "cadeia íntegra antes da adulteração")

    // adultera um registro no meio do .dash (após genesis+projeção+run:start, um test:result)
    const tamper = await sh(
      `node -e '` +
      `const fs=require("fs");` +
      `const p=".utest/ledger.dash";` +
      `const lines=fs.readFileSync(p,"utf8").split("\\n").filter(Boolean);` +
      `const idx=3;` +
      `const t=lines[idx];` +
      `const h=t.lastIndexOf("#");` +
      `lines[idx]=t.slice(0,h).replace("\\"status\\":\\"passed\\"","\\"status\\":\\"tampered\\"")+t.slice(h);` +
      `fs.writeFileSync(p, lines.join("\\n")+"\\n");` +
      `'`)
    check(tamper.exitCode, 0, "adulteração aplicada no .dash")

    write("probe-verify.js",
      `import { openLedger } from ${JSON.stringify(U + "/ledger.js")}\n` +
      `const ledger = await openLedger(process.cwd(), { phase: "eval" })\n` +
      `const v = ledger.verify()\n` +
      `console.log("AFTER_VALID=" + v.valid)\n` +
      `console.log("FAILED_AT=" + v.failedAt)\n`)
    const after = await sh(`bun probe-verify.js`)
    check(after.out.includes("AFTER_VALID=false"), true, "adulteração no meio derruba a cadeia")
  })

  // Roda isolado num subdiretório próprio — os passos sandbox deste arquivo compartilham a
  // mesma árvore scratch em sequência, e os passos anteriores já deixaram `.utest/ledger.dash`
  // na raiz. `enabled:false` é testado num `root` novo, nunca tocado antes.
  t.sandbox("ledger: custo zero quando desligado (enabled:false) — degrada no-op", async ({ sh, check, write, exists }) => {
    const U = process.cwd()
    write("noop-root/probe-noop.js",
      `import { openLedger } from ${JSON.stringify(U + "/ledger.js")}\n` +
      `const ledger = await openLedger(process.cwd(), { enabled: false })\n` +
      `ledger.start([]); ledger.test("x", {}); ledger.end({})\n` +
      `console.log("RUN_ID=" + ledger.runId)\n` +
      `console.log("VERIFY_VALID=" + ledger.verify().valid)\n`)
    const r = await sh(`cd noop-root && bun probe-noop.js`)
    check(r.out.includes("RUN_ID=null"), true, "enabled:false não gera runId")
    check(r.out.includes("VERIFY_VALID=true"), true, "no-op verify() sempre valid")

    check(exists("noop-root/.utest/ledger.dash"), false, "nenhum .utest/ledger.dash é criado quando desligado")
  })
}
