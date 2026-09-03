# Sprint 003 — a regra do cache sem furo

> Sprint retroativo, reconstruído em 2026-09-03.

## Janela

`d9a14ad` … `b93b49e` (2026-09-01). 2 commits.

## Context

O cache anterior usava bucket de **minuto**, sem grafo de deps. Dois furos reais:
uma edição no mesmo minuto era invisível (o teste pulava como verde); um `export` removido
em `scl/theme-params.js`, dois saltos além do alvo pareado, não invalidava nada — o crash
só aparecia com `--force`. "Um cache que serve verde sobre código quebrado é pior que não
ter cache."

## Objetivo

Reescrever a regra do cache para **não ter furo se seguida à risca**, vivendo inteira nos
timestamps que todo inode já tem:

- ALVO cravado no **segundo** da última alteração; ms = contagem de checks (0 = verde,
  1 = falhou).
- CONJUNTO (alvo + testes) válido só quando todos no mesmo segundo E o alvo cravado.
- Grafo de deps que segue `import` — inclusive o de **efeito colateral** (`import './x'`
  sem `from`), que é como um plugin se registra.
- ms fracionário (arquivo escrito) ≠ ms inteiro (`utimesSync`) — separa carimbo de edição.
- Deps medidas contra o `atime` (precisão cheia), não o segundo cravado.

E, no mesmo movimento: `kinds.js` (o vocabulário de sufixos num lugar) e `leak.t.js`
(prender a mecânica do `check` tardio + o `clearTimeout`).

## Frentes tocadas

- **2 cache** — a regra inteira, `cache.js` + `cache.t.js`.
- **3 scan** — `kinds.js` nasce (`register()` abre um tipo nas duas pontas); `scanner.js`
  encolhe de 89 linhas para menos (a lógica de sufixo migra para `kinds.js`).
- **1 core** — `leak.t.js` (sealed); `test.js` ganha `oncheck`/`sealed`.

## Requisitos verificáveis

- `cache.t.js` verde: a regra do conjunto, o que invalida, o grafo de deps.
- Quente e frio reportam o MESMO número.
- `kinds.t.js` verde: `register()` idempotente nas duas pontas.
- `leak.t.js` verde: o check tardio reabre o veredito; o timer é limpo.
