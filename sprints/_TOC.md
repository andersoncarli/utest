# Dashboard — Frentes, Features e Sprints

Estado do sistema como arvore colapsavel: **Frente → Feature → [sprints]**. Cada sprint
e um link numerico `[NNN]`; passe o mouse para ver titulo + intro do report. Gerado por
`sprint reports:index` a partir dos arquivos de frente/feature e do frontmatter dos
reports — nao editar a mao. Board de estado + proxima acao: `STATUS.md`.

Legenda: ⚫ planejada · 🟠 implementando · 🟡 testada · 🟢 avaliada · 🔵 confirmada · 🟣 consolidada · ⚪ rocha · ⬜ pausada · 🔴 regressao

<details><summary>🟠 <b>[1] core</b> — Núcleo — coletor, asserção, veredito</summary>

<details><summary>🟡 [1.1] test() — coletor de árvore + isolamento por arquivo (begin/end) — testada</summary>

[001](sprints/001-runner-in-process-nasce.report.md "report · Sprint retroativo. O runner in-process nasce: scan/run/render num processo só, contrato zero-import.")

</details>

<details><summary>🟡 [1.2] check() — asserções por repr, checkFail / checkException — testada</summary>

[002](sprints/002-desacople-do-bot-e-a-evidencia-do-vazamento.report.md "report · Sprint retroativo. Desacople de bot/lib para utils/src, primeiros self-tests, e a evidência documentada do vazamento assíncrono cross-arquivo.")

</details>

<details><summary>🟡 [1.3] sealed — check tardio reabre o veredito de quem o soltou — testada</summary>

[003](sprints/003-a-regra-do-cache-sem-furo.report.md "report · Sprint retroativo. A regra do cache reescrita para não ter furo (bucket de segundo + grafo de deps); kinds.js nasce; leak.t.js trava o sealed.") [007](sprints/007-trace-a-arvore-de-para-onde-foi-a-parede.report.md "report · Primeiro sprint fechado sob o ZSS. trace.js + trace-preload.mjs + --trace: a árvore de para-onde-foi-a-parede; e o clearTimeout que fecha a fuga de 10s do event loop.")

</details>

<details><summary>🟠 [1.4] console-capture — console.* não vaza de teste verde — implementando</summary>

[004](sprints/004-preparacao-do-eval-executor-entries-phasesetup.report.md "report · Sprint retroativo. Os três ganchos de extensão (executor/entries/phaseSetup), tuit.js, console-capture, cacheFailure e probe — a preparação do .eval.js.")

</details>

</details>

<details><summary>🟠 <b>[2] cache</b> — Cache — a regra sem furo</summary>

<details><summary>🟡 [2.1] regra do mtime — segundo cravado + ms = contagem de checks; conjunto pareado — testada</summary>

[003](sprints/003-a-regra-do-cache-sem-furo.report.md "report · Sprint retroativo. A regra do cache reescrita para não ter furo (bucket de segundo + grafo de deps); kinds.js nasce; leak.t.js trava o sealed.")

</details>

<details><summary>🟡 [2.2] grafo de deps — IMPORT_RE (inclui efeito colateral), extraRoots, ciclo, atime — testada</summary>

[003](sprints/003-a-regra-do-cache-sem-furo.report.md "report · Sprint retroativo. A regra do cache reescrita para não ter furo (bucket de segundo + grafo de deps); kinds.js nasce; leak.t.js trava o sealed.")

</details>

<details><summary>🟡 [2.3] cacheFailure — vermelho reproduzível de eval não re-roda (sidecar) — testada</summary>

[004](sprints/004-preparacao-do-eval-executor-entries-phasesetup.report.md "report · Sprint retroativo. Os três ganchos de extensão (executor/entries/phaseSetup), tuit.js, console-capture, cacheFailure e probe — a preparação do .eval.js.") [007](sprints/007-trace-a-arvore-de-para-onde-foi-a-parede.report.md "report · Primeiro sprint fechado sob o ZSS. trace.js + trace-preload.mjs + --trace: a árvore de para-onde-foi-a-parede; e o clearTimeout que fecha a fuga de 10s do event loop.")

</details>

<details><summary>🟡 [2.4] results.json — histórico por fase; índice (utest 3.2 sem scan) + cross-check fresh() — testada</summary>

[006](sprints/006-report-compacto-probe-grafo-results-json.report.md "report · Sprint retroativo. Report compacto (phaseLine/compactFails/🐢=segundos), probe grafo (tree/callers/edges), results.json (índice + quente==frio), verbosidade derivada do escopo.")

</details>

<details><summary>🟡 [2.5] output idêntico quente/frio — render lê sempre do storage — testada</summary>

[006](sprints/006-report-compacto-probe-grafo-results-json.report.md "report · Sprint retroativo. Report compacto (phaseLine/compactFails/🐢=segundos), probe grafo (tree/callers/edges), results.json (índice + quente==frio), verbosidade derivada do escopo.")

</details>

</details>

<details><summary>🟠 <b>[3] scan</b> — Scan — descoberta, pareamento, vocabulário</summary>

<details><summary>🟡 [3.1] walk por glob + TEST.yaml (exclude global/fase, include padrão) — testada</summary>

[001](sprints/001-runner-in-process-nasce.report.md "report · Sprint retroativo. O runner in-process nasce: scan/run/render num processo só, contrato zero-import.") [005](sprints/005-argumento-de-fase.report.md "report · Sprint retroativo. utest <phase> seleciona uma fase só; scan() finalmente recebe o 3º argumento e as fases do TEST.yaml passam a ser varridas.")

</details>

<details><summary>🟡 [3.2] findTarget — pareamento teste↔alvo, descasque progressivo, .eval.js↔.md de feature — testada</summary>

_(sem sprints ainda)_

</details>

<details><summary>🟡 [3.3] kinds — vocabulário de sufixos num lugar; register() abre tipo nas 2 pontas — testada</summary>

[003](sprints/003-a-regra-do-cache-sem-furo.report.md "report · Sprint retroativo. A regra do cache reescrita para não ter furo (bucket de segundo + grafo de deps); kinds.js nasce; leak.t.js trava o sealed.") [007](sprints/007-trace-a-arvore-de-para-onde-foi-a-parede.report.md "report · Primeiro sprint fechado sob o ZSS. trace.js + trace-preload.mjs + --trace: a árvore de para-onde-foi-a-parede; e o clearTimeout que fecha a fuga de 10s do event loop.")

</details>

<details><summary>🟠 [3.4] ganchos de extensão — registerExecutor / registerEntries / registerPhaseSetup — implementando</summary>

[004](sprints/004-preparacao-do-eval-executor-entries-phasesetup.report.md "report · Sprint retroativo. Os três ganchos de extensão (executor/entries/phaseSetup), tuit.js, console-capture, cacheFailure e probe — a preparação do .eval.js.")

</details>

<details><summary>🟠 [3.5] cobertura — todo arquivo do utest mapeado em TEST.yaml, sem leaks — implementando</summary>

[008](sprints/008-verbosidade-por-arquivo-e-a-regua-em-colunas.report.md "verbosidade-por-arquivo-e-a-regua-em-colunas · Os quatro retoques de `docs/NOTES.md` antes do deploy. O `-v:2` vira a visão por ARQUIVO (a barra de título que só o `-v:3` alcançava), a cobertura passa")

</details>

</details>

<details><summary>🟠 <b>[4] report</b> — Report — compacto por desenho, expressivo quando precisa</summary>

<details><summary>🟡 [4.1] relatório compacto — phaseLine (Σs 🐢N), compactFails, verbosidade 0-3 — testada</summary>

[001](sprints/001-runner-in-process-nasce.report.md "report · Sprint retroativo. O runner in-process nasce: scan/run/render num processo só, contrato zero-import.") [002](sprints/002-desacople-do-bot-e-a-evidencia-do-vazamento.report.md "report · Sprint retroativo. Desacople de bot/lib para utils/src, primeiros self-tests, e a evidência documentada do vazamento assíncrono cross-arquivo.") [006](sprints/006-report-compacto-probe-grafo-results-json.report.md "report · Sprint retroativo. Report compacto (phaseLine/compactFails/🐢=segundos), probe grafo (tree/callers/edges), results.json (índice + quente==frio), verbosidade derivada do escopo.") [008](sprints/008-verbosidade-por-arquivo-e-a-regua-em-colunas.report.md "verbosidade-por-arquivo-e-a-regua-em-colunas · Os quatro retoques de `docs/NOTES.md` antes do deploy. O `-v:2` vira a visão por ARQUIVO (a barra de título que só o `-v:3` alcançava), a cobertura passa")

</details>

<details><summary>🟡 [4.2] hogs — badge 🐢N = segundos sempre; deltaTag só em hog que re-rodou — testada</summary>

[006](sprints/006-report-compacto-probe-grafo-results-json.report.md "report · Sprint retroativo. Report compacto (phaseLine/compactFails/🐢=segundos), probe grafo (tree/callers/edges), results.json (índice + quente==frio), verbosidade derivada do escopo.")

</details>

<details><summary>🟠 [4.3] drill-in — escopo estreito re-executa e sobe de nível; storage é o índice — implementando</summary>

[005](sprints/005-argumento-de-fase.report.md "report · Sprint retroativo. utest <phase> seleciona uma fase só; scan() finalmente recebe o 3º argumento e as fases do TEST.yaml passam a ser varridas.") [006](sprints/006-report-compacto-probe-grafo-results-json.report.md "report · Sprint retroativo. Report compacto (phaseLine/compactFails/🐢=segundos), probe grafo (tree/callers/edges), results.json (índice + quente==frio), verbosidade derivada do escopo.")

</details>

<details><summary>🟠 [4.4] progressBar + --watch (delta, não varredura) + OSC-8 hyperlink no tip — implementando</summary>

_(sem sprints ainda)_

</details>

<details><summary>🟠 [4.5] --json — uma linha por arquivo p/ máquina (sprint eval --sweep) — implementando</summary>

_(sem sprints ainda)_

</details>

<details><summary>🔵 [4.6] v2 continuo: rio de passados, bloco cheio so nos falhos — confirmada</summary>

[009](sprints/009-v2-continuo-rio-de-passados-bloco-cheio-so-nos-falhos.report.md "v2 continuo: rio de passados, bloco cheio so nos falhos · `-v:2` (`fullView`, `viewer.js`) trocou uma linha (dotfill + tempo) por ARQUIVO verde por um rio continuo — nome + contagem, dois espacos, sof")

</details>

</details>

<details><summary>🟠 <b>[5] profiling</b> — Profiling — que função custou, que região custou</summary>

<details><summary>🟡 [5.1] probe — instrumenta chamadas p/ hogs: 2 vistas (flat report / grafo tree) — testada</summary>

[004](sprints/004-preparacao-do-eval-executor-entries-phasesetup.report.md "report · Sprint retroativo. Os três ganchos de extensão (executor/entries/phaseSetup), tuit.js, console-capture, cacheFailure e probe — a preparação do .eval.js.") [006](sprints/006-report-compacto-probe-grafo-results-json.report.md "report · Sprint retroativo. Report compacto (phaseLine/compactFails/🐢=segundos), probe grafo (tree/callers/edges), results.json (índice + quente==frio), verbosidade derivada do escopo.")

</details>

<details><summary>🟡 [5.2] trace — cronômetro de regiões de wall-time; (untracked) explícito — testada</summary>

[007](sprints/007-trace-a-arvore-de-para-onde-foi-a-parede.report.md "report · Primeiro sprint fechado sob o ZSS. trace.js + trace-preload.mjs + --trace: a árvore de para-onde-foi-a-parede; e o clearTimeout que fecha a fuga de 10s do event loop.")

</details>

<details><summary>🟡 [5.3] trace de subprocesso — trace-preload.mjs via bun --import, enxerto de fragmento — testada</summary>

[007](sprints/007-trace-a-arvore-de-para-onde-foi-a-parede.report.md "report · Primeiro sprint fechado sob o ZSS. trace.js + trace-preload.mjs + --trace: a árvore de para-onde-foi-a-parede; e o clearTimeout que fecha a fuga de 10s do event loop.")

</details>

<details><summary>🟡 [5.4] trace.json — Chrome Trace Event; (runtime teardown) no exit — testada</summary>

[007](sprints/007-trace-a-arvore-de-para-onde-foi-a-parede.report.md "report · Primeiro sprint fechado sob o ZSS. trace.js + trace-preload.mjs + --trace: a árvore de para-onde-foi-a-parede; e o clearTimeout que fecha a fuga de 10s do event loop.")

</details>

<details><summary>🟠 [5.5] --trace liga probe OU trace conforme a fase; teto do sh() sobe p/ 60s — implementando</summary>

[007](sprints/007-trace-a-arvore-de-para-onde-foi-a-parede.report.md "report · Primeiro sprint fechado sob o ZSS. trace.js + trace-preload.mjs + --trace: a árvore de para-onde-foi-a-parede; e o clearTimeout que fecha a fuga de 10s do event loop.") [008](sprints/008-verbosidade-por-arquivo-e-a-regua-em-colunas.report.md "verbosidade-por-arquivo-e-a-regua-em-colunas · Os quatro retoques de `docs/NOTES.md` antes do deploy. O `-v:2` vira a visão por ARQUIVO (a barra de título que só o `-v:3` alcançava), a cobertura passa")

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

[004](sprints/004-preparacao-do-eval-executor-entries-phasesetup.report.md "report · Sprint retroativo. Os três ganchos de extensão (executor/entries/phaseSetup), tuit.js, console-capture, cacheFailure e probe — a preparação do .eval.js.")

</details>

</details>

<details><summary>🟠 <b>[7] isolation</b> — Isolation — o alvo arquitetural que ainda não chegou</summary>

<details><summary>🟠 [7.1] workers por arquivo — 1 arquivo = 1 processo (worker.js base; hoje in-process) — implementando</summary>

_(sem sprints ainda)_

</details>

<details><summary>🟡 [7.2] vazamento cross-arquivo — exceção async tardia no arquivo errado (in-process) — testada</summary>

[002](sprints/002-desacople-do-bot-e-a-evidencia-do-vazamento.report.md "report · Sprint retroativo. Desacople de bot/lib para utils/src, primeiros self-tests, e a evidência documentada do vazamento assíncrono cross-arquivo.")

</details>

<details><summary>🟠 [7.3] runner.js modular — runTest/run/loadFile/serialize; caminho do subprocesso e da fase eval externa — implementando</summary>

_(sem sprints ainda)_

</details>

</details>
