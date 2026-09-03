---
front: 4
keyword: report
title: Report — compacto por desenho, expressivo quando precisa
state: active
updated: 2026-09-03
---
# [4] report — o placar e o drill-in

`viewer.js` + o bloco de render de `utest.js`. Compacto por desenho: a suíte inteira com
45 vermelhos em ~23 linhas. **O tempo é SEMPRE `Σ lastMs`** (do storage) — mesmo número
quente ou frio, o cache fica invisível. **`🐢N` sempre significa SEGUNDOS**, nunca uma
contagem.

Três degraus de verbosidade DERIVADOS do escopo: largo (`.`, raiz, fase) → v1 compacto;
uma FRENTE / feature → v2 (re-executa, erro + endereço no stack); um ARQUIVO só → v3 (v2
+ o `log()` do teste). Um `-v:N` explícito manda.

Coberto por `viewer.t.js` (23/83). Suite verde 2026-09-03.
