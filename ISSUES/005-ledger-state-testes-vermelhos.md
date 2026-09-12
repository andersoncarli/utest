# 005 — `ledger.t.js` e `state.t.js` vermelhos: `.dash` nao nasce

**Sistema**: `utest` (via `iodb`) · **Achado em**: 2026-09-11 · **Severidade**: media
**Status**: RESOLVIDO no sprint 021 (feature 8.1), 2026-09-12.

## A causa — um caminho de import errado

`ledger.js:33` e `state.js:31` pediam `'../iodb/io-engine.js'`; o modulo mora em
`'../iodb/src/io-engine.js'`. O `try/catch` do degrade engoliu o `ERR_MODULE_NOT_FOUND` em
silencio, e o `noop()` resultante devolvia `runId: null` / `configChanged: false` — dai o
`received: object` e os `ENOENT`. **Os testes sempre estiveram certos; a fonte e que estava
errada.** O caminho nasceu errado no commit original da 8.1 (`b9b0b66`), nao no sprint 022.

Alem do caminho, o sprint 021 fechou as duas portas que deixaram isso invisivel:

- o `catch` agora imprime o `err.message` sob `UTEST_DEBUG` — segue degradando, nao segue
  mudo;
- `noop().verify()` devolve `{ valid: true, length: 0 }` hardcoded, entao
  `check(v.valid, true)` passava sem cadeia nenhuma. Os testes de cadeia real afirmam
  `v.length > 0` e o do no-op afirma `length === 0`: os estados ficaram distinguiveis.

Resultado: `utest .` verde, 630 checks, `.utest/ledger.dash` nasce.

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
