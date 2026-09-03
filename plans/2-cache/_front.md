---
front: 2
keyword: cache
title: Cache — a regra sem furo
state: active
updated: 2026-09-03
---
# [2] cache — o que re-roda, e o que não

`cache.js` inteiro, atrás de `TestCache(root)`. O cache não tem banco nem hash: vive nos
timestamps que todo inode já tem. **Seguida à risca, a regra não tem furo** — e o critério
de aceite é duro: **quente e frio reportam o MESMO número** (hoje 320 na suíte própria).

Dois lados:

- **cache de tempo** (o mtime cravado) decide SE um arquivo re-roda. Carrega só a
  contagem de checks (o que cabe num mtime).
- **`.utest/results.json`** (`results`) é o outro lado: o histórico hierárquico por fase.
  É a FONTE do render (quente == frio), é o ÍNDICE (`utest 3.2` sem scan), e é a
  verificação de 2º nível (`fresh()` cruza o veredito por um caminho independente).

`scanner.js` é o único consumidor: os runners recebem o cache pronto de `scan()` e nunca
importam `cache.js`.

Coberto por `cache.t.js` (42 testes / 75 checks). Suite verde 2026-09-03.
