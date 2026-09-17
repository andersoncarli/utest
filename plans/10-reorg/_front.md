---
front: 10
keyword: reorg
title: Reorganização da árvore
state: confirmed
updated: 2026-09-17
---
# [10] reorg — Reorganização da árvore

Reorganizar a árvore do `utest`, saindo de um runtime solto na raiz para uma estrutura
com `src/` — mantendo `utest.js` como entry point na raiz e resolvendo dependências
externas (`~/utils`, `~/iodb`) via symlink em vez de import relativo escalando pra fora
do repo.
