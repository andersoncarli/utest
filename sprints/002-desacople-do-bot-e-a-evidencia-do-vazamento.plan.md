# Sprint 002 — desacople do `bot`, self-tests, e a evidência do vazamento

> Sprint retroativo, reconstruído em 2026-09-03.

## Janela

`cd4c69a` … `063f1d5` (2026-08-21). 5 commits, um dia.

## Context

`utest/` era um submódulo acoplado a `bot/lib` (`bus`, `withTempDir`). Para virar uma
ferramenta reusável (o soml começaria a usá-la), esse cordão precisava ser cortado. No
mesmo dia, a suíte inteira rodando in-process expôs um comportamento instável.

## Objetivo

1. **Desacoplar de `bot/lib`** — passar a importar de `utils/src/` (o submódulo neutro):
   `bus.js`, `withTempDir.js`, e o boot do `G` antes de qualquer módulo que dependa dele.
2. **Self-tests** para `check.js` e `test.js` — o runner testando a si mesmo.
3. **Documentar** a evidência do vazamento assíncrono cross-arquivo.

## Frentes tocadas

- **1 core** — `check.t.js`, `test.t.js` (os primeiros self-tests); `test.js` ganha
  `_loadingFile` → `address`.
- **7 isolation** — a evidência de `063f1d5`: rodando `~/bot` inteiro in-process, o
  arquivo 💥 muda entre execuções e a contagem varia. Diagnóstico: exceção assíncrona
  tardia atribuída ao arquivo errado.
- **4 report** — `viewer.js` colapsa o glyph-run do header de arquivo em contagens
  (`shell.t.js ✔97 ✘3`).

## Requisitos verificáveis

- `utest.js` não importa nada de `bot/lib` — só `utils/src/`.
- `check.t.js` e `test.t.js` verdes.
- `STATUS.md` documenta a reprodução do vazamento (data, arquivos, sintoma).
