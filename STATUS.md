# Status: utest/

Atualizado: 2026-06-19

`utest/` permanece como base de especificacao e compatibilidade para o sistema
de testes, mas nao deve ser tratado como arquitetura final isolada. O destino
operacional agora e `cmds/testio/testio.js`, reproduzindo as ideias de `utest`
sobre `lib/adapters/io-engine.js`.

---

## Estado: REFERENCIA LEGADA / MANUTENCAO

O runner atual em `utest/utest.js` e funcional para varias suites, mas o estado
documentado e o estado implementado divergiram:

- a documentacao antiga prometia workers por arquivo e isolamento total;
- o caminho atual de `utest/utest.js` e in-process;
- `TEST-PROBLEMS-I-FOUND.md` registra correcoes recentes e limites ainda
  abertos, especialmente source maps, TUI/non-TTY, cache parcial e cache de
  modulo ESM;
- `cmds/testio/testio.js` e o runner operacional concluido para a frente T1.

---

## Decisoes Ativas

- Separar fases: `unit`, `tui` e `integration`.
- `integration` testa sistemas em tempo de execucao, nao apenas arquivos com
  maior custo.
- Executar testes com workers por arquivo, em paralelo, para isolamento real de
  modulo, global state, timers e crashes nativos.
- Manter cache baseado em tempo, mas a comparacao deve bater por segundo, nao
  por minuto.
- Falha ao importar modulo alvo, shim ou arquivo de teste jamais deve ser
  engolida em test time; deve virar erro diagnostico do suite.
- `cmds/testio/testio.js` deve usar a arquitetura de IO como trilha principal,
  com registro persistente/reprodutivel via `lib/adapters/io-engine.js`.

---

## Encerramento T1

A reconciliacao operacional entre `utest` e `testio` foi encerrada em
2026-06-19. O `utest` permanece como referencia de contrato, scanner/cache e
compatibilidade historica; novas evolucoes devem entrar por `cmds/testio/`.

Backlog nao bloqueante:

1. classificar a fase `integration` com `testio integration --force --workers=4`;
2. extrair o transform de `bun:test` para `cmds/testio/plugins/bun-test.js`;
3. completar tipos de evento (`transform:error`, `module:export-mismatch`);
4. versionar formalmente o schema JSON do report;
5. adicionar `--no-color`.

Evidência concreta (2026-08-21): rodando `utest.js` sobre `~/bot` inteiro (96
arquivos) em modo in-process, o arquivo que aparece como 💥 muda entre
execuções (`io-nutshell.t.js` → `config.t.js`, mensagens sem relação com o
código do próprio arquivo: "Syntax Error", "test.todo is not a function"), e a
contagem total de testes varia (433 vs 124) — sinal de que uma exceção
assíncrona tardia (provável: `process.exit()` de um subprocesso spawnado por
`shell.t.js`/`ide.t.js`/`status.t.js` sob carga, capturado pelo trap em
`installProcessExitTrap()`) é atribuída ao arquivo errado porque chega depois
que o runner já avançou para o próximo. Confirma a necessidade do isolamento
por worker já listado acima; rodando cada suite isoladamente (`utest.js
nutshell`, etc.) o resultado é estável.

Baseline atual: `testio .` cache-hot renderiza o mesmo total principal do
`utest` (`1125` no cache atual). O scanner do `testio` foi comparado contra
`utest/scanner.js` e retorna os mesmos 82 arquivos da suite `unit`. Para
detalhe completo, `testio -v3` e tratado como live/force: ignora o cache e
renderiza logs e testes intermediarios capturados pelo worker.

---

## Ver Tambem

- `utest/TEST-SPEC.md` - contrato alvo.
- `utest/TEST-PROBLEMS-I-FOUND.md` - achados recentes da migracao.
- `cmds/testio/testio.js` - runner que deve absorver a arquitetura.
- `lib/adapters/io-engine.js` - primitiva IO para log/cache/resultados.

## Board

<!-- board:begin -->
### [1] core — Núcleo — coletor, asserção, veredito · implementando · sprint 7  [🟡🟡🟡🟠]
- 🟡 **[1.1] test() — coletor de árvore + isolamento por arquivo (begin/end)** → [1.1](plans/1-core/1.1-test-coletor-de-rvore-isolamento-por-arquivo-begin-end-.md)
- 🟡 **[1.2] check() — asserções por repr, checkFail / checkException** → [1.2](plans/1-core/1.2-check-asser-es-por-repr-checkfail-checkexception.md)
- 🟡 **[1.3] sealed — check tardio reabre o veredito de quem o soltou** → [1.3](plans/1-core/1.3-sealed-check-tardio-reabre-o-veredito-de-quem-o-soltou.md)
- 🟠 **[1.4] console-capture — console.* não vaza de teste verde** → [1.4](plans/1-core/1.4-console-capture-console-n-o-vaza-de-teste-verde.md)

### [2] cache — Cache — a regra sem furo · implementando · sprint 7  [🟡🟡🟡🟡🟡]
- 🟡 **[2.1] regra do mtime — segundo cravado + ms = contagem de checks; conjunto pareado** → [2.1](plans/2-cache/2.1-regra-do-mtime-segundo-cravado-ms-contagem-de-checks-conjunto-pareado.md)
- 🟡 **[2.2] grafo de deps — IMPORT_RE (inclui efeito colateral), extraRoots, ciclo, atime** → [2.2](plans/2-cache/2.2-grafo-de-deps-import-re-inclui-efeito-colateral-extraroots-ciclo-atime.md)
- 🟡 **[2.3] cacheFailure — vermelho reproduzível de eval não re-roda (sidecar)** → [2.3](plans/2-cache/2.3-cachefailure-vermelho-reproduz-vel-de-eval-n-o-re-roda-sidecar-.md)
- 🟡 **[2.4] results.json — histórico por fase; índice (utest 3.2 sem scan) + cross-check fresh()** → [2.4](plans/2-cache/2.4-results-json-hist-rico-hier-rquico-por-fase-ndice-utest-3-2-sem-scan-cross-check-fresh-.md)
- 🟡 **[2.5] output idêntico quente/frio — render lê sempre do storage** → [2.5](plans/2-cache/2.5-output-id-ntico-quente-frio-render-l-sempre-do-storage.md)

### [3] scan — Scan — descoberta, pareamento, vocabulário · implementando · sprint 8  [🟡🟡🟡🟠🟠]
- 🟡 **[3.1] walk por glob + TEST.yaml (exclude global/fase, include padrão)** → [3.1](plans/3-scan/3.1-walk-por-glob-test-yaml-exclude-global-fase-include-padr-o-.md)
- 🟡 **[3.2] findTarget — pareamento teste↔alvo, descasque progressivo, .eval.js↔.md de feature** → [3.2](plans/3-scan/3.2-findtarget-pareamento-teste-alvo-descasque-progressivo-eval-js-md-de-feature.md)
- 🟡 **[3.3] kinds — vocabulário de sufixos num lugar; register() abre tipo nas 2 pontas** → [3.3](plans/3-scan/3.3-kinds-vocabul-rio-de-sufixos-num-lugar-register-abre-tipo-nas-2-pontas.md)
- 🟠 **[3.4] ganchos de extensão — registerExecutor / registerEntries / registerPhaseSetup** → [3.4](plans/3-scan/3.4-ganchos-de-extens-o-registerexecutor-registerentries-registerphasesetup-eval-js-tuit-chromium-1x-.md)
- 🟠 **[3.5] cobertura — todo arquivo do utest mapeado em TEST.yaml, sem leaks** → [3.5](plans/3-scan/3.5-cobertura-sources-sem-t-js-pareado-uncovered-.md)

### [4] report — Report — compacto por desenho, expressivo quando precisa · implementando · sprint 9  [🟡🟡🟠🟠🟠🔵]
- 🟡 **[4.1] relatório compacto — phaseLine (Σs 🐢N), compactFails, verbosidade 0-3** → [4.1](plans/4-report/4.1-relat-rio-compacto-phaseline-s-n-compactfails-verbosidade-0-3-derivada-do-escopo.md)
- 🟡 **[4.2] hogs — badge 🐢N = segundos sempre; deltaTag só em hog que re-rodou** → [4.2](plans/4-report/4.2-hogs-badge-n-segundos-sempre-deltatag-s-em-hog-que-re-rodou-hogs-modo-parte.md)
- 🟠 **[4.3] drill-in — escopo estreito re-executa e sobe de nível; storage é o índice** → [4.3](plans/4-report/4.3-drill-in-escopo-estreito-re-executa-e-sobe-de-n-vel-storage-o-ndice-utest-3-2-sem-scan-.md)
- 🟠 **[4.4] progressBar + --watch (delta, não varredura) + OSC-8 hyperlink no tip** → [4.4](plans/4-report/4.4-progressbar-watch-delta-n-o-varredura-osc-8-hyperlink-no-tip.md)
- 🟠 **[4.5] --json — uma linha por arquivo p/ máquina (sprint eval --sweep)** → [4.5](plans/4-report/4.5--json-uma-linha-por-arquivo-p-m-quina-sprint-eval-sweep-.md)
- 🔵 **[4.6] v2 continuo: rio de passados, bloco cheio so nos falhos** → [4.6](plans/4-report/4.6-v2-continuo-rio-de-passados-bloco-cheio-so-nos-falhos.md)

### [5] profiling — Profiling — que função custou, que região custou · implementando · sprint 10  [🟡🟡🟡🟡🟠]
- 🟡 **[5.1] probe — instrumenta chamadas p/ hogs: 2 vistas (flat report / grafo tree)** → [5.1](plans/5-profiling/5.1-probe-instrumenta-chamadas-p-hogs-2-vistas-flat-report-grafo-tree-callers-edges-self-time.md)
- 🟡 **[5.2] trace — cronômetro de regiões de wall-time; (untracked) explícito** → [5.2](plans/5-profiling/5.2-trace-cron-metro-de-regi-es-de-wall-time-install-mark-end-region-wrapspawns-untracked-expl-cito.md)
- 🟡 **[5.3] trace de subprocesso — trace-preload.mjs via bun --import, enxerto de fragmento** → [5.3](plans/5-profiling/5.3-trace-de-subprocesso-trace-preload-mjs-via-bun-import-enxerto-de-fragmento-na-folha-sh-.md)
- 🟡 **[5.4] trace.json — Chrome Trace Event; (runtime teardown) no exit** → [5.4](plans/5-profiling/5.4-trace-json-chrome-trace-event-chrome-tracing-perfetto-runtime-teardown-no-exit.md)
- 🟠 **[5.5] --trace liga probe OU trace conforme a fase; teto do sh() sobe p/ 60s** → [5.5](plans/5-profiling/5.5--trace-liga-probe-ou-trace-conforme-a-fase-teto-do-sh-sobe-p-60s-s-escopo-filtrado.md)

### [6] compat — Compat — bun:test, jest, .tuit, e a saída dessa dependência · implementando · sprint 4  [🟠🟠🟠🟠]
- 🟠 **[6.1] shims bun:test/jest — describe/it/expect (~40 matchers), lifecycle hooks, spyOn** → [6.1](plans/6-compat/6.1-shims-bun-test-jest-describe-it-expect-40-matchers-lifecycle-hooks-spyon.md)
- 🟠 **[6.2] plugin onLoad — redireciona bun:test/node:test p/ shims; preserva source maps** → [6.2](plans/6-compat/6.2-plugin-onload-redireciona-bun-test-node-test-p-shims-preserva-source-maps.md)
- 🟠 **[6.3] migrate — codemod expect()->check() (transforms determinísticos, pula lifecycle)** → [6.3](plans/6-compat/6.3-migrate-codemod-expect-check-transforms-determin-sticos-pula-lifecycle-.md)
- 🟠 **[6.4] .tuit — parser+executor (JSON+arte ASCII, blocos acumulam via _assign/soml)** → [6.4](plans/6-compat/6.4--tuit-parser-executor-json-arte-ascii-blocos-acumulam-via-assign-soml-.md)

### [7] isolation — Isolation — o alvo arquitetural que ainda não chegou · implementando · sprint 2  [🟠🟡🟠]
- 🟠 **[7.1] workers por arquivo — 1 arquivo = 1 processo (worker.js base; hoje in-process)** → [7.1](plans/7-isolation/7.1-workers-por-arquivo-1-arquivo-1-processo-worker-js-base-hoje-in-process-.md)
- 🟡 **[7.2] vazamento cross-arquivo — exceção async tardia no arquivo errado (in-process)** → [7.2](plans/7-isolation/7.2-vazamento-cross-arquivo-exce-o-async-tardia-atribu-da-ao-arquivo-errado-in-process-.md)
- 🟠 **[7.3] runner.js modular — runTest/run/loadFile/serialize; caminho do subprocesso e da fase eval externa** → [7.3](plans/7-isolation/7.3-runner-js-modular-runtest-run-loadfile-serialize-caminho-do-subprocesso-e-da-fase-eval-externa.md)

🟠 13 implementando · 🟡 18 testada · 🔵 1 confirmada
<!-- board:end -->
