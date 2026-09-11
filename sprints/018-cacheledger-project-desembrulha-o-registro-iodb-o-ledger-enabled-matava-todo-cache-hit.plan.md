# 018 — Plano: cacheLedger project desembrulha o registro iodb - o ledger enabled matava todo cache-hit

Plano do sprint 018 (feature 2.7).

## Objetivo

`utest .` refazia a suíte inteira toda rodada — quente e frio rodavam os 202 🧪, zero
pulados. O portão da frente 2 ("quente e frio reportam o MESMO número com o ledger
arbitrando") deixou de valer: 2.7 estava 🔵 mas o critério não era mais atendido.

## Diagnóstico

`cacheLedger.js#project` (o redutor da projeção na abertura) lê `entry.event === 'run:start'`
supondo que `ledger.state()` devolve eventos **planos**. Mas o `iodb` reduz com o `append`
de `io-engine.js:490` — `(acc, rec) => (acc.push(rec), acc)` — que empurra cada registro
**embrulhado na chave-hash progressiva**: `{ "<hash>": { event: 'run:start', ... } }`.

`entry.event` é sempre `undefined` → `project` pula TODOS os registros (144 numa stream
real; `event kinds: {"undefined": 144}`) → `records`/`shas` ficam vazios → `fresh()` sempre
`false`. E como `ledger?.enabled === true`, o `arbitrate` do `cache.js` (linha 466) rebaixa
**todo HIT de tempo válido** a MISS — "o cache de tempo dizia HIT, ledger discorda". O
mtime-carving está intacto (`scanner.t.js` mtime `…044` / alvo `scanner.js` `…000` / 44
checks); o ledger é que o veta.

Desembrulhando os 144: `run:start: 55`, `run:tests: 27`, `run:end: 54`, `eval:human-ok: 6`
— exatamente os eventos que `project` precisa (o ramo `run:tests` já existe na linha 101; só
faltava enxergá-lo). Os 2 registros multi-chave (o par genesis `{'0':…,'1':…}` do
`io-engine.js:224`) desembrulham para algo sem `.event` e o guard da linha 96 já os ignora.

## Passos

1. **`cacheLedger.js`** — no laço da linha 112, desembrulhar o registro do iodb antes de
   `project`: `entry?.event ? entry : Object.values(entry ?? {})[0]`. Corrigir o comentário
   da linha 109 (afirma "o estado projetado É o array de registros" — o iodb embrulha).

2. **`cacheLedger.t.js`** — teste de regressão sobre uma stream iodb REAL (não um mock de
   array plano): abrir `openLedger`, gravar `run:start` + `run:tests` de um arquivo, abrir
   `openCacheLedger` sobre esse mesmo ledger e afirmar `fresh(phase, file, [], target)` ===
   `true` para conteúdo intacto; `touch` sem editar continua `true` (o ganho sobre o mtime);
   reescrever o arquivo com bytes diferentes → `false`.

## Critério de pronto

- `bun utest.js cacheLedger.t.js` — verde
- `bun utest.js .` DUAS vezes seguidas: a 2ª reporta os mesmos 577 ✔ e é ~instantânea
  (todos os arquivos pulados — `cached: true`), não um novo full run
- `.utest/results.json` continua existindo e atualizado (as duas persistências em paralelo)
- `sprint eval --sweep` — verde (nenhuma demonstração caiu)
