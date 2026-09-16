# 006 — `--trace` so funciona em arquivo que alguma fase inclui

**Sistema**: `utest` · **Achado em**: 2026-09-11 (apontado pelo usuario) · **Severidade**: media

## O sintoma

Apontar `--trace` para um `.eval.js` num projeto cujo `TEST.yaml` nao declara uma fase `eval`:

```
$ utest t.eval.js --trace
--trace: nenhum arquivo casou o escopo — nada a tracar
```

Com uma fase `eval: { include: ["**/*.eval.js"] }` no `TEST.yaml`, o MESMO comando traca
normalmente:

```
utest t.eval.js            12660ms  100%
  entry t.eval.js           8148ms   64%
  (bun + imports startup)   4282ms   34%
```

## A causa

O gate do `--trace` em si esta certo (`utest.js:354`):

```js
const doTrace = trace && (narrowScope || _isFile)
```

`_isFile` ja e verdadeiro para um caminho explicito. O problema e ANTES: o arquivo apontado
precisa passar pela selecao de entries, que pergunta a qual FASE ele pertence
(`makeFilter(inc, exc).included(rel)`, utest.js:495). Nao casando nenhuma fase, a lista de
entries sai vazia e o tracer nao tem o que instrumentar — a mensagem fala de "escopo", o que
manda o usuario procurar no lugar errado.

## O que se espera

`--trace` apontado explicitamente para UM arquivo `.js` deveria traca-lo, com ou sem config.
E ferramenta de drill-in de hog: quem investiga um arquivo lento nao deveria ter que declarar
uma fase antes. A regra "o kind decide" vale para a SUITE (o que roda num `utest .`), nao
para um alvo que o usuario nomeou na linha de comando.

## Correcao possivel

Quando `_isFile` e o arquivo nao casa fase nenhuma, montar um entry sintetico para ele em vez
de devolver lista vazia — o executor por kind ja existe (`executorFor`), e um `.js` sem kind
cai no caminho de modulo ESM comum. Alternativa minima: trocar a mensagem por uma que diga a
causa real ("nenhuma fase do TEST.yaml inclui este arquivo") e sugira o `include`.
