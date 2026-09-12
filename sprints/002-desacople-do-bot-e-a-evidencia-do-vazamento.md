---
sprint: "002"
slug: "desacople-do-bot-e-a-evidencia-do-vazamento"
title: "Sprint 002 — report"
features: ["1.2", "7.2", "4.1"]
budget: null
state: "closed"
opened: "2026-09-03"
closed: "2026-09-03"
migrated: "0.2"
---

# 002 — Sprint 002 — report

> Sprint retroativo, reconstruído em 2026-09-03.

# PLAN

## Por que este sprint existe agora

**Janela**

`cd4c69a` … `063f1d5` (2026-08-21). 5 commits, um dia.

**Context**

`utest/` era um submódulo acoplado a `bot/lib` (`bus`, `withTempDir`). Para virar uma
ferramenta reusável (o soml começaria a usá-la), esse cordão precisava ser cortado. No
mesmo dia, a suíte inteira rodando in-process expôs um comportamento instável.

**Objetivo**

1. **Desacoplar de `bot/lib`** — passar a importar de `utils/src/` (o submódulo neutro):
   `bus.js`, `withTempDir.js`, e o boot do `G` antes de qualquer módulo que dependa dele.
2. **Self-tests** para `check.js` e `test.js` — o runner testando a si mesmo.
3. **Documentar** a evidência do vazamento assíncrono cross-arquivo.

## Features que este sprint toca

- **1 core** — `check.t.js`, `test.t.js` (os primeiros self-tests); `test.js` ganha
  `_loadingFile` → `address`.
- **7 isolation** — a evidência de `063f1d5`: rodando `~/bot` inteiro in-process, o
  arquivo 💥 muda entre execuções e a contagem varia. Diagnóstico: exceção assíncrona
  tardia atribuída ao arquivo errado.
- **4 report** — `viewer.js` colapsa o glyph-run do header de arquivo em contagens
  (`shell.t.js ✔97 ✘3`).

## Criterio de pronto

- `utest.js` não importa nada de `bot/lib` — só `utils/src/`.
- `check.t.js` e `test.t.js` verdes.
- `STATUS.md` documenta a reprodução do vazamento (data, arquivos, sintoma).

# REPORT

Sprint retroativo. Desacople de bot/lib para utils/src, primeiros self-tests, e a evidência documentada do vazamento assíncrono cross-arquivo.

## O que aconteceu

- **Desacople de `bot/lib`** (`263ae23`, `789d99f`) — `utest.js`/`utest2.js`/`shims.js`
  passam a `utils/src/bus.js` + `withTempDir.js`; `G` é bootado antes dos módulos que
  dependem dele como global.
- **`check.t.js` (20 checks) + `test.t.js` (14 checks)** (`71f1ad5`) — os primeiros
  self-tests. `viewer.js` colapsa o glyph-run em contagem.
- **Evidência do vazamento** (`063f1d5`) — 12 linhas em `STATUS.md`: `io-nutshell.t.js` →
  `config.t.js`, "test.todo is not a function", total 433 vs 124 entre execuções da mesma
  suíte. Isolar cada suite estabiliza → é vazamento de processo compartilhado.

## Onde o PLAN errou

- **O desacople trocou `bot/lib` por `utils/src`, mas manteve o `G`.** `utest.js` ainda
  abre com `import { G } from '../utils/globals.d.js'; await G._ready` — um acoplamento
  externo duro, agora a outro submódulo. "Zero dependência" da fase scan (prometido no
  `TEST-MASTER-PLAN.md`) não se realizou.
- **A evidência do vazamento foi documentada, não consertada.** O diagnóstico está certo
  (isolar estabiliza), mas o fix (worker por arquivo) foi adiado — e continua adiado. O
  sprint 003 tapa só o caso do `check` tardio (`sealed`), não a exceção.
- `utest2.js` recebeu os mesmos 3 commits que `utest.js` — a dívida da cópia dupla foi
  *paga em dobro* nesta janela em vez de eliminada.

## O que fica aberto

| frente | estado |
|---|---|
| 1 core | 🟡 — `check.t.js`/`test.t.js` verdes |
| 7 isolation | 🟠 — evidência documentada, fix adiado |
| 4 report | 🟠 — header de arquivo em contagens |
