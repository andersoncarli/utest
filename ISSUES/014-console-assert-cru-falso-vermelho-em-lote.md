# utest — teste em formato cru (`console.assert`/`console.log`) reporta falso-vermelho
quando rodado dentro de `utest .`, mas passa isolado

Encontrado em `iodb` na sessao de 2026-09-15/16 (sprint 036, feature 6.5 —
`fswatch/typed/test/typed.t.js` e `typedtree.t.js`), consolidando `fswatch/tree0` +
`fswatch/typed`. Mesma familia do sintoma 3 do
[ISSUES/012](DONE/012-watch-nao-pega-tudo-force-deveria-ser-desnecessario.md) (isolado x
agregado divergindo para o mesmo arquivo, sem mudanca de codigo, **ja resolvido no sprint
024**) — mas aqui a causa e diferente e segue aberta.

---

## Sintoma

`fswatch/typed/test/typed.t.js` e `typedtree.t.js` nao usavam a API `test()`/`check()`
do resto do projeto — eram scripts crus:

```js
import { Typed, builtins } from '../typed.js'
const t = Typed(); builtins(t)
// ...
console.assert(x.kind == 'delta' && ...)
console.log('typed ok')
```

Isolados, sempre passavam (`utest typed.t.js` → `✔1`, exit 0), inclusive apos
`rm -rf .utest` (cache zerado). Mas dentro de `utest .` (a suite inteira, ~31 arquivos),
os dois apareciam listados como falha:

```
UNIT (5s) ✘2 📄31 🧪207 ✔2705
  typed.t.js  typedtree.t.js
```

sem detalhe de erro (`tip: run utest typed.t.js` — que por sua vez passava, sem
reproduzir nada). O ledger local (`fswatch/typed/test/.utest/ledger.dash`) so continha
`status: passed` em todas as 93 entradas historicas — nenhum `failed` registrado ali,
mesmo com o `run:end` agregado da raiz (`.utest/ledger.dash`) marcando
`"failed":2,"state":"failed"` para a mesma rodada. Ou seja: o agregado contava esses 2
arquivos como falha sem que o proprio sub-ledger deles jamais tivesse gravado uma falha.

Rodar `utest typed.t.js typedtree.t.js` (dois arquivos, uma chamada) tambem so executou
UM dos dois (`typed ok`, sem rastro do segundo na saida) — sugerindo colisao/matching
entre os dois nomes (`typed.t.js` e `typedtree.t.js` compartilham prefixo).

## Causa (identificada, nao so suspeita)

O padrao cru — sem `test('nome', ({check}) => ...)` — nao da ao runner nenhum jeito
estruturado de contar `tests`/`checks` por arquivo; o runner aparentemente infere
sucesso/falha desses dois arquivos por outro caminho (heuristica de exit code +
contagem por nome de arquivo?) que quebra quando rodados junto com o resto da suite
real (`test()`-based). Nenhum outro `.t.js` do projeto usa o padrao cru — todos os
demais (`src/hash.t.js`, `fswatch/fswatch.t.js`, etc.) usam `test()`/`check()`.

**Correcao aplicada no lado do consumidor** (nao no utest): converti os dois arquivos
para `test()`/`check()` (mesmo padrao do resto do projeto). Apos a conversao, `utest .`
ficou verde e estavel em multiplas rodadas (`2709 ✔`, zero falhas, 3 rodadas seguidas).
Isso resolve o sintoma no `iodb`, mas nao explica/conserta a causa no `utest`: um
arquivo de teste malformado (sem usar a API) nao deveria conseguir contaminar a
contagem agregada de OUTROS arquivos, nem produzir um veredito de falha que o proprio
sub-ledger do arquivo nunca registrou.

## Impacto

Um veredito vermelho sem nenhum `test:result` de falha no ledger correspondente e um
oraculo que mente sobre a propria evidencia que ele mesmo gravou — pior que o sintoma 3
de 012 (que ao menos falhava de forma consistente, so discordando entre chamadas). Um
`sprint test`/`sprint eval --yes` rodado sobre um arquivo cru desse tipo teria
rebaixado uma feature legitima por um problema de formato de teste, nao de codigo.

## Pedido

1. `utest .` nao deveria reportar `status:failed` para um arquivo cujo proprio
   sub-ledger local so tem `passed` — a fonte da verdade do agregado deveria ser o
   mesmo dado que o isolado le, nao uma segunda contagem paralela que diverge dele.
2. Considerar validar/alertar quando um `.t.js` nao chama `test()` nenhuma vez — hoje
   ele e silenciosamente aceito e conta como "1 teste" via output cru, o que e o gatilho
   deste bug.
3. Investigar a colisao de nome entre `typed.t.js` e `typedtree.t.js` quando passados
   juntos na mesma chamada (um dos dois nao rodou) — pode ser o mesmo mecanismo.
