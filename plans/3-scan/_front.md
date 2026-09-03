---
front: 3
keyword: scan
title: Scan — descoberta, pareamento, vocabulário
state: active
updated: 2026-09-03
---
# [3] scan — o que entra na suíte, e o que ele mede

`scanner.js` + `kinds.js`. A pipeline: walk por glob do `TEST.yaml` → separa testes de
fontes → `findTarget` pareia cada teste ao seu alvo → `scan()` devolve
`{ entries, uncovered, cache }`. `kinds.js` é o vocabulário de sufixos declarado UMA vez,
com os ganchos (`register`, `registerExecutor`, `registerEntries`, `registerPhaseSetup`)
que deixam um consumidor externo (a fase `eval` do soml) reusar o runner sem forkar o
regex.

Coberto por `scanner.t.js` (19/26) e `kinds.t.js` (8/22). Suite verde 2026-09-03.
