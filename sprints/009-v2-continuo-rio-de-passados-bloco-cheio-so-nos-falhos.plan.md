# 009 — Plano: v2 continuo: rio de passados, bloco cheio so nos falhos

Plano do sprint 009 (feature 4.6).

## Objetivo

`fullView(main, { verbosity: 2 })` mostrava uma barra de titulo (dotfill + tempo)
por ARQUIVO, verde ou vermelho. Numa fase com muitos arquivos, isso e ruido: o
formato de `-v:2` deve seguir a mesma logica de "so quem pede atencao ganha
espaco" que `compactFails` ja aplica em `-v:1`.

## Passos

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
