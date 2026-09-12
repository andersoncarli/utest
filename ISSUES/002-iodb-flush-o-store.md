# 002 — `iodb` `flush()`/`close()` sao O(store), nao O(dirty)

**Sistema**: `iodb` (engine) · **Achado em**: 2026-09-11, sprint 022 do `utest`
**Severidade**: alta — e o teto que sobra depois de [001](001-fswatch-reconcile-sem-buffer.md)

## O sintoma

Com a escrita ja buferizada, escrever 300 entries no store custa 4ms; **persistir** custa
1150ms. O custo nao esta em `in()`, esta em `flush()`/`close()`.

## A medicao

Direto no engine, sem o `fswatch` no meio (`IO(base, { reduce: merge, pageSize: 4096 })`):

```
in() x300 com flush:false : 4ms
flush()                   : 358ms
close()                   : 789ms
```

Escalando, para ver se e proporcional ao que MUDOU ou ao que EXISTE:

| N | flush | close | por entry |
|---|---|---|---|
| 300 | 399ms | 1151ms | 5.17ms |
| 600 | 882ms | 1574ms | 4.09ms |
| 1200 | 882ms | 2652ms | 2.94ms |

O custo por entry CAI conforme N cresce — a assinatura de um custo fixo por operacao de
persistencia diluido, nao de um custo proporcional ao delta. `close()` domina e cresce com o
tamanho do store.

## Por que importa

O proprio README do `iodb` lista isto em "What's Not Here Yet": escritas pagina-a-pagina sao
O(store) por flush, nao O(dirty pages), e um `open()` flat ainda replica o `.dash` inteiro
para reconstruir os bitmaps do alocador (feature 2.4, o indice key->offset).

A consequencia pratica, medida do lado consumidor: **um baseline que ja existe nao barateia a
proxima execucao — encarece.** No `utest`, a segunda rodada foi a mais lenta, porque o
`open()` passou a custar 1.8s replicando o log:

| | open | scan | close | total |
|---|---|---|---|---|
| baseline frio | 189ms | 5862ms | 3998ms | ~10.0s |
| baseline existente | **1791ms** | 4936ms | 3520ms | ~10.2s |

Enquanto isso valer, o `fswatch` nao pode ser a fonte de arvore padrao de um runner: indexar
custa ~7ms por entry contra 0.032ms de um `readdirSync`, e a promessa de "reaproveitar a
varredura entre `utest` e `sprint-cli`" nao se paga, porque a varredura nunca foi o custo.

## Onde exatamente esta o custo (medido 2026-09-11)

Isolado com instrumentacao `bench` do proprio engine, 600 entries:

```
precompute (reduce sobre a projecao inteira) : 573ms
recompute  (idem, dentro do lock)            : 414ms
append (a escrita real no .dash)             :   1ms
```

E `flushPages()` em `src/paged-projection.js:209` e o motivo: ele re-renderiza a projecao
INTEIRA a cada flush — `allKeyed()`, `sort()` sobre todas as chaves, `encodeKeyed` por chave.
Medido em isolado: com 400 entries no store, acrescentar UM custa **86ms**.

A ESCRITA ja e diffada (`replacePagesDiffed` compara pagina a pagina e so escreve as que
mudaram, o que a feature 2.0 comprou). O que nao e incremental e o RE-RENDER que produz as
paginas candidatas — e o comentario do proprio codigo assume isso como inevitavel:

> The re-render of the LINES walks the whole logical content, and it has to: a keyed
> projection is sorted, so inserting one key can shift every later one across page
> boundaries. That part is O(store) by nature.

O argumento e legitimo (uma insercao no meio desloca as fronteiras de pagina), mas nao e
inevitavel: so as paginas A PARTIR da primeira afetada precisam ser re-renderizadas, nao as
anteriores. Mudar isso mexe no nucleo compartilhado por varias features ja 🔵 e **precisa de
sprint proprio na frente do engine** — por isso foi reportado, nao corrigido junto das tres
correcoes do `fswatch`.

## Nao e critica ao desenho

A identidade por `(dev, ino)` e a escolha certa, e a garantia criptografica encadeada e
exatamente o que um runner quer poder afirmar sobre a arvore que testou. O que falta e a
escrita incremental. Com ela, a costura ja existe do lado do `utest` (`fswatchSource.js`,
feature 8.3) e vira o padrao trocando um default.
