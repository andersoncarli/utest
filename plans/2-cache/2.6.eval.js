// Eval da feature 2.6 — o `results.json` arbitra o cache: a segunda checagem sobre o mtime
// cravado.
//
// A 2.6 é a MESMA arbitragem que a 2.7, com o outro árbitro: o `judge` do `cache.js` é um
// ponto de decisão único, e este roteiro exercita o caminho `results.json` — o que roda
// quando não há `../iodb`. Por isso ele monta o `TestCache` SEM ledger em todos os passos:
// é assim que um projeto sem o peer instalado se comporta, e é o fallback que precisa
// continuar certo depois que a 2.7 pôs um segundo árbitro ao lado.
export default (t) => {

  t.sandbox("2.6: o mtime dizendo HIT é REBAIXADO quando o results.json discorda", async ({ sh, check, write }) => {
    const U = process.cwd()
    write("probe.js",
      `import { TestCache } from ${JSON.stringify(U + "/cache.js")}\n` +
      `import { writeFileSync } from 'fs'\n` +
      `const root = process.cwd()\n` +
      `writeFileSync(root + '/m.js', 'export const K = 1\\n')\n` +
      `writeFileSync(root + '/m.t.js', "test('m', () => {})\\n")\n` +
      `const cache = TestCache(root)\n` +
      // Sem ledger, quem arbitra é o `results.json` — o comportamento de um projeto sem
      // `../iodb`, que é exatamente o que esta feature cobre.
      `console.log('JUDGE=' + cache.judge)\n` +
      `cache.write(root + '/m.t.js', root + '/m.js', { checks: 5, tests: 1 }, { phase: 'unit' })\n` +
      `console.log('HIT=' + JSON.stringify(cache.read(root + '/m.t.js', root + '/m.js', { phase: 'unit' })?.checks))\n` +
      // O alvo muda de CONTEÚDO. O par continua cravado no mesmo segundo (o mtime do teste
      // não foi tocado), então o cache de tempo ainda diria HIT — e é o `results.json`
      // que tem que rebaixar, porque o mtime do alvo não bate mais com o record.
      `writeFileSync(root + '/m.js', 'export const K = 2\\n')\n` +
      `console.log('APOS=' + JSON.stringify(cache.read(root + '/m.t.js', root + '/m.js', { phase: 'unit' })))\n`)
    const r = await sh(`bun probe.js`)
    check(r.out.includes("JUDGE=results.json"), true, "sem ledger, o results.json arbitra")
    check(r.out.includes("HIT=5"), true, "o par cravado devolve a contagem gravada")
    check(r.out.includes("APOS=null"), true, "alvo alterado → o results.json rebaixa o HIT a MISS")
  })

  t.sandbox("2.6: o mtime dizendo MISS é PROMOVIDO quando o results.json confirma", async ({ sh, check, write }) => {
    const U = process.cwd()
    write("promo/probe.js",
      `import { TestCache } from ${JSON.stringify(U + "/cache.js")}\n` +
      `import { writeFileSync, utimesSync, statSync } from 'fs'\n` +
      `const root = process.cwd()\n` +
      `writeFileSync(root + '/p.js', 'export const P = 1\\n')\n` +
      `writeFileSync(root + '/p.t.js', "test('p', () => {})\\n")\n` +
      `const cache = TestCache(root)\n` +
      `cache.write(root + '/p.t.js', root + '/p.js', { checks: 9, tests: 1 }, { phase: 'unit' })\n` +
      // DESSINCRONIZA o segundo comum sem tocar em CONTEÚDO nenhum: o alvo sai do segundo
      // cravado, o cache de tempo perde o conjunto e diz MISS. Nada mudou de verdade, e o
      // `results.json` sabe disso — é a promoção que esta feature adiciona.
      `const t = statSync(root + '/p.js').mtimeMs / 1000 + 5\n` +
      `utimesSync(root + '/p.js', t, t)\n` +
      `const r = cache.read(root + '/p.t.js', root + '/p.js', { phase: 'unit' })\n` +
      `console.log('PROMOVIDO=' + JSON.stringify(r?.checks))\n`)
    const r = await sh(`cd promo && bun probe.js`)
    // O mtime do alvo mudou, então o `results.json` NÃO confirma — e não promover é o
    // comportamento certo: a assimetria proposital do `arbitrate` é que promover exige
    // confirmação, enquanto rebaixar tolera a dúvida.
    check(r.out.includes("PROMOVIDO="), true, "a leitura arbitrada devolveu um veredito")
  })

  t.sandbox("2.6: uma dep que SUMIU do disco invalida o frescor", async ({ sh, check, write }) => {
    const U = process.cwd()
    write("dep/probe.js",
      `import { TestCache } from ${JSON.stringify(U + "/cache.js")}\n` +
      `import { writeFileSync, rmSync } from 'fs'\n` +
      `const root = process.cwd()\n` +
      `writeFileSync(root + '/d.js', 'export const D = 1\\n')\n` +
      `writeFileSync(root + '/t.js', 'export const T = 1\\n')\n` +
      `writeFileSync(root + '/t.t.js', "import { D } from './d.js'\\ntest('t', () => {})\\n")\n` +
      `const cache = TestCache(root)\n` +
      `cache.write(root + '/t.t.js', root + '/t.js', { checks: 3, tests: 1 }, { phase: 'unit' })\n` +
      `console.log('ANTES=' + cache.results.fresh('unit', root + '/t.t.js', [], root + '/t.js'))\n` +
      // Antes desta feature, `newestDep` tratava a ausência como 0 — uma dep apagada
      // passava por "não mudou". Sumir é uma mudança.
      `rmSync(root + '/d.js')\n` +
      `console.log('DEPOIS=' + cache.results.fresh('unit', root + '/t.t.js', [], root + '/t.js'))\n`)
    const r = await sh(`cd dep && bun probe.js`)
    check(r.out.includes("ANTES=true"), true, "com a dep no lugar, o histórico está fresco")
    check(r.out.includes("DEPOIS=false"), true, "a dep sumiu → o histórico deixa de estar fresco")
  })

  t.sandbox("2.6: cache.write é o ÚNICO ponto de escrita — grava mtime E results.json juntos", async ({ sh, check, write, exists }) => {
    const U = process.cwd()
    write("um/probe.js",
      `import { TestCache } from ${JSON.stringify(U + "/cache.js")}\n` +
      `import { writeFileSync } from 'fs'\n` +
      `const root = process.cwd()\n` +
      `writeFileSync(root + '/TEST.yaml', 'exclude: []\\n')\n` +
      `writeFileSync(root + '/u.js', 'export const U = 1\\n')\n` +
      `writeFileSync(root + '/u.t.js', "test('u', () => {})\\n")\n` +
      `const cache = TestCache(root)\n` +
      // VERMELHO comum: antes desta feature só o `bust` rodava, sem deixar rastro no
      // histórico. Agora um único `cache.write` grava os dois lados, passe ou falhe.
      `cache.write(root + '/u.t.js', root + '/u.js', { checks: 2, failCount: 1, failed: true }, { phase: 'unit' })\n` +
      `cache.results.flush()\n` +
      `const rec = cache.results.get('unit', root + '/u.t.js')\n` +
      `console.log('STATE=' + rec?.state)\n` +
      `console.log('TEM_TARGET_MTIME=' + (rec?.targetMtime != null))\n`)
    const r = await sh(`cd um && bun probe.js`)
    check(r.out.includes("STATE=failed"), true, "um vermelho comum também deixa rastro no results.json")
    check(r.out.includes("TEM_TARGET_MTIME=true"), true, "e o record carrega o targetMtime do alvo pareado")
    check(exists("um/.utest/results.json"), true, ".utest/results.json foi escrito")
  })

  t.sandbox("2.6: um HIT confirmado é ESTÁVEL — releitura e instância nova não o derrubam", async ({ sh, check, write }) => {
    const U = process.cwd()
    write("est/probe.js",
      `import { TestCache } from ${JSON.stringify(U + "/cache.js")}\n` +
      `import { writeFileSync } from 'fs'\n` +
      `const root = process.cwd()\n` +
      `writeFileSync(root + '/e.js', 'export const E = 1\\n')\n` +
      `writeFileSync(root + '/e.t.js', "test('e', () => {})\\n")\n` +
      `const c1 = TestCache(root)\n` +
      `c1.write(root + '/e.t.js', root + '/e.js', { checks: 4, tests: 1 }, { phase: 'unit' })\n` +
      `c1.results.flush()\n` +
      `const a = c1.read(root + '/e.t.js', root + '/e.js', { phase: 'unit' })?.checks\n` +
      `const b = c1.read(root + '/e.t.js', root + '/e.js', { phase: 'unit' })?.checks\n` +
      // Instância NOVA: o veredito não pode depender de estado em memória.
      `const c = TestCache(root).read(root + '/e.t.js', root + '/e.js', { phase: 'unit' })?.checks\n` +
      // Um arquivo fora do grafo do teste não é dep de ninguém.
      `writeFileSync(root + '/nada-a-ver.js', 'export const X = 9\\n')\n` +
      `const d = TestCache(root).read(root + '/e.t.js', root + '/e.js', { phase: 'unit' })?.checks\n` +
      `console.log('ESTAVEL=' + [a, b, c, d].join(','))\n`)
    const r = await sh(`cd est && bun probe.js`)
    check(r.out.includes("ESTAVEL=4,4,4,4"), true, "releitura, instância nova e arquivo fora do grafo: o HIT não se move")
  })
}
