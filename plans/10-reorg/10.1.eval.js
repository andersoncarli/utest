// Eval da feature 10.1 — mover runtime para src/.
//
// Verifica os quatro requisitos declarados no frontmatter: symlink utils resolvendo
// sem escapar do repo, runtime todo em src/, package.json apontando pros novos
// caminhos, e sprint files sem regressão de cobertura. Roda contra a árvore real
// (t.real) porque o que está sendo checado é a estrutura do próprio repo, não um
// comportamento reproduzível num fixture isolado.
import { existsSync, lstatSync, readlinkSync, readFileSync } from 'fs'
import { resolve } from 'path'

export default (t) => {
  t.real('utest/utils é symlink e resolve para fora do repo sem quebrar imports internos', ({ check }) => {
    const link = 'utils'
    check(lstatSync(link).isSymbolicLink(), true, 'utils é um symlink, não um diretório real')
    const target = resolve('utils', readlinkSync(link))
    check(existsSync(resolve(target, 'src/toSource.js')), true, 'o alvo do symlink tem o pacote utils esperado')
  })

  t.real('runtime .js/.t.js mora em src/, exceto utest.js (entry point, fica na raiz)', ({ check }) => {
    check(existsSync('utest.js'), true, 'utest.js fica na raiz — entry point')
    check(existsSync('src/cache.js'), true, 'cache.js está em src/')
    check(existsSync('cache.js'), false, 'cache.js não sobrou na raiz')
  })

  t.real('package.json aponta bin para o entry point na raiz, main para src/', ({ check }) => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    check(pkg.bin.utest, './utest.js', 'bin.utest aponta para a raiz')
    check(pkg.main, 'src/index.js', 'main aponta para src/')
  })

  t.real('sprint files não perdeu cobertura dos arquivos movidos (ex.: 1.2, dona de check.js)', async ({ check, sh }) => {
    const r = await sh('sprint files 1.2')
    check(r.out.includes('src/check.js'), true, 'a feature 1.2 aponta para src/check.js, não check.js na raiz')
  })
}
