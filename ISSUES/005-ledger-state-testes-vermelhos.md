# 005 — `ledger.t.js` e `state.t.js` vermelhos: `.dash` nao nasce

**Sistema**: `utest` (via `iodb`) · **Achado em**: 2026-09-11 · **Severidade**: media

## O sintoma

`utest .` fecha com `✘7 💥2`, sempre nos mesmos dois arquivos:

```
ledger.t.js 💥1 ✘2   state.t.js 💥1 ✘5
  💥 ENOENT: no such file or directory, open '/tmp/utest-ledger-XXXX/.utest/ledger.dash'
  ✘ check(typeof ledger.runId, 'string')   received: object   expected: string
  ✘ check(existsSync(dashPath), true)
```

`runId` vindo `object` e o sinal de que `openLedger` caiu no `noop()` — ou seja, o
`import('../iodb/io-engine.js')` falhou, ou o `IO(...)` estourou, e o degrado silencioso
(by design: "um runner de testes nao pode ficar refem do seu proprio log") escondeu a causa.

## Anterior ao sprint 022

Confirmado com `git stash -u`: as MESMAS 7 falhas e 2 excecoes aparecem com a arvore limpa,
antes de qualquer mudanca da feature 8.3. Nao e regressao do sprint.

## Proximo passo

Instrumentar o `catch` de `openLedger`/`openState` para registrar a causa quando o degrado
acontece (sem quebrar o contrato de nao-refem), e so entao decidir se e defeito do `iodb`
ou do caminho de fixture dos testes.
