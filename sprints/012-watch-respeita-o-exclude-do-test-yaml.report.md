---
sprint: 12
date: 2026-09-05
features: [3.1]
thread: null
---
# 012 — watch respeita o exclude do TEST.yaml

Intro: `utest . -w` deixou de vigiar a árvore inteira — agora o watcher só
observa o domínio do `TEST.yaml`, podando `node_modules/`, `archive/` e o que o
`exclude` (global + fase) listar em vez de registrar um `fs.watch` recursivo na
raiz e filtrar o callback depois do fato.

## Objetivo

O modo watch fazia `fs.watch(root, { recursive: true })`: o SO percorre e
monitora TODO subdiretório da raiz — `node_modules/`, `archive/`, `.git/` — e o
único filtro era uma denylist hard-coded (`/node_modules|\.utest/`) aplicada no
callback, tarde demais. Em projeto grande isso estoura o limite de watches do
inotify e faz o watch reagir a churn de dependência.

O watch passa a observar só o `exclude` declarado no `TEST.yaml` — o mesmo
conjunto (global + fase) que o `scanner` já usa no walk da suíte.

## O que mudou

- **scanner.js**
  - `makeFilter` deixou de ser interno — agora `export`.
  - novo `export function excludeFilter(configPath, phase = 'unit')`: lê o
    `TEST.yaml`, soma `cfg.exclude` + `cfg[phase].exclude`, devolve
    `makeFilter([], exclude)` — só a face `.excluded(rel)` interessa ao watch.

- **utest.js** (bloco `if (watch)`)
  - importa `excludeFilter` de `./scanner.js`.
  - `excl = excludeFilter(configPath, phaseArg || 'unit')` (fallback
    `{ excluded: () => false }` quando não há `TEST.yaml`).
  - `isPruned(rel)` = `.utest` (o cache, sempre fora) OU `excl.excluded(rel)`.
  - o `fs.watch(root, { recursive: true }, …)` virou `watchDir(dir)` recursivo
    em JS: registra `fs.watch` NÃO-recursivo por diretório e NÃO desce em
    diretório podado. O callback reusa `isPruned` no arquivo tocado.

- **scanner.t.js** — `excludeFilter` coberto: glob global exclui; exclude da
  fase soma ao global; `TEST.yaml` sem `exclude` não exclui nada. (28 → 35 checks)

- **plans/3-scan/3.1.eval.js** — roteiro novo da feature:
  - `sandbox`: `excludeFilter("TEST.yaml", "unit")` contra o `scanner.js` real —
    `node_modules/**`, `archive/**` e o `dist/**` da fase casam; `src/scanner.js`
    não.
  - `real`: sobe `utest . -w` numa fixture com `node_modules/` e `archive/`;
    churn nesses dois (ambos no `exclude`) não dispara rerun, editar `a.t.js`
    (fonte real) dispara.

## Verificação

- `sprint test 3.1` — verde (`bun utest.js scanner.t.js`, 35 checks).
- `sprint test` — suíte inteira verde (📄9 🧪168 ✔469).
- `sprint eval 3.1 --yes` — sandbox + real verdes → 🟡 → 🟢 avaliada.
- `sprint docs` — ok.
