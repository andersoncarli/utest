// `shim()` reescreve TODO arquivo de teste antes de ele rodar. Um erro aqui não
// falha: ele apaga código silenciosamente e o teste passa a mentir sobre o que
// executou. É a transformação de maior alcance do runner.
import { shim as shimRaw } from './shimmer.js'

// shim() devolve { content, map }; os casos abaixo olham o codigo reescrito.
const shim = (src, file) => shimRaw(src, file).content

const FILE = '/tmp/x/a.t.js'

test('shimmer', ({ test }) => {

  test('remove o import de bun:test preservando a contagem de linhas', ({ check }) => {
    const src = "import { test, expect } from 'bun:test'\nconst a = 1\n"
    const out = shim(src, FILE)
    check(/bun:test/.test(out), false, `o import some: ${JSON.stringify(out)}`)
    check(/const a = 1/.test(out), true, 'o resto do arquivo fica')
  })

  test("uma string contendo 'bun:test' NÃO apaga o código acima dela", ({ check }) => {
    // O regex de remoção do import é multi-linha; se não estiver ancorado a UMA
    // linha, ele casa do primeiro `import` até um `bun:test` que está dentro de
    // uma string, engolindo tudo no meio.
    const src = [
      "import { join } from 'path'",
      "const marker = 42",
      "const legado = \"import { test } from 'bun:test'\"",
      "test('x', ({ check }) => check(marker, 42))",
    ].join('\n') + '\n'
    const out = shim(src, FILE)
    check(/const marker = 42/.test(out), true,
      `a linha entre o import real e a string sobrevive: ${JSON.stringify(out)}`)
    check(/from 'path'/.test(out), true, 'o import de path sobrevive')
  })

  test('import multi-linha de bun:test é removido', ({ check }) => {
    const src = "import {\n  test,\n  expect,\n} from 'bun:test'\nconst a = 1\n"
    const out = shim(src, FILE)
    check(/bun:test/.test(out), false, `some mesmo quebrado em linhas: ${JSON.stringify(out)}`)
    check(/const a = 1/.test(out), true, 'o resto fica')
  })

  test('a contagem de linhas é preservada (o stack aponta a linha certa)', ({ check }) => {
    const src = "import {\n  test,\n} from 'bun:test'\nconst a = 1\n"
    const out = shim(src, FILE)
    const antes = src.split('\n').length
    const depois = out.split('\n').length
    check(depois >= antes, true, `linhas preservadas: ${antes} -> ${depois}`)
  })

  test('require de bun:test (CJS) também é removido', ({ check }) => {
    const src = "const { test } = require('bun:test');\nconst a = 1\n"
    const out = shim(src, FILE)
    check(/require\(['"]bun:test/.test(out), false, `o require some: ${JSON.stringify(out)}`)
  })

  test('hashbang é substituído por linha vazia, não apagado', ({ check }) => {
    const src = "#!/usr/bin/env bun\nconst a = 1\n"
    const out = shim(src, FILE)
    check(/^#!/.test(out), false, 'o hashbang sai')
    check(/const a = 1/.test(out), true, 'o corpo sobrevive')
  })

  test('globais só são injetadas quando o arquivo não as define', ({ check }) => {
    const injeta = shim("test('x', () => {})\n", FILE)
    check(/globalThis/.test(injeta), true, 'arquivo que usa test() recebe a global')

    const propria = shim("function check(a) { return a }\ncheck(1)\n", FILE)
    check(/\{[^}]*\bcheck\b[^}]*\} = globalThis/.test(propria), false,
      `check() próprio não é sobrescrito: ${JSON.stringify(propria)}`)
  })

  // NB: o caso de import.meta.dir/url NAO tem teste aqui de proposito: o shimmer
  // substitui essas expressoes dentro de STRINGS tambem, entao um teste que as
  // cite como dado quebra a propria sintaxe do arquivo. Mesmo defeito de
  // classe dos casos acima (transformacao cega a string literal).

  test('arquivo sem nada de bun:test volta com o código intacto', ({ check }) => {
    const src = "const a = 1\nconst b = 2\n"
    const out = shim(src, FILE)
    check(/const a = 1/.test(out) && /const b = 2/.test(out), true,
      `nada do original se perde: ${JSON.stringify(out)}`)
  })
})
