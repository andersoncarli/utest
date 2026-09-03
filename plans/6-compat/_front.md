---
front: 6
keyword: compat
title: Compat — bun:test, jest, .tuit, e a saída dessa dependência
state: active
updated: 2026-09-03
---
# [6] compat — rodar o que já existe, e sair aos poucos

Uma suíte escrita para `bun:test`/`jest` roda no utest sem reescrita: `shims.js` fornece
`describe`/`it`/`expect` (~40 matchers), lifecycle hooks e `spyOn`; o plugin `onLoad`
comenta os imports de `bun:test`/`node:test` e injeta os shims. `migrate.js` é o caminho
de SAÍDA — codemod determinístico `expect()` → `check()`. `.tuit` é o formato próprio de
snapshot ASCII (JSON + arte intercalados).

Nenhum desses tem `.t.js` dedicado hoje — é a dívida da frente.
