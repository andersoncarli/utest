import { writeFileSync } from 'node:fs'
// trace-preload.mjs — carregado por `bun --import` que um `.eval.js` splica na sua
// string de bash quando `UTEST_TRACE_PRELOAD` está no env (posto pelo `sh()` do
// `apps/eval/engine.js` sob `utest --trace`). Instala `globalThis.__uTrace` para o
// script filho marcar as suas fases caras (`chromium.launch`, `serve`, `open` —
// `plugins/html/input.check.mjs`), e despeja `<UTEST_TRACE_OUT>.<pid>` JSON no `exit`
// para o `utest` pai enxertar na folha `sh:` da sua árvore de trace. Inerte sem
// `UTEST_TRACE_OUT`.
//
// Sem hook de `import()` automático: o `Bun.plugin` onLoad de 1.3.12 exige devolver
// `{contents, loader}` — não serve como cronômetro passivo. As regiões declaradas
// cobrem o que domina os segundos do check (os `Bun.sleep`-poll e os `waitForTimeout`).

const OUT = process.env.UTEST_TRACE_OUT
if (OUT) {
  const t0 = performance.now()
  const now = () => performance.now() - t0
  const events = []

  globalThis.__uTrace = {
    region: async (name, fn) => {
      const startMs = now()
      try { return await fn() }
      finally { events.push({ kind: 'region', name, startMs, endMs: now() }) }
    },
    mark: (name) => events.push({ kind: 'mark', name, startMs: now(), endMs: now() }),
  }

  // `writeFileSync` importado NO TOPO, não por `require` dentro do handler: isto é um
  // módulo ESM, e sob `node` (onde os checks de browser rodam quando há browser
  // compartilhado) `require` não existe — o `catch {}` engolia o ReferenceError e o
  // fragmento sumia calado, deixando a folha `sh:` opaca no `--trace`. Sob `bun` havia
  // `require` e a diferença nunca aparecia.
  process.on('exit', () => {
    try {
      writeFileSync(`${OUT}.${process.pid}`,
        JSON.stringify({ pid: process.pid, totalMs: now(), events }))
    } catch {}
  })
}
