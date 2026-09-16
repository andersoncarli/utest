# 003 — `fswatch#scan()` varre a arvore duas vezes

**Sistema**: `iodb/fswatch` · **Achado em**: 2026-09-11, sprint 022 do `utest`
**Status**: RESOLVIDO em 2026-09-11, direto no `iodb` (autorizado pelo usuario: "utest e o primeiro cliente real")
**Severidade**: media

## O achado

O `scan()` publico (fswatch.js:386-391) faz duas travessias completas do disco:

```js
const scan = async () => {
  const targets = [...new Set(Object.values(clusters).flatMap(c => c.targets))]
  await scanner.scan(targets)      // travessia 1 — grava buferizado, SEM `path`
  baseline = await snapshot(targets) // travessia 2 — reconstroi tudo, COM `path`
  return baseline
}
```

`scanner.scan()` ja visitou cada arquivo e ja chamou `describe()` em cada um. `snapshot()`
refaz o mesmo `readdir` recursivo e o mesmo `describe()`, e o unico produto novo e o campo
`path` (`e.path = full`, fswatch.js:325) — que o `Scanner` batch simplesmente nao preenche
(ver [ISSUES/004](004-fswatch-path-ausente.md)).

Como `reconcile()` grava tudo de novo a partir do `snapshot()`, e ate a correcao de
[001](001-fswatch-reconcile-sem-buffer.md) grava sem buffer, o segundo passe e tambem o caro.

## Correcao possivel

Fazer o `Scanner` preencher `path` durante a unica travessia que ja faz, e `scan()` derivar
o baseline do que ele devolveu, em vez de chamar `snapshot()`. Resolve 003 e 004 juntos e
elimina uma travessia inteira.

## Resolucao

Aplicada a correcao proposta: `describe()` passou a preencher `path` (ver
[004](004-fswatch-path-ausente.md)), entao o `scan()` publico usa o mapa que o `Scanner` ja
devolve como baseline, e a chamada a `snapshot()` sumiu:

```js
const scan = async () => {
  const targets = [...new Set(Object.values(clusters).flatMap(c => c.targets))]
  baseline = await scanner.scan(targets)
  return baseline
}
```

Uma travessia recursiva inteira a menos, mais um `describe()` (um `lstat`) por arquivo.
Os 14 checks de `fswatch.t.js` seguem verdes.
