---
sprint: "018"
slug: "cacheledger-project-desembrulha-o-registro-iodb-o-ledger-enabled-matava-todo-cache-hit"
title: "cacheLedger project desembrulha o registro iodb - o ledger enabled matava todo cache-hit"
features: ["2.7"]
budget: null
state: "closed"
opened: "2026-09-09"
closed: "2026-09-09"
migrated: "0.2"
---

# 018 — cacheLedger project desembrulha o registro iodb - o ledger enabled matava todo cache-hit

Plano do sprint 018 (feature 2.7).

# PLAN

## Por que este sprint existe agora

`utest .` refazia a suíte inteira toda rodada — quente e frio rodavam os 202 🧪, zero
pulados. O portão da frente 2 ("quente e frio reportam o MESMO número com o ledger
arbitrando") deixou de valer: 2.7 estava 🔵 mas o critério não era mais atendido.

### Diagnóstico

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

## Plano de materializacao

1. **`cacheLedger.js`** — no laço da linha 112, desembrulhar o registro do iodb antes de
   `project`: `entry?.event ? entry : Object.values(entry ?? {})[0]`. Corrigir o comentário
   da linha 109 (afirma "o estado projetado É o array de registros" — o iodb embrulha).

2. **`cacheLedger.t.js`** — teste de regressão sobre uma stream iodb REAL (não um mock de
   array plano): abrir `openLedger`, gravar `run:start` + `run:tests` de um arquivo, abrir
   `openCacheLedger` sobre esse mesmo ledger e afirmar `fresh(phase, file, [], target)` ===
   `true` para conteúdo intacto; `touch` sem editar continua `true` (o ganho sobre o mtime);
   reescrever o arquivo com bytes diferentes → `false`.

## Criterio de pronto

- `bun utest.js cacheLedger.t.js` — verde
- `bun utest.js .` DUAS vezes seguidas: a 2ª reporta os mesmos 577 ✔ e é ~instantânea
  (todos os arquivos pulados — `cached: true`), não um novo full run
- `.utest/results.json` continua existindo e atualizado (as duas persistências em paralelo)
- `sprint eval --sweep` — verde (nenhuma demonstração caiu)

# REPORT

`cacheLedger.js#project` lia `entry.event` supondo eventos planos, mas o `iodb` os embrulha na
chave-hash (`{ "<hash>": { event, ... } }`) — a projeção ficava vazia, `fresh()` nunca
confirmava e, com `enabled` ligado, o `arbitrate` rebaixava todo cache-hit. `utest .` refazia
a suíte inteira toda rodada. Sprint 018 desembrulha o registro na leitura e fixa a regressão
com um teste sobre a forma real do iodb.

## O que aconteceu

**Objetivo**

O portão da frente 2 — "quente e frio reportam o MESMO número de checks com o ledger
arbitrando" — deixou de valer. `utest .` rodava os 202 🧪 a cada invocação, cache-hit zero,
mesmo sem nada ter mudado. 2.7 estava 🔵 confirmada mas o critério não era mais atendido:
`sprint reopen 2.7` (→ 🟡) e este sprint para consertar.

**O que foi entregue**

**`cacheLedger.js` — desembrulha o registro na leitura** (feature 2.7)
O laço da projeção passou a normalizar cada registro antes de `project`:
```js
const unwrap = e => (e && e.event) ? e : Object.values(e ?? {})[0]
for (const entry of history || []) project(unwrap(entry))
```
O par genesis multi-chave (`{'0':…,'1':…}` de `io-engine.js:224`) desembrulha para algo sem
`.event` e o guard da linha 96 de `project` já o ignora. O comentário da linha 109 (que
afirmava "o estado projetado É o array de registros") foi reescrito para descrever o embrulho.

**`cacheLedger.t.js` — teste de regressão sobre a forma real do iodb**
Novo caso "REGRESSÃO (sprint 018)": `state()` devolvendo `{ "#<i>": ev }` embrulhado, incluindo
o par genesis multi-chave e um `run:tests` agregado (não `test:result` solto). Afirma
`get().checks` do lote desembrulhado e `fresh() === true` para conteúdo intacto — o cache-hit
que o bug matava. Sem o fix: 2 ✘ (`get()` undefined, `fresh()` false). Com: verde.

### Diagnóstico

O usuário reportou: "`utest .` tá ignorando o cache (todos eles) e fazendo full". Reproduzido
— duas rodadas seguidas de `bun utest.js .`, a 2ª igual ou mais lenta que a 1ª (3.8s → 6.3s),
202 🧪 rodados nas duas.

`entry.cache` chegava `null` em TODA entry de `scan()` quando havia um `cacheLedger` — mas
`TestCache(root, { ledger: null }).read('scanner.t.js', 'scanner.js')` devolvia
`{ checks: 44 }` normalmente. O mtime-carving estava intacto (`scanner.t.js` mtime `…869044` /
alvo `scanner.js` `…869000` / 44 = a contagem). Era o ledger vetando.

`cacheLedger.js#project` (o redutor da projeção na abertura, linha 95) faz
`if (entry.event === 'run:start')`. Mas `openLedger().state()` — que reduz com o `append` de
`../iodb/io-engine.js:490`, `(acc, rec) => (acc.push(rec), acc)` — devolve cada registro
EMBRULHADO na chave-hash progressiva: `{ "6S": { event: 'run:end', ... } }`. Numa stream real
de 144 registros: `event kinds: { "undefined": 144 }`. `project` pulava todos → `records` e
`shas` vazios → `fresh()` sempre `false` (linha 159, `records.has(...)` falso) → e como
`ledger?.enabled === true`, o `judge` do `arbitrate` (`cache.js:455`) é o ledger, que na
linha 466 rebaixa "cache de tempo dizia HIT, ledger discorda → re-rodando" para CADA arquivo.

O cache inteiro morria sempre que o ledger abria — o que é sempre, com `../iodb` presente.

Por que os testes não pegaram: `cacheLedger.t.js` monta a stream com `fakeLedger([...])` de
eventos PLANOS (`{ event: 'run:start', ... }`) — exatamente a forma que o bug assumia. Nenhum
teste exercia a forma embrulhada do iodb, nem o evento `run:tests` (o lote agregado que
`ledger.js#end` de fato grava; os testes usavam `test:result` solto).

## Prova

- `bun utest.js cacheLedger.t.js --force` — verde, 25 checks (era 22)
- `git stash` do fix + rodar `cacheLedger.t.js` → 2 ✘ no caso REGRESSÃO; `stash pop` → verde
- `bun utest.js . --force` — full, 📄12 🧪203 ✔580, exit 0
- `bun utest.js .` 2× seguidas depois — **📄12 🧪203 ✔580 nas duas**, ~1.5s (era ~6s e
  re-rodava tudo). Quente e frio reportam o mesmo número — o portão da frente 2.
- `.utest/results.json` continua existindo e atualizado após cada rodada (as duas
  persistências em paralelo)
- `sprint eval --sweep` — 12/8 `.eval.js` varridos, nenhuma demonstração caiu
- `sprint docs` — ok

## O que fica aberto

- A convergência `results.json` → só-ledger continua adiada (sprint futuro, como o `_front.md`
  da frente 2 já registra).
- `../iodb` expõe `append` como redutor que NÃO desembrulha, enquanto o `_reduce` default de
  `io-engine.js:111` desembrulha (`Object.values(rec)[0]`). Quem usa `reduce: append` herda a
  forma embrulhada — vale um alinhamento no iodb, mas é repo irmão, fora do escopo do utest.
