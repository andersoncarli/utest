# 001 — `fswatch#reconcile()` grava sem buffer: 20x mais lento que o necessario

**Sistema**: `iodb/fswatch` · **Achado em**: 2026-09-11, sprint 022 do `utest` (feature 8.3)
**Status**: RESOLVIDO em 2026-09-11, direto no `iodb` (autorizado pelo usuario: "utest e o primeiro cliente real")
**Severidade**: alta — e o maior componente isolado do custo de indexar uma arvore

## O sintoma

Consumir o baseline do `fswatch` em vez do `readdirSync` de `scanner.js` custava ~10.2s
neste repo (1485 entries), contra **6ms** do `readdirSync`. A suspeita do usuario — "as
chamadas de `in()` nao estao sendo buferizadas" — estava certa, e e metade da conta.

## A causa

`MetadataStore.put` aceita `{ flush }` e o default e `true` (fswatch.js:142):

```js
const put = (e, { flush = true } = {}) => {
  const row = normalize(e)
  mirror.set(e.id, row)
  return io.in({ [e.id]: row }, { flush })
}
```

O `Scanner` batch usa o default CERTO nos dois call sites (fswatch.js:231 e :240):

```js
found.set(e.id, e); store.put(e, { flush: false })
...
store.flush()
```

Mas `reconcile()` (fswatch.js:337-339) **nao passa a flag**, entao cada entry de uma arvore
inteira dispara um flush do store completo:

```js
const next = await snapshot([...new Set(targets)])
for (const e of next.values()) store.put(e)                               // <-- flush:true
for (const e of baseline.values()) if (!next.has(e.id)) store.remove(e.id) // <-- idem
```

Isso importa mais do que parece porque o `scan()` publico chama `snapshot()` logo depois do
`scanner.scan()`, e `watch()` chama `scan()` — ou seja, o caminho caro e o caminho normal.

## A medicao

300 arquivos num tmpdir, mesma maquina, mesmo processo:

| caminho | custo |
|---|---|
| `scanner.scan()` (ja buferizado) | 658ms |
| `reconcile()` como esta | **4901ms** |
| `reconcile()` com `{ flush: false }` + `store.flush()` | **241ms** |

**20.3x** mais rapido com a correcao.

## A correcao (uma linha e meia)

```js
const next = await snapshot([...new Set(targets)])
for (const e of next.values()) store.put(e, { flush: false })
for (const e of baseline.values()) if (!next.has(e.id)) store.remove(e.id, { flush: false })
store.flush()
```

Aplicada localmente e revertida (o repo do `iodb` nao foi tocado): **os 14 checks de
`fswatch.t.js` seguem verdes**, incluindo o teste de rename que depende da identidade por
`(dev, ino)` e o de reabertura do store.

## O que a correcao NAO resolve

O total end-to-end cai de ~10.2s para ~8.7s, nao para perto dos 6ms do `readdirSync`. O
resto e [ISSUES/002](002-iodb-flush-o-store.md) (o `flush()` do iodb e O(store)) e
[ISSUES/003](003-fswatch-scan-varre-duas-vezes.md) (o `scan()` varre duas vezes).

## Resolucao

Aplicada em `iodb/fswatch/fswatch.js`, exatamente como proposto acima. A suite inteira do
`iodb` segue verde (2703 checks), e o proprio `fswatch.t.js` caiu de ~1400ms para ~380ms.
