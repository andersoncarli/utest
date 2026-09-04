---
sprint: 9
date: 2026-09-04
features: [4.6]
thread: null
---
# 009 — v2 continuo: rio de passados, bloco cheio so nos falhos

`-v:2` (`fullView`, `viewer.js`) trocou uma linha (dotfill + tempo) por ARQUIVO
verde por um rio continuo — nome + contagem, dois espacos, soft-wrap — e
manteve o bloco cheio (dotfill, `received`/`expected`, caller line) so nos
arquivos falhos.

## O que mudou

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

## Estado medido no fecho

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
