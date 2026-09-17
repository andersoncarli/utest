---
sprint: 29
date: 2026-09-17
features: [10.1]
thread: null
---
# 029 — mover runtime para src/

Runtime do `utest` (39 arquivos .js/.t.js) movido da raiz para `src/`, com a dependência
externa `~/utils` resolvida via symlink `utest/utils` em vez de import relativo escalando
pra fora do repo.

## Objetivo

Sair de um runtime solto na raiz para `src/`, sem quebrar a dependência em `~/utils` nem a
cobertura de `sprint files`.

## O que foi feito

- `utest/utils` → symlink para `~/utils`; `utest/iodb` → symlink para `~/iodb` (mesmo
  padrão, achado durante a verificação — `state.js`/`ledger.js`/`fswatchSource.js`
  dependiam de `../iodb` do mesmo jeito).
- 39 arquivos renomeados via `sprint rename --apply` (preserva `files:` do frontmatter e
  todas as referências em docs/plans/sprints).
- Dois bugs de path expostos pela mudança de profundidade (`import.meta.dir` que assumia
  `src/` como subpasta, e agora já ESTAVA em `src/`): `src/trace.js:115` e
  `src/trace.t.js:163` duplicavam o segmento `src/` ao montar o caminho de
  `trace-preload.mjs` — corrigido.
- Symlink global stale (`~/.local/bin/utest` apontava pro `utest.js` antigo na raiz) —
  corrigido para `~/utest/src/utest.js`; isso causava os 3 crashes de `viewer.t.js`
  (`Executable not found in $PATH`) que só apareciam ao rodar a suite via subprocess.
- `package.json`: `main`/`dev`/`debug` → `src/index.js` (atualizados pelo próprio
  `sprint rename`); `bin.utest` fica `./utest.js` (ver correção abaixo).
- `.gitignore`: `/utils` e `/iodb` (symlinks para fora do repo, não versionados).
- **Correção**: `utest.js` foi movido de volta para a raiz a pedido do usuário — fica como
  entry point/CLI na raiz, todo o resto do runtime em `src/`. Ajustado depois do move:
  imports internos de `utest.js` (agora `./src/*` e `./utils/*`, não mais `../utils/*`),
  `src/index.js` (`import '../utest.js'`), `package.json.bin.utest` (`./utest.js`) e o
  symlink global `~/.local/bin/utest`.

## Verificação

`utest .` — 630/630 checks, igual ao baseline pré-reorg. `sprint files` sem regressão de
cobertura (25 fora do mapa, mesmo número de antes). `sprint eval 10.1 --yes` — 4/4 passou.
