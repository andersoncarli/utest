---
sprint: 28
date: 2026-09-16
features: [1.1]
thread: null
---
# 028 — warning de test() chamado sem nome/funcao, e de .t.js sem nenhum test()

Intro: `test()` chamado sem nome/função, ou um `.t.js` que nunca chama `test()`,
agora avisam em stderr — sem afetar o veredito do teste.

## Objetivo

Pedido do usuario, refinado apos esclarecimento: (1) `test()` sem nome ou sem
função avisa; (2) `.t.js` sem nenhum `test()` (arquivo "cru", ISSUES/014) avisa;
(3) `check()` fora de `test()` NÃO avisa (uso legítimo, confirmado pelo usuário).

## O que mudou

- **`src/test.js`**: `test(name, fn = () => {}, op = {})` ganhou uma validação no
  topo — `typeof name !== 'string' || arguments.length < 2 || typeof fn !==
  'function'` dispara `process.stderr.write` em amarelo (convenção já usada no
  projeto, ex. `utest.js:316` — sem `console.warn`). `arguments.length` foi
  necessário porque o default de `fn` (`() => {}`) já é uma função válida —
  `typeof fn` sozinho nunca detectaria "omitido".
- **`utest.js`**: logo após `test.end()` no loop de execução por arquivo, se
  `!executor && fileRoot.tests.length === 0`, avisa que o arquivo não chamou
  `test()` nenhuma vez. Restrito ao caminho de `import()` direto — um executor
  (`.tuit`/`.eval.js`) gera `test()` sintéticos a partir de `steps`, cenário
  diferente do "arquivo cru".
- **`plans/1-core/1.1.eval.js`** (novo — 1.1 nunca tinha eval de feature próprio):
  4 passos `t.sandbox` — sem nome, sem função, arquivo cru, e uso normal (caso
  negativo, prova que não avisa indevidamente).

## Verificação

- 4 fixtures mínimas, cada uma provando um cenário: `sem-nome.t.js`,
  `sem-fn.t.js`, `cru.t.js`, `normal.t.js`.
- `utest .` / `utest . --force` no repo próprio: `✔630`, zero vermelho — nenhum
  `.t.js` existente do projeto dispara falso-positivo com os novos warnings.
- `sprint eval 1.1 --yes`: 4/4 passos verdes.
