# SPRINT-EXPERIENCE.md — log de uso do sistema `sprint` (ZSS) neste repo

> **Este arquivo NÃO documenta o método ZSS** (isso vive em `.sprint/BOOT.md` e `AGENTS.md`)
> **nem o estado do trabalho** (isso vive no board, `sprint fronts`). É um *diário de
> defeitos e atritos da ferramenta `sprint` em si* — entrada por episódio, para virar
> issue/PR no `sprint-cli`. Não envelhece calado porque não afirma nada sobre o utest.

Uma entrada por episódio, mais nova no topo. `[+]` beleza, `[-]` atrito, `[?]` dúvida em
aberto, `[bug]` defeito reproduzível.

---

## Wish list — features baratas que deixariam o fluxo mais fluido

Ordenadas por (impacto ÷ esforço). Cada uma cita o ponto no `sprint-cli` onde entraria.

### 1. `state:` validado na leitura, com a lista de slugs no erro — `src/model.js`
**Esforço: ~5 linhas.** Hoje um slug inválido (`state: tested` em vez de `unverified`)
chega cru num `STATE[hit.f.state].bullet` e **crasha** com `TypeError` (`cmds/sprint.js:234`).
Um guard no loader (`const s = STATE[f.state]; if (!s) throw new Error(\`estado inválido
"${f.state}" em ${f.file} — use: ${Object.keys(STATE).join("|")}\`)`) transforma um crash
opaco numa mensagem acionável. Bônus: `sprint docs` já é o portão de consistência de
degrau — podia rodar essa checagem.

### 2. `sprint feature new` semeia o esqueleto completo do `.md` — `cmds/sprint.js#bootstrapFeature`
**Esforço: ~10 linhas.** Hoje o `.md` nasce com `# [N.F] título` colado no `## Objetivo`
(sem intro → `sprint docs` reclama), `verify_tests: [bun test]` fixo (ignora o
`config.json` `"test"`), e sem `files:`. Três ajustes pequenos:
- escrever `\n<uma linha — o que esta feature garante>\n\n` logo após o H1;
- herdar `verify_tests` do `config.json` `"test"` quando declarado;
- aceitar `--file a.js --file b.js` na criação (hoje é sempre um `sprint update` depois).
Retratar 31 features exigiu um script para injetar intro em massa e ~40 `sprint update`.

### 3. `--slug` explícito em `sprint feature new` — `cmds/sprint.js#bootstrapFeature`
**Esforço: ~3 linhas.** O nome do arquivo vem da frase inteira do título:
`2.1-regra-do-mtime-segundo-cravado-ms-contagem-de-checks-conjunto-pareado.md` (79 chars).
Um `--slug regra-do-mtime` opcional, ou um corte automático no primeiro `—`/`:`/`;`,
deixa o `plans/` navegável.

### 4. `sprint test --sweep` distingue "0 testes" de "N verdes" — `cmds/sprint.js#runFeatureTests`
**Esforço: ~5 linhas.** Hoje o sweep promove 🟠→🟡 com base em **exit 0**. Um
`verify_tests` que aponta para um arquivo inexistente (ou um runner que sai 0 sem rodar
nada) é lido como verde. Se o runner reportasse a contagem de testes executados (o utest
já tem `--json` com `tests:`), o sweep podia tratar `tests === 0` como **não-conclusivo**
— nem promove nem rebaixa — em vez de promover em falso.

### 5. `summary:` no frontmatter do report — `src/*` (reports:index) + `cmds/sprint.js#adopt`
**Esforço: ~8 linhas.** `sprint reports:index` usa a 1ª linha não-vazia após o H1 como
tooltip do `_TOC`. Um blockquote multi-linha ali vira um tooltip gigante. Um campo
`summary:` explícito no frontmatter (que `adopt` já poderia pedir, ou derivar) é
previsível; a 1ª linha vira fallback.

### 6. `--remove-test` / `--remove-file` aceitam a string, não só o índice — `cmds/sprint.js#update`
**Esforço: ~4 linhas.** `--add-test "bun x"` aceita a string; `--remove-test "bun x"`
exige o índice 1-based. Assimétrico. Casar a string contra a lista e cair no índice só na
ambiguidade fecha a assimetria.

### 7. `sprint scan` no `sprint close` (opt-in por config) — `cmds/sprint.js#close`
**Esforço: ~6 linhas + 1 chave de config.** `.sprint/ontology.json` é versionado mas muda
a cada scan. A disciplina "scan só ao fechar sprint" hoje depende de o humano lembrar. Um
`"scan_on_close": true` no `config.json` que faça o `close` rodar `sprint scan` antes de
encenar tira o churn do caminho de cada commit sem tirar o índice do repo.

### 8. `<!-- sprint:not-meta -->` para silenciar o aviso de meta-doc — `src/*` (docs:check)
**Esforço: ~2 linhas.** `sprint docs` marca este próprio arquivo como "possível meta-doc
redundante" porque ele cita "ZSS", "degraus", "os verbos do ciclo". Um marcador opt-out no
topo do `.md` evita o falso positivo sem afrouxar a heurística para os outros.

### 9. `sprint feature new --state <slug>` (ou `sprint adopt` com `--state`) — `cmds/sprint.js`
**Esforço: ~4 linhas.** Ao retratar código maduro com `.t.js` verde, o único caminho para
"isto está 🟡" é editar o frontmatter à mão (`sprint test --sweep` deriva depois, mas
precisa de `verify_tests` bem apontado). Um `--state unverified` na criação (validado pelo
item 1) pouparia a edição em massa. Continua sendo o humano declarando, não a máquina.

---

## 2026-09-03 — instalação do ZSS no utest + ontologia + história retroativa

Contexto: `sprint init` já tinha rodado (havia `.sprint/BOOT.md`, `sprints/.gitkeep`,
`CLAUDE.md → AGENTS.md`, bloco zss no README). A sessão declarou a suite (`config.json`
`"test"`), rodou `sprint scan`, criou 7 frentes / 31 features via `sprint feature new`
para retratar o código existente, adotou 7 sprints históricos (`sprint adopt`), e zerou os
órfãos (`config.json` `ignore`).

### `[+]` o que funcionou bem

- **`sprint feature new <N.F> --front <kw>` com auto-bootstrap.** A primeira feature de
  uma frente já cria `plans/N-kw/_front.md` — não precisa de um `front new` separado.
- **`sprint scan`** derivou os pilares (`utest.js ←19`, `check.js ←8`, `test.js ←8`) e a
  cadeia de referência sem abrir um arquivo. Bom ponto de partida para as fronteiras das
  frentes.
- **`sprint init` é idempotente e diz a verdade do dia** ("instalado, mas AINDA NÃO
  pronto — 3 pendências", com o comando exato de cada uma).
- **`sprint docs`** aponta os `.md` "fora da superfície gerenciada" sem tratar como erro
  — só aviso.
- **`sprint adopt <arquivo.md> --features <N.F,...> --sprint NNN`** para retratar história.
  7 pares `plan`/`report` escritos num scratch dir → `adopt` moveu cada um para
  `sprints/NNN-slug.{plan,report}.md`, injetou frontmatter, e o `_TOC.md` passou a mostrar
  cada feature com os sprints que a tocaram + tooltip.
- **`.sprint/config.json` `ignore`** casa por prefixo E por caminho exato de arquivo
  (`src/coverage.js#isIgnored`: `rel === p || rel.startsWith(p + "/")`). Deu para ignorar
  cada `.md` de prosa histórica individualmente e zerar os órfãos. `sprint files --all`
  lista os ignorados — bom para auditar que nada sumiu por engano.

### `[-]` atritos (todos viram itens da wish list acima)

- **Slug do arquivo vem da frase inteira do título** (79 chars). → wish #3.
- **`sprint feature new` não semeia intro, não herda `verify_tests` do config, não aceita
  `--file`.** → wish #2.
- **`sprint update --remove-test` só aceita índice, não a string.** → wish #6.
- **`sprint reports:index` usa a 1ª linha após o H1** — blockquote multi-linha vira
  tooltip gigante. → wish #5.
- **`sprint docs` marca este arquivo como meta-doc redundante** (falso positivo). → wish #8.
- **Não há flag para posicionar o degrau ao adotar código maduro.** → wish #9.
- **`sprint adopt` não valida `--features` no `.plan.md`** (só no `.report.md`) — plan e
  report de um mesmo NNN podem divergir sem aviso. Menor; mantive coerente à mão.
- **Dois "coverage" no mesmo projeto.** `sprint files` diz 100% (arquivo↔feature);
  `utest.js` diz 31% (`.t.js` pareado). Nomes iguais, medidas diferentes.

### `[bug]` defeitos reproduzíveis no `sprint`

- **Slug de `state:` inválido CRASHA o `sprint`.** `state: tested` (deduzido do label no
  BOOT.md; o slug real é `unverified`) fez `sprint test --sweep` morrer com
  `TypeError: undefined is not an object (evaluating 'STATE[hit.f.state].bullet')` em
  `cmds/sprint.js:234`. Deveria ser "estado inválido em plans/…, use um de: …". → wish #1.
- **`sprint test --sweep` promove por exit 0, sem checar se testou algo.**
  `verify_tests: ["bun utest.js shims.t.js"]` (arquivo inexistente) → `utest.js` roda a
  suíte inteira e sai 0 → o sweep marcou 14 features como ✓ e promoveu 🟠→🟡 em massa.
  Contornado com `verify_tests: []` ("sem verify_tests — nada a provar"). → wish #4.
  *(O gatilho é um bug do utest — ver abaixo — mas o sweep não devia confiar só no exit.)*

### achados sobre o UTEST (não o sprint) durante o mapeamento

Registrados aqui porque foram descobertos usando o `sprint`; o rastreamento vive nas
features (`plans/3-scan/3.5`, `plans/4-report/`).

- **A fase `integration` vazia distorce `coverage: N%`.** `TEST.yaml` declara
  `integration: { include: ['**/*.it.js'] }` e não existe nenhum `.it.js`. `scan('.', …,
  'integration')` devolve `entries: 0` mas `uncovered: 20` (todo `.js` do repo), e o
  cálculo global mistura as fases → `9/(9+20) = 31%`.
- **`--uncovered` / `-u` é inerte.** Lido em `utest.js:231` (`showUnc`), nenhum bloco do
  render consome — só o número `coverage: N%` sai, nunca a lista.
- **`utest.js <alvo-nomeado-inexistente>` roda a suíte inteira e sai 0.**
  `bun utest.js shims.t.js` (inexistente): `rawTarget` fica `undefined`, `narrowScope`
  falso, o run cai em `.` completo, verde, exit 0. Deveria ser erro. É o gatilho do bug do
  `--sweep` acima.
- **Sidecar de cache no diretório errado** (`cache.js:278`). `selfFile()` gravava em
  `.bot/.utest/` (nome legado de quando o utest vivia em `~/bot`), enquanto todo o resto
  usa `.utest/`. Corrigido no sprint 007.

### decisão: `ontology.json` versionado, scan só ao fechar sprint

`.sprint/ontology.json` (~435KB) é gerado por `sprint scan` e lido só por `sprint find`/
`sprint file`/`sprint scan` (o `delta`). `sprint fronts`/`files`/`eval`/`test` não o tocam.
Tanto o soml quanto o próprio sprint-cli o VERSIONAM — então mantivemos versionado aqui
também (`sprint find`/`file` funcionam no clone sem um scan prévio). O custo é 435KB de
churn a cada scan. Mitigação: **`sprint scan` só ao fechar um sprint** (escrita em
`docs/ONTOLOGY.md`). Automatizável — wish #7.

### `[?]` dúvidas em aberto

- Com 31 features 🟡/🟠 e zero `.eval.js`, `sprint eval` lista 31 pendências de roteiro. O
  board fica honesto, mas é muito roteiro à frente. Existe um padrão ZSS para "feature
  retratada de código legado, roteiro sob demanda" que não polua o `sprint eval`? (ex.: um
  `eval_deferred: true` no frontmatter que tira do `sprint eval` sem mentir sobre o degrau.)
