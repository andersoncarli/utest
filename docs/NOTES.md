# NOTES — retoques antes do deploy

Os quatro itens desta lista fecharam no **sprint 008**
(`sprints/008-verbosidade-por-arquivo-e-a-regua-em-colunas.{plan,report}.md`), que é onde
mora a narrativa: o que cada um era de verdade, o que a investigação revelou por baixo, e
a regressão que eu mesmo introduzi no caminho.

1. ~~`-v:2`/`-v:3` devolviam o mesmo que `-v:1`~~ — o `-v:2` virou a visão por ARQUIVO. [4.1]
2. ~~verificar `utest2.js`~~ — deletado. [—]
3. ~~a cobertura não bate com `sprint fronts`~~ — são duas contas diferentes por desenho, e
   a do utest estava errada por dois motivos. Hoje: 50%, e `--uncovered` lista os 9. [3.5]
4. ~~`--trace` verboso e sem filtro~~ — escopo largo agrega por frente/feature. [5.5]

## Abertos

- **`trace.t.js` é flaky sob carga**: `check(outer.selfMs < 22, …)` mede um sleep de ~12ms
  e estoura quando a suíte inteira roda junto (verde nas 3 execuções isoladas). O limiar é
  wall-clock num teste que divide CPU com o resto — merece um sprint próprio, não um
  ajuste de número.
- **No soml, 3 `.eval.js` divergem entre rodada forçada e cacheada** (45 vs 48 vermelhos).
  Mesma categoria do item acima: falham sob carga, passam limpos.
- **`shimmer.js`**: 0 refs, candidato a DELETE (o irmão do `utest2.js` que sobrou).
- Os 9 arquivos sem `.t.js` que o `utest . -u` agora lista — a dívida central do repo,
  rastreada em [3.5].
