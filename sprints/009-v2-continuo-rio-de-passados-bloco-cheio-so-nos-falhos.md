---
sprint: "009"
slug: "v2-continuo-rio-de-passados-bloco-cheio-so-nos-falhos"
title: "v2 continuo: rio de passados, bloco cheio so nos falhos"
features: ["4.6"]
budget: null
state: "closed"
opened: "2026-09-04"
closed: "2026-09-04"
migrated: "0.2"
---

# 009 — v2 continuo: rio de passados, bloco cheio so nos falhos

Plano do sprint 009 (feature 4.6).

# PLAN

## Por que este sprint existe agora

`fullView(main, { verbosity: 2 })` mostrava uma barra de titulo (dotfill + tempo)
por ARQUIVO, verde ou vermelho. Numa fase com muitos arquivos, isso e ruido: o
formato de `-v:2` deve seguir a mesma logica de "so quem pede atencao ganha
espaco" que `compactFails` ja aplica em `-v:1`.

## Plano de materializacao

1. `utest/viewer.js` — extrair o soft-wrap de `compactFails` para
   `wrapTokenGroups(groups, width)`, reutilizavel.
2. `utest/viewer.js#fullView` (`verbosity === 2`) — separar `files` em
   `passed`/`failed`. Os `passed` viram UM rio continuo (`nome ✔N`, 2 espacos,
   sem dotfill, sem tempo individual) via `wrapTokenGroups`. Os `failed`
   continuam no formato cheio: `fileLine` (dotfill + tempo) + `failLines`
   (checkView completo: lineCode, received/expected quando nao-trivial,
   endereco/caller line).
3. `utest/viewer.t.js` — atualizar o teste que fixava o formato antigo (uma
   linha+tempo por arquivo verde) e adicionar cobertura para: rio com varios
   verdes, mistura passado+falho, e só-falho (sem rio).

## Criterio de pronto

- `bun utest.js utest/viewer.t.js` verde.
- `bun utest.js .` (no soml raiz) v2 num escopo real mostra o rio continuo e o
  bloco cheio nos vermelhos, dentro da largura do terminal.

# REPORT

`-v:2` (`fullView`, `viewer.js`) trocou uma linha (dotfill + tempo) por ARQUIVO
verde por um rio continuo — nome + contagem, dois espacos, soft-wrap — e
manteve o bloco cheio (dotfill, `received`/`expected`, caller line) so nos
arquivos falhos.

## O que aconteceu

- `wrapTokenGroups(groups, width)` extraido de `compactFails` — o mesmo
  soft-wrap agora serve tanto ao bloco de v1 (vermelhos + hogs) quanto ao rio
  de passados do v2.
- `fullView` (`verbosity === 2`) separa `files` em `passed`/`failed`: os
  passados viram UMA linha-rio (`nome ✔N`, sem dotfill nem tempo individual —
  o tempo agregado ja esta na linha-titulo da fase); os falhos continuam no
  formato antigo inteiro, `fileLine` + `failLines`.
- `viewer.t.js`: teste que fixava o formato antigo (tempo por arquivo verde)
  reescrito para o rio; dois testes novos cobrem a mistura passado+falho e o
  caso so-vermelho (sem rio).

## Prova

```
UNIT ........................................................ (0s) ✘1 📄3 🧪3 ✔2
  b.t.js ✔1  a.t.js ✔1
  c.t.js ✔0 ✘1 ----------------------------------------------------- (Nms)
      ✘ test('c', ...)................ c.t.js:001
        received: 4
        expected: 5
```

`bun utest.js utest/viewer.t.js` — 117 checks verdes. `sprint eval 4.6` rodou
o roteiro ao vivo (fixture de 3 arquivos) e confirmou (🔵) contra essa saida
exata.
