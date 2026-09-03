---
sprint: 2
date: 2026-09-03
features: [1.2, 7.2, 4.1]
---
# Sprint 002 — report

Sprint retroativo. Desacople de bot/lib para utils/src, primeiros self-tests, e a evidência documentada do vazamento assíncrono cross-arquivo.

## O que entregou

- **Desacople de `bot/lib`** (`263ae23`, `789d99f`) — `utest.js`/`utest2.js`/`shims.js`
  passam a `utils/src/bus.js` + `withTempDir.js`; `G` é bootado antes dos módulos que
  dependem dele como global.
- **`check.t.js` (20 checks) + `test.t.js` (14 checks)** (`71f1ad5`) — os primeiros
  self-tests. `viewer.js` colapsa o glyph-run em contagem.
- **Evidência do vazamento** (`063f1d5`) — 12 linhas em `STATUS.md`: `io-nutshell.t.js` →
  `config.t.js`, "test.todo is not a function", total 433 vs 124 entre execuções da mesma
  suíte. Isolar cada suite estabiliza → é vazamento de processo compartilhado.

## Visão crítica

- **O desacople trocou `bot/lib` por `utils/src`, mas manteve o `G`.** `utest.js` ainda
  abre com `import { G } from '../utils/globals.d.js'; await G._ready` — um acoplamento
  externo duro, agora a outro submódulo. "Zero dependência" da fase scan (prometido no
  `TEST-MASTER-PLAN.md`) não se realizou.
- **A evidência do vazamento foi documentada, não consertada.** O diagnóstico está certo
  (isolar estabiliza), mas o fix (worker por arquivo) foi adiado — e continua adiado. O
  sprint 003 tapa só o caso do `check` tardio (`sealed`), não a exceção.
- `utest2.js` recebeu os mesmos 3 commits que `utest.js` — a dívida da cópia dupla foi
  *paga em dobro* nesta janela em vez de eliminada.

## Estado das frentes ao fim da janela

| frente | estado |
|---|---|
| 1 core | 🟡 — `check.t.js`/`test.t.js` verdes |
| 7 isolation | 🟠 — evidência documentada, fix adiado |
| 4 report | 🟠 — header de arquivo em contagens |
