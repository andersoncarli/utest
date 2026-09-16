# Dashboard — Frentes, Features e Sprints

Estado do sistema como arvore colapsavel: **Frente → Feature → [sprints]**. Cada sprint
e um link numerico `[NNN]`; passe o mouse para ver titulo + intro do report. Gerado por
`sprint reports:index` a partir dos arquivos de frente/feature e do frontmatter dos
reports — nao editar a mao. Board de estado + proxima acao: `STATUS.md`.

Legenda: ⚫ planejada · 🟠 implementando · 🟡 testada · 🟢 avaliada · 🔵 confirmada · 🟣 consolidada · ⚪ rocha · ⬜ pausada · 🔴 regressao

<details><summary>🟠 <b>[1] core</b> — Núcleo — coletor, asserção, veredito</summary>

<details><summary>🟡 [1.1] test() — coletor de árvore + isolamento por arquivo (begin/end) — testada</summary>

[001](sprints/001-runner-in-process-nasce.md "Sprint 001 — report · > Sprint retroativo, reconstruído em 2026-09-03 a partir de `git log`. Objetivo, não > exaustivo: registra a janela e a intenção, não cada linha.")

</details>

<details><summary>🟡 [1.2] check() — asserções por repr, checkFail / checkException — testada</summary>

[002](sprints/002-desacople-do-bot-e-a-evidencia-do-vazamento.md "Sprint 002 — report · > Sprint retroativo, reconstruído em 2026-09-03.")

</details>

<details><summary>🟡 [1.3] sealed — check tardio reabre o veredito de quem o soltou — testada</summary>

[003](sprints/003-a-regra-do-cache-sem-furo.md "Sprint 003 — report · > Sprint retroativo, reconstruído em 2026-09-03.") [007](sprints/007-trace-a-arvore-de-para-onde-foi-a-parede.md "Sprint 007 — report · > Primeiro sprint FECHADO sob o ZSS. O código estava no working tree quando o ZSS foi > instalado (2026-09-03) — este par plan/report o registra retroativamente e o commit > segu")

</details>

<details><summary>🟠 [1.4] console-capture — console.* não vaza de teste verde — implementando</summary>

[004](sprints/004-preparacao-do-eval-executor-entries-phasesetup.md "Sprint 004 — report · > Sprint retroativo, reconstruído em 2026-09-03.")

</details>

</details>

<details><summary>🟠 <b>[2] cache</b> — Cache — a regra sem furo</summary>

<details><summary>🟡 [2.1] regra do mtime — segundo cravado + ms = contagem de checks; conjunto pareado — testada</summary>

[003](sprints/003-a-regra-do-cache-sem-furo.md "Sprint 003 — report · > Sprint retroativo, reconstruído em 2026-09-03.")

</details>

<details><summary>🟡 [2.2] grafo de deps — IMPORT_RE (inclui efeito colateral), extraRoots, ciclo, atime — testada</summary>

[003](sprints/003-a-regra-do-cache-sem-furo.md "Sprint 003 — report · > Sprint retroativo, reconstruído em 2026-09-03.")

</details>

<details><summary>🟡 [2.3] cacheFailure — vermelho reproduzível de eval não re-roda (sidecar) — testada</summary>

[004](sprints/004-preparacao-do-eval-executor-entries-phasesetup.md "Sprint 004 — report · > Sprint retroativo, reconstruído em 2026-09-03.") [007](sprints/007-trace-a-arvore-de-para-onde-foi-a-parede.md "Sprint 007 — report · > Primeiro sprint FECHADO sob o ZSS. O código estava no working tree quando o ZSS foi > instalado (2026-09-03) — este par plan/report o registra retroativamente e o commit > segu")

</details>

<details><summary>🟡 [2.4] results.json — histórico por fase; índice (utest 3.2 sem scan) + cross-check fresh() — testada</summary>

[006](sprints/006-report-compacto-probe-grafo-results-json.md "Sprint 006 — report · > Sprint retroativo, reconstruído em 2026-09-03.")

</details>

<details><summary>🟡 [2.5] output idêntico quente/frio — render lê sempre do storage — testada</summary>

[006](sprints/006-report-compacto-probe-grafo-results-json.md "Sprint 006 — report · > Sprint retroativo, reconstruído em 2026-09-03.")

</details>

<details><summary>🔵 [2.6] results.json arbitra o cache — segunda checagem sobre o mtime cravado — confirmada</summary>

[011](sprints/011-results-json-arbitra-o-cache-segunda-checagem-sobre-o-mtime-cravado.md "results.json arbitra o cache — segunda checagem sobre o mtime cravado · Investigando 'o cache não funciona em ~/soml e ~/sprint-cli' (pedido do usuário) — motivo completo em 'Por que este sprint exist") [016](sprints/016-cache-sobre-o-ledger-o-ledger-arbitra-o-frescor-results-json-em-paralelo.md "cache sobre o ledger — o ledger arbitra o frescor, results.json em paralelo · Plano do sprint 016 (feature 2.7).")

</details>

<details><summary>🟡 [2.7] cache sobre o ledger — o ledger arbitra o frescor por sha256, results.json em paralelo — testada</summary>

[016](sprints/016-cache-sobre-o-ledger-o-ledger-arbitra-o-frescor-results-json-em-paralelo.md "cache sobre o ledger — o ledger arbitra o frescor, results.json em paralelo · Plano do sprint 016 (feature 2.7).") [018](sprints/018-cacheledger-project-desembrulha-o-registro-iodb-o-ledger-enabled-matava-todo-cache-hit.md "cacheLedger project desembrulha o registro iodb - o ledger enabled matava todo cache-hit · Plano do sprint 018 (feature 2.7).")

</details>

<details><summary>🔵 [2.8] scanner-sync — cache miss por divergência de mtime resolve rodando, não repete a cada execução — confirmada</summary>

_(sem sprints ainda)_

</details>

</details>

<details><summary>🟠 <b>[3] scan</b> — Scan — descoberta, pareamento, vocabulário</summary>

<details><summary>🔵 [3.1] walk por glob + TEST.yaml (exclude global/fase, include padrão) — confirmada</summary>

[001](sprints/001-runner-in-process-nasce.md "Sprint 001 — report · > Sprint retroativo, reconstruído em 2026-09-03 a partir de `git log`. Objetivo, não > exaustivo: registra a janela e a intenção, não cada linha.") [005](sprints/005-argumento-de-fase.md "Sprint 005 — report · > Sprint retroativo, reconstruído em 2026-09-03. Sprint pequeno — um commit.") [012](sprints/012-watch-respeita-o-exclude-do-test-yaml.md "watch respeita o exclude do TEST.yaml · Plano do sprint 012 (feature 3.1).")

</details>

<details><summary>🔵 [3.2] findTarget — pareamento teste↔alvo, descasque progressivo, .eval.js↔.md de feature — confirmada</summary>

[017](sprints/017-reusar-makefilter-no-isfile-resetregistry-entre-fases-testes-nao-poluem-entriesfor.md "reusar makeFilter no _isFile; resetRegistry entre fases — testes nao poluem entriesFor · Plano do sprint 017. Features **3.2** (findTarget / pareamento por caminho) e **3.4** (ganchos de extensão — `r")

</details>

<details><summary>🟡 [3.3] kinds — vocabulário de sufixos num lugar; register() abre tipo nas 2 pontas — testada</summary>

[003](sprints/003-a-regra-do-cache-sem-furo.md "Sprint 003 — report · > Sprint retroativo, reconstruído em 2026-09-03.") [007](sprints/007-trace-a-arvore-de-para-onde-foi-a-parede.md "Sprint 007 — report · > Primeiro sprint FECHADO sob o ZSS. O código estava no working tree quando o ZSS foi > instalado (2026-09-03) — este par plan/report o registra retroativamente e o commit > segu")

</details>

<details><summary>🔵 [3.4] ganchos de extensão — registerExecutor / registerEntries / registerPhaseSetup — confirmada</summary>

[004](sprints/004-preparacao-do-eval-executor-entries-phasesetup.md "Sprint 004 — report · > Sprint retroativo, reconstruído em 2026-09-03.") [017](sprints/017-reusar-makefilter-no-isfile-resetregistry-entre-fases-testes-nao-poluem-entriesfor.md "reusar makeFilter no _isFile; resetRegistry entre fases — testes nao poluem entriesFor · Plano do sprint 017. Features **3.2** (findTarget / pareamento por caminho) e **3.4** (ganchos de extensão — `r")

</details>

<details><summary>🟠 [3.5] cobertura — todo arquivo do utest mapeado em TEST.yaml, sem leaks — implementando</summary>

[008](sprints/008-verbosidade-por-arquivo-e-a-regua-em-colunas.md "verbosidade-por-arquivo-e-a-regua-em-colunas · Plano do sprint 008 (feature 4.1). Origem: os quatro itens de `docs/NOTES.md`, os retoques pedidos antes do deploy.")

</details>

</details>

<details><summary>🟠 <b>[4] report</b> — Report — compacto por desenho, expressivo quando precisa</summary>

<details><summary>🟡 [4.1] relatório compacto — phaseLine (Σs 🐢N), compactFails, verbosidade 0-3 — testada</summary>

[001](sprints/001-runner-in-process-nasce.md "Sprint 001 — report · > Sprint retroativo, reconstruído em 2026-09-03 a partir de `git log`. Objetivo, não > exaustivo: registra a janela e a intenção, não cada linha.") [002](sprints/002-desacople-do-bot-e-a-evidencia-do-vazamento.md "Sprint 002 — report · > Sprint retroativo, reconstruído em 2026-09-03.") [006](sprints/006-report-compacto-probe-grafo-results-json.md "Sprint 006 — report · > Sprint retroativo, reconstruído em 2026-09-03.") [008](sprints/008-verbosidade-por-arquivo-e-a-regua-em-colunas.md "verbosidade-por-arquivo-e-a-regua-em-colunas · Plano do sprint 008 (feature 4.1). Origem: os quatro itens de `docs/NOTES.md`, os retoques pedidos antes do deploy.") [015](sprints/015-validar-saidas-de-utest-v0-v3-json-console-capturado-hogs-so-com-flag-ou-erro-v1-single-line-checkview-esperado-recebido.md "validar saidas de utest: v0-v3, --json, console capturado, hogs so com flag ou erro, v1 single-line, checkView esperado/recebido · Sprint 015 · feature 4.1 (`viewer.js` + bloco de render de `utest.js`") [019](sprints/019-interface-issues-utest-arquivo-verde-imprime-so-n-wms-erro-cai-no-checkview-com-callerline-expected-received.md "interface-issues: utest <arquivo> verde imprime so ✔N (Wms); erro cai no checkView com callerLine/expected/received · Plano do sprint 019 (feature 4.1). Sprint guarda-chuva de quirks de interface — re")

</details>

<details><summary>🟡 [4.2] hogs — badge 🐢N = segundos sempre; deltaTag só em hog que re-rodou — testada</summary>

[006](sprints/006-report-compacto-probe-grafo-results-json.md "Sprint 006 — report · > Sprint retroativo, reconstruído em 2026-09-03.")

</details>

<details><summary>🟠 [4.3] drill-in — escopo estreito re-executa e sobe de nível; storage é o índice — implementando</summary>

[005](sprints/005-argumento-de-fase.md "Sprint 005 — report · > Sprint retroativo, reconstruído em 2026-09-03. Sprint pequeno — um commit.") [006](sprints/006-report-compacto-probe-grafo-results-json.md "Sprint 006 — report · > Sprint retroativo, reconstruído em 2026-09-03.")

</details>

<details><summary>🟠 [4.4] progressBar + --watch (delta, não varredura) + OSC-8 hyperlink no tip — implementando</summary>

_(sem sprints ainda)_

</details>

<details><summary>🟠 [4.5] --json — uma linha por arquivo p/ máquina (sprint eval --sweep) — implementando</summary>

_(sem sprints ainda)_

</details>

<details><summary>🔵 [4.6] v2 continuo: rio de passados, bloco cheio so nos falhos — confirmada</summary>

[009](sprints/009-v2-continuo-rio-de-passados-bloco-cheio-so-nos-falhos.md "v2 continuo: rio de passados, bloco cheio so nos falhos · Plano do sprint 009 (feature 4.6).")

</details>

<details><summary>🔵 [4.7] scan distingue teste de fonte sem config — .eval.js/.tui/.int.js fora do denominador de coverage — confirmada</summary>

[020](sprints/020-fswatch.md "consumir-fswatch · Plano do sprint 020 (feature 8.3). A arvore do projeto passa a poder vir do baseline persistente do sibling `iodb/fswatch`, com o `readdirSync` atual como fallback e baseline de com")

</details>

</details>

<details><summary>🟠 <b>[5] profiling</b> — Profiling — que função custou, que região custou</summary>

<details><summary>🟡 [5.1] probe — instrumenta chamadas p/ hogs: 2 vistas (flat report / grafo tree) — testada</summary>

[004](sprints/004-preparacao-do-eval-executor-entries-phasesetup.md "Sprint 004 — report · > Sprint retroativo, reconstruído em 2026-09-03.") [006](sprints/006-report-compacto-probe-grafo-results-json.md "Sprint 006 — report · > Sprint retroativo, reconstruído em 2026-09-03.")

</details>

<details><summary>🟡 [5.2] trace — cronômetro de regiões de wall-time; (untracked) explícito — testada</summary>

[007](sprints/007-trace-a-arvore-de-para-onde-foi-a-parede.md "Sprint 007 — report · > Primeiro sprint FECHADO sob o ZSS. O código estava no working tree quando o ZSS foi > instalado (2026-09-03) — este par plan/report o registra retroativamente e o commit > segu")

</details>

<details><summary>🟡 [5.3] trace de subprocesso — trace-preload.mjs via bun --import, enxerto de fragmento — testada</summary>

[007](sprints/007-trace-a-arvore-de-para-onde-foi-a-parede.md "Sprint 007 — report · > Primeiro sprint FECHADO sob o ZSS. O código estava no working tree quando o ZSS foi > instalado (2026-09-03) — este par plan/report o registra retroativamente e o commit > segu")

</details>

<details><summary>🟡 [5.4] trace.json — Chrome Trace Event; (runtime teardown) no exit — testada</summary>

[007](sprints/007-trace-a-arvore-de-para-onde-foi-a-parede.md "Sprint 007 — report · > Primeiro sprint FECHADO sob o ZSS. O código estava no working tree quando o ZSS foi > instalado (2026-09-03) — este par plan/report o registra retroativamente e o commit > segu")

</details>

<details><summary>🟠 [5.5] --trace liga probe OU trace conforme a fase; teto do sh() sobe p/ 60s — implementando</summary>

[007](sprints/007-trace-a-arvore-de-para-onde-foi-a-parede.md "Sprint 007 — report · > Primeiro sprint FECHADO sob o ZSS. O código estava no working tree quando o ZSS foi > instalado (2026-09-03) — este par plan/report o registra retroativamente e o commit > segu") [008](sprints/008-verbosidade-por-arquivo-e-a-regua-em-colunas.md "verbosidade-por-arquivo-e-a-regua-em-colunas · Plano do sprint 008 (feature 4.1). Origem: os quatro itens de `docs/NOTES.md`, os retoques pedidos antes do deploy.") [010](sprints/010-wrapspawns-cede-a-regiao-sh-ja-aberta-nao-duplica-engine-js-sh-.md "wrapSpawns cede a regiao sh: ja aberta (nao duplica engine.js#sh()) · Plano do sprint 010 (feature 5.5).")

</details>

</details>

<details><summary>🟠 <b>[6] compat</b> — Compat — bun:test, jest, .tuit, e a saída dessa dependência</summary>

<details><summary>🟠 [6.1] shims bun:test/jest — describe/it/expect (~40 matchers), lifecycle hooks, spyOn — implementando</summary>

_(sem sprints ainda)_

</details>

<details><summary>🟠 [6.2] plugin onLoad — redireciona bun:test/node:test p/ shims; preserva source maps — implementando</summary>

_(sem sprints ainda)_

</details>

<details><summary>🟠 [6.3] migrate — codemod expect()->check() (transforms determinísticos, pula lifecycle) — implementando</summary>

_(sem sprints ainda)_

</details>

<details><summary>🟠 [6.4] .tuit — parser+executor (JSON+arte ASCII, blocos acumulam via _assign/soml) — implementando</summary>

[004](sprints/004-preparacao-do-eval-executor-entries-phasesetup.md "Sprint 004 — report · > Sprint retroativo, reconstruído em 2026-09-03.")

</details>

</details>

<details><summary>🟠 <b>[7] isolation</b> — Isolation — o alvo arquitetural que ainda não chegou</summary>

<details><summary>🟠 [7.1] workers por arquivo — 1 arquivo = 1 processo (worker.js base; hoje in-process) — implementando</summary>

_(sem sprints ainda)_

</details>

<details><summary>🔵 [7.2] vazamento cross-arquivo — exceção async tardia no arquivo errado (in-process) — confirmada</summary>

[002](sprints/002-desacople-do-bot-e-a-evidencia-do-vazamento.md "Sprint 002 — report · > Sprint retroativo, reconstruído em 2026-09-03.") [024](sprints/024-fechar-006-007-008-012-vazamento-cross-arquivo-e-cli-posicional-trace.report.md "fechar 006, 007, 008, 012 — vazamento cross-arquivo e CLI posicional/trace · Fechou 4 issues do `utest` (006, 007, 008, 012) atrás de duas causas raiz: o global `check.test` vazando entre execuções, e")

</details>

<details><summary>🟠 [7.3] runner.js modular — runTest/run/loadFile/serialize; caminho do subprocesso e da fase eval externa — implementando</summary>

_(sem sprints ainda)_

</details>

</details>

<details><summary>🟠 <b>[8] ledger</b> — memoria permanente — o ledger criptografico sobre iodb</summary>

<details><summary>🔵 [8.1] o ledger append-only encadeado sobre iodb — memoria permanente do utest — confirmada</summary>

[013](sprints/013-o-ledger-append-only-encadeado-sobre-iodb.md "o ledger append-only encadeado sobre iodb · Plano do sprint 013 (feature 8.1). A preencher: objetivo, passos concretos (arquivo exato, o que muda, comando de verify) e criterio de pronto.") [021](sprints/021-utest-sobre-iodb-fswatch.md "utest se apoia em iodb/fswatch, e mantem o fallback · Milestone. Features **8.1** (ledger append-only), **8.2** (`.utest/STATE`) e **8.3** (`scanner.js` sobre o baseline do fswatch).")

</details>

<details><summary>🔵 [8.2] .utest/STATE — histórico de scans + deteção de mudança de config — confirmada</summary>

[014](sprints/014-test-yaml-vira-proje-o-utest-test-yaml-hist-rico-utest-test-jsonl.md "TEST.yaml vira projeção .utest/TEST.yaml + histórico .utest/TEST.jsonl · Plano do sprint 014 (feature 8.2). A preencher: objetivo, passos concretos (arquivo exato, o que muda, comando de verify) e cri") [021](sprints/021-utest-sobre-iodb-fswatch.md "utest se apoia em iodb/fswatch, e mantem o fallback · Milestone. Features **8.1** (ledger append-only), **8.2** (`.utest/STATE`) e **8.3** (`scanner.js` sobre o baseline do fswatch).")

</details>

<details><summary>⚫ [8.3] scanner.js le .fswatch/PROJECT em vez de readdirSync a cada run — planejada</summary>

[020](sprints/020-fswatch.md "consumir-fswatch · Plano do sprint 020 (feature 8.3). A arvore do projeto passa a poder vir do baseline persistente do sibling `iodb/fswatch`, com o `readdirSync` atual como fallback e baseline de com") [021](sprints/021-utest-sobre-iodb-fswatch.md "utest se apoia em iodb/fswatch, e mantem o fallback · Milestone. Features **8.1** (ledger append-only), **8.2** (`.utest/STATE`) e **8.3** (`scanner.js` sobre o baseline do fswatch).")

</details>

<details><summary>⚫ [8.4] storage-contract — planejada</summary>

[022](sprints/022-storage-contract.md "storage-contract · Um contrato unico de storage de arvore (`treeEngine.js`) com tres implementacoes — raw, iodb e sqlite — e o baseline raw que e um **iodb nu**: so log e projecao, single user, sem co")

</details>

</details>

<details><summary>🟠 <b>[90] docs</b> — Frente 90</summary>

<details><summary>⚫ [90.1] adotar o formato sprint 2.0 — arquivo unico — planejada</summary>

[023](sprints/023-migrar-sprints-para-arquivo-unico.md "migrar os 22 sprints para o formato de arquivo unico · Os 21 pares `plan.md`+`report.md` do `utest` foram unidos em `NNN-slug.md`, e 146 secoes renomeadas para as ancoras canonicas. O `utest` passa a ")

</details>

</details>
