// Eval da feature 1.1 (sprint 028): dois warnings de uso incorreto da API, sem
// afetar o veredito do teste (o arquivo continua passando/falhando pelo que
// realmente testou — o warning é so um aviso pro autor, em stderr).
//
// check() fora de test() DELIBERADAMENTE nao gera warning — uso legitimo pra
// verificacoes baratas soltas no meio do codigo (confirmado pelo usuario).
export default (t) => {
  t.sandbox("test() sem nome (name ausente/nao-string) avisa em stderr", async ({ sh, check, write }) => {
    write("TEST.yaml", 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n')
    write("sem-nome.t.js", "test(undefined, ({ check }) => check(1, 1))\n")
    const r = await sh("utest sem-nome.t.js --force")
    check(/utest: test\(\) chamado sem nome/.test(r.err || r.out), true,
      `avisa sobre nome ausente: ${JSON.stringify(r.err || r.out)}`)
  })

  t.sandbox("test() sem função (fn omitido) avisa em stderr", async ({ sh, check, write }) => {
    write("TEST.yaml", 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n')
    write("sem-fn.t.js", "test('sem funcao')\n")
    const r = await sh("utest sem-fn.t.js --force")
    check(/utest: test\(\) chamado sem nome\/função/.test(r.err || r.out), true,
      `avisa sobre função ausente: ${JSON.stringify(r.err || r.out)}`)
  })

  t.sandbox(".t.js sem nenhum test() (arquivo cru) avisa em stderr", async ({ sh, check, write }) => {
    write("TEST.yaml", 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n')
    write("cru.t.js", 'console.assert(1 + 1 === 2, "math ok")\n')
    const r = await sh("utest cru.t.js --force")
    check(/não chamou test\(\) nenhuma vez/.test(r.err || r.out), true,
      `avisa sobre arquivo sem test(): ${JSON.stringify(r.err || r.out)}`)
  })

  t.sandbox("test() normal chamado corretamente NÃO avisa (uso legítimo)", async ({ sh, check, write }) => {
    write("TEST.yaml", 'exclude: []\nunit:\n  include:\n    - "**/*.t.js"\n')
    write("normal.t.js", "test('normal', ({ check }) => check(1, 1))\n")
    const r = await sh("utest normal.t.js --force")
    check(/utest: test\(\)|não chamou test/.test(r.err || r.out), false,
      `test() normal não avisa: ${JSON.stringify(r.err || r.out)}`)
  })
}
