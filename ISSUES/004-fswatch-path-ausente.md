# 004 — entries do `Scanner` batch nao tem `path`, contra o contrato

**Sistema**: `iodb/fswatch` · **Achado em**: 2026-09-11, sprint 022 do `utest`
**Status**: RESOLVIDO em 2026-09-11, direto no `iodb` (autorizado pelo usuario: "utest e o primeiro cliente real")
**Severidade**: media — quebra o idiom de leitura que o proprio contrato publica

## O contrato diz

`fswatch/docs/utest-sprint-prep.md` documenta `path` como opcional ("so presente quando
produzido por `scan()`/`reconcile()`") e publica este idiom para o consumidor:

```js
const files = fs.entries()
  .filter(e => e.kind === 'file')
  .map(e => path.relative(root, e.path))
```

## O que acontece de fato

Medido: **zero de zero entries** trazem `path` pelo caminho que o `scan()` usa. O idiom acima
devolve `undefined` para todos os arquivos — silenciosamente, sem erro.

```
entries: 3 | com path: 0
```

`describe()` (fswatch.js:204-213) nao poe `path`; so `snapshot()` o adiciona depois
(fswatch.js:325), e o que fica no STORE e o que o `Scanner` gravou.

## Contorno adotado no `utest`

`fswatchSource.js` reconstroi o caminho subindo a cadeia de `parent`, que sempre existe e e
bem formada. A raiz do target tem `parent: null` e da o prefixo a descartar. Funciona, mas e
trabalho que o consumidor nao deveria ter — e qualquer outro consumidor que siga o doc
literalmente vai receber `undefined` sem perceber.

## Correcao

Preencher `path` no `Scanner` batch (que ja tem o `full` em maos ao chamar `describe`), ou
corrigir o doc para publicar a reconstrucao por `parent` como o idiom oficial. A primeira e
melhor e resolve junto a [ISSUES/003](003-fswatch-scan-varre-duas-vezes.md).

## Resolucao

`describe()` passou a preencher `path: path.resolve(filename)` — no unico lugar por onde TODO
produtor de entry passa, entao o Scanner batch, o `snapshot()` e o watcher carregam o campo
igualmente. Medido depois: 412 de 412 entries com `path`.

O contorno por cadeia de `parent` em `utest/fswatchSource.js` continua valendo (e o fallback
para um baseline gravado por uma versao antiga do fswatch), mas deixou de ser necessario.

Custo: o `.dash` cresce ~12% (63KB -> 71KB em 300 arquivos), o que paga por entries que o
consumidor consegue de fato ler.
