# 029 — Plano: mover runtime para src/

Detalhe completo em [plans/10-reorg/10.1-mover-runtime-para-src-.md](../plans/10-reorg/10.1-mover-runtime-para-src-.md).

## Objetivo

Mover o runtime do `utest` (hoje solto na raiz — `utest.js`, `src/cache.js`, `src/viewer.js`,
`src/scanner.js`, etc.) para `src/`, resolvendo a dependencia externa `../utils/*` via
symlink `utest/utils -> ~/utils` para que a distancia relativa nao dependa de quao fundo
`src/` fique.

## Passos

1. Symlink `utest/utils` -> `~/utils` (feito).
2. `sprint rename <old> <new> --apply` por arquivo, para manter `files:` do frontmatter
   coerente e `sprint files` sem regressao de cobertura.
3. Reescrever imports `../utils/...` para a nova posicao relativa ao symlink.
4. `package.json`: `bin`/`main` -> novos caminhos.
5. `utest .` + `sprint files` para confirmar.

## Criterio de pronto

`utest .` passa verde, `sprint files` mapeia os arquivos movidos sem buraco novo,
`package.json` resolve o binario corretamente.
