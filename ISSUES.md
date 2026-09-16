# ISSUES — kanban rapido de QA

<!-- system file -->

Registro quick-and-dirty de problemas a resolver depois no proprio `utest`. Defeito de
ferramenta vizinha (`sprint`/sprint-cli, `iodb`/`fswatch`) mora no `ISSUES.md` dela, nao
aqui — mesmo quando achado durante uma sessao do `utest`. Uma linha por item. O detalhe
forense, quando existe, mora em [`ISSUES/`](ISSUES/).

Colunas: **TODO** (visto, nao comecado) · **DOING** (em conserto) · **BLOCKED** (esperando
decisao ou outra coisa) · **DONE** (resolvido — movido para
[`ISSUES/DONE/_DONE.md`](ISSUES/DONE/_DONE.md) no proximo pente).

Formato de linha: `- [sistema] frase curta — <ponteiro opcional>`

---

## TODO

- [sprint-cli] `.eval.js` com `t.real` + caminho absoluto fora do sandbox (ex.:
  `/tmp/nome-fixture`) resolve errado: o `sh()` desse harness roda com um cwd que nao
  reconhece o path absoluto, cai em "parece caminho mas nao existe — tratado como filtro de
  nome" e escaneia o projeto inteiro no lugar do fixture — pior ainda, se o path relativo
  colidir com uma pasta do proprio projeto (`tmp/…` dentro do repo do `utest`), os arquivos
  do fixture sao escritos DENTRO do repo de verdade, poluindo a suite. Achado em sprint 025
  ao rodar `sprint eval 4.6 --yes` (nao mexido neste sprint): falha com o mesmo sintoma sem
  nenhuma mudanca de codigo relacionada — pre-existente, nao regressao. Padrao correto:
  `t.sandbox` (fixture isolada, `write()`/`sh()` relativos ao proprio sandbox) — ja usado em
  `plans/7-isolation/7.2.eval.js` e `plans/4-report/4.1.eval.js`. Pendente: reescrever
  `plans/4-report/4.6.eval.js` para `t.sandbox`.

## DOING

_(vazio)_

## BLOCKED

_(vazio)_

## DONE

Movido para [`ISSUES/DONE/_DONE.md`](ISSUES/DONE/_DONE.md) — mantido fora deste arquivo
pra este ficar so o kanban ativo (TODO/DOING/BLOCKED).
