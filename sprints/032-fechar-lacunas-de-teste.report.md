---
sprint: 32
date: 2026-09-18
features: ["6.1", "1.4", "6.4", "7.3", "4.5", "3.5", "5.5", "4.3", "7.1", "4.4"]
thread: null
---
# 032 — fechar-lacunas-de-teste

Fechou as lacunas de teste das 10 features que seguiam 🟠 sem `verify_tests`: o board ficou SEM nenhum 🟠, com a suite em 871 checks e cobertura 65% -> 85%.

## Objetivo

Sprint transversal por pragmatismo: 10 features em 5 frentes estavam 🟠 com
`verify_tests: []` — nao por falta de codigo, mas por falta de evidencia. Abrir
um sprint por feature custaria 10 ciclos de `close` ao usuario para um trabalho
que e de uma natureza so: escrever o teste que faltava.

## O que entregou

Arquivos de teste novos:

| feature | arquivo | checks |
|---|---|---|
| 6.1 shims | `src/shims.t.js` | 69 |
| 1.4 console-capture | `src/console-capture.t.js` | 16 |
| 6.4 .tuit / kinds | `src/kinds.t.js`, `src/tuit.t.js` | 28 + 22 |
| 7.3 runner | `src/runner.t.js` | 29 |
| 4.5 --json | `src/json-output.t.js` | 28 |
| 4.3 drill-in | `src/drill-in.t.js` | 8 |
| 7.1 worker | `src/worker-spawn.t.js` | 11 |
| 4.4 progressBar | `src/progress.t.js` | 20 |

3.5 e 5.5 subiram com os testes que JA existiam (`scanner.t.js`, `trace.t.js`)
— faltava so registrar o `verify_tests`.

## Evidencia

- board: **10 🟠 -> 0 🟠** (24 🟡, 17 🔵, 2 ⚫)
- suite: 871 checks verdes, cobertura **65% -> 85%**
- `~/soml`: segue limpo (3367 UNIT + 264 EVAL)

## Fica aberto (reportado, nao corrigido)

1. **`src/worker.js` e um entrypoint sem `import.meta.main`.** O pareamento
   teste<->alvo importa o alvo; o worker roda dentro do runner e chama
   `process.exit(0)`, derrubando a rodada. Por isso o teste se chama
   `worker-spawn.t.js` e nao `worker.t.js`. Mesmo defeito que `src/migrate.js`
   tinha (corrigido no sprint anterior). E da feature 7.1.

2. **`--watch` (4.4) sem cobertura.** Exige watcher e timing reais; segue como
   verificacao manual. A parte pura de 4.4 (`progressBar`, `link`) esta coberta.

3. **A regra v1/v2/v3 por escopo (4.3) nao se manifesta como esperado.** Escopo
   de arquivo e escopo raiz produziram saida IDENTICA no fixture; o `log()` de um
   teste verde nao aparece nem com `-v:3` explicito. Os casos escritos aferem o
   que e observavel (selecao de escopo, cache, ausencia de ruido). Vale conferir
   se o requisito descreve o comportamento pretendido ou o atual.

4. **`shim()` substitui `import.meta.dir`/`url` dentro de STRINGS** — ja
   registrado no sprint 031, segue aberto.
