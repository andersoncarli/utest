# 028 — Plano: warning de test() chamado sem nome/função, e de .t.js sem nenhum test()

Plano do sprint 028 (feature 1.1).

## Objetivo

Pedido do usuario: "de fato, uma chamada de test()/check() na funcao deve gerar
pelo menos uma warning no console" — refinado apos pergunta de esclarecimento:

1. `test()` chamado sem nome (nao-string) ou sem funcao deve avisar.
2. Um `.t.js` que nunca chama `test()` (arquivo "cru", cenario do ISSUES/014) deve
   avisar que o arquivo nao usa a API.
3. `check()` fora de `test()` NAO deve avisar — uso legitimo para verificacoes
   baratas soltas no meio do codigo (confirmado explicitamente pelo usuario).

## Investigacao

Via Explore: `test(name, fn = () => {}, op = {})` em `src/test.js:4` nao valida nada
hoje. O default de `fn` complica a deteccao de "omitido" — `typeof fn` sozinho
nunca pega isso, porque o default ja e uma funcao valida; a distincao certa e
`arguments.length`. Convencao de warning ja usada no projeto: `process.stderr.write`
com ANSI amarelo (`\x1b[33m...\x1b[39m\n`), sem `console.warn` (ex: `utest.js:316`).

Deteccao de "arquivo sem test()": o loop de execucao por arquivo em `utest.js`
monta `fileRoot = test.begin(...)`, importa o `.t.js`, chama `test.end()`, e so
depois monta `suite.tests = fileRoot.tests`. O ponto certo e logo apos
`test.end()`: checar `fileRoot.tests.length === 0`, mas SO no caminho de
`import()` direto — um executor (`.tuit`/`.eval.js`) gera `test()` sinteticos a
partir de `steps`, e isso e um caminho diferente, nao o "arquivo cru".

## Passos

1. `src/test.js` — validar `name`/`fn` no topo de `test()`: `typeof name !== 'string'
   || arguments.length < 2 || typeof fn !== 'function'` dispara o warning.
2. `utest.js` — apos `test.end()` (loop de execucao por arquivo), se `!executor &&
   fileRoot.tests.length === 0`, avisar que o arquivo nao chamou `test()`.
3. `plans/1-core/1.1.eval.js` (novo — 1.1 nunca teve eval de feature) — 4 passos
   `t.sandbox` (regra dos 3, com uma 4a fixture pra provar o caso negativo): sem
   nome, sem funcao, arquivo cru, e uso normal (nao deve avisar).

## Verificacao

- 4 fixtures minimas provam cada warning e o caso "nao avisa".
- `utest .` / `utest . --force` no repo proprio: `✔630`, zero vermelho — nenhum
  `.t.js` existente do proprio `utest` dispara falso-positivo.
- `sprint eval 1.1 --yes`: 4/4 passos verdes.

## Criterio de pronto

Os dois warnings disparam nos cenarios certos e SO neles; suite propria
inalterada; `check()` fora de `test()` continua silencioso.
