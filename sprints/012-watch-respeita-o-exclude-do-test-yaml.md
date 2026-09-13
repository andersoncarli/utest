---
sprint: "012"
slug: "watch-respeita-o-exclude-do-test-yaml"
title: "watch respeita o exclude do TEST.yaml"
features: ["3.1"]
budget: null
state: "closed"
opened: "2026-09-05"
closed: "2026-09-05"
migrated: "0.2"
---

# 012 — watch respeita o exclude do TEST.yaml

Plano do sprint 012 (feature 3.1).

# PLAN

## Por que este sprint existe agora

O modo `utest . -w` / `--watch` vigiava a árvore inteira: `fs.watch(root, {
recursive: true })` faz o SO percorrer e monitorar TODO subdiretório —
`node_modules/`, `archive/`, `.git/` — e o único filtro era uma denylist
hard-coded (`/node_modules|\.utest/`) aplicada no callback, depois do fato. Em
projeto grande isso estoura o limite de watches do inotify e reage a churn
irrelevante.

O watch deve observar só o domínio declarado no `TEST.yaml` — o mesmo `exclude`
(global + fase) que o `scanner` já usa para o walk da suíte.

## Plano de materializacao

1. **scanner.js** — expor a maquinaria de filtro:
   - `makeFilter` deixa de ser interno (`export function makeFilter`).
   - novo `export function excludeFilter(configPath, phase = 'unit')`: lê o
     `TEST.yaml`, junta `cfg.exclude` + `cfg[phase].exclude`, devolve
     `makeFilter([], exclude)` — só a face `.excluded(rel)` interessa.
   verify: `bun utest.js scanner.t.js`

2. **utest.js** — reescrever o bloco `fs.watch` do watch mode:
   - importar `excludeFilter` de `./scanner.js`.
   - construir `excl = excludeFilter(configPath, phaseArg || 'unit')` (fallback
     `{ excluded: () => false }` se não há `TEST.yaml`).
   - `isPruned(rel)` = `.utest` (o cache, sempre fora) OU `excl.excluded(rel)`.
   - substituir o `fs.watch(root, { recursive: true }, …)` por `watchDir(dir)`
     recursivo em JS: registra `fs.watch` NÃO-recursivo por diretório e NÃO
     desce em diretório podado. O callback reusa `isPruned` no arquivo tocado.
   verify: smoke manual — sandbox com `node_modules/`, `archive/` e um `.t.js`;
     tocar `node_modules/**` e `archive/**` não dispara rerun, tocar o `.t.js`
     dispara.

3. **scanner.t.js** — cobrir `excludeFilter`:
   - exclui pelo glob global; soma o exclude da fase; `TEST.yaml` sem `exclude`
     não exclui nada.
   verify: `bun utest.js scanner.t.js` (28 → 35 checks)

## Criterio de pronto

- `sprint test 3.1` verde.
- `sprint test` (suíte inteira) verde.
- smoke manual do watch: `node_modules/` e `archive/` (do `exclude` do
  `TEST.yaml`) ignorados; mudança de fonte real ainda re-roda.

# REPORT

Intro: `utest . -w` deixou de vigiar a árvore inteira — agora o watcher só
observa o domínio do `TEST.yaml`, podando `node_modules/`, `archive/` e o que o
`exclude` (global + fase) listar em vez de registrar um `fs.watch` recursivo na
raiz e filtrar o callback depois do fato.

## O que aconteceu

**Objetivo e plano de materialização completos** em "Por que este sprint existe agora" e
"Plano de materializacao" (PLAN) — implementados como descrito, sem desvio.

**O que mudou além do plano**

- **plans/3-scan/3.1.eval.js** — roteiro novo da feature:
  - `sandbox`: `excludeFilter("TEST.yaml", "unit")` contra o `scanner.js` real —
    `node_modules/**`, `archive/**` e o `dist/**` da fase casam; `src/scanner.js`
    não.
  - `real`: sobe `utest . -w` numa fixture com `node_modules/` e `archive/`;
    churn nesses dois (ambos no `exclude`) não dispara rerun, editar `a.t.js`
    (fonte real) dispara.

## Prova

- `sprint test 3.1` — verde (`bun utest.js scanner.t.js`, 35 checks).
- `sprint test` — suíte inteira verde (📄9 🧪168 ✔469).
- `sprint eval 3.1 --yes` — sandbox + real verdes → 🟡 → 🟢 avaliada.
- `sprint docs` — ok.
