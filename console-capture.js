// utest/console-capture.js — um teste que usa `console.log`/`console.error` direto (não o
// `log()`/`debug()` injetado no contexto) vaza pro stdout de VERDADE, mesmo com o arquivo
// inteiro verde — só devia aparecer de novo com `-v:3`. Compartilhado porque `utest.js` e
// `runner.js` têm CADA UM o próprio `runTest` (a fase `eval`, via `apps/eval/engine.js`,
// roda sobre o de `runner.js`) — sem isto num só lugar, o vazamento voltaria pela porta que
// não foi tapada.
//
// `console.*` é global; salvar/restaurar em volta de UM `fn` só é seguro porque o runner é
// sequencial (um leaf de cada vez — nada roda dois `fn` ao mesmo tempo no mesmo processo).
export function captureConsole(t) {
  const saved = { log: console.log, error: console.error, warn: console.warn, info: console.info }
  const push = (kind) => (...a) => t.output.push([kind, a])
  console.log = push('log')
  console.error = push('error')
  console.warn = push('warn')
  console.info = push('info')
  return () => Object.assign(console, saved)
}

export default { captureConsole }
