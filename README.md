# utest/

Runner de testes Universal

## Uso

```bash
# Rodar suite específica
bun utest/utest.js utils -v2 --force

# Caminho arquitetural em revisao
bot testio unit -v:2
```

### Positionals e flags

| forma | efeito |
|---|---|
| `utest.js <path>` | escopo (arquivo ou diretório). Um ARQUIVO → sem walk: `findTarget` acha o alvo, `cache.read` o resto. |
| `utest.js <nome-de-fase>` | roda SÓ aquela fase (`unit`, `eval`, `int`, …) — casa um nome declarado no `TEST.yaml`, cacheado. |
| `utest.js <termo>` | **o storage é o índice**: um termo que casa EXATAMENTE um arquivo em `.utest/results.json` (`utest 3.2`, `utest button`) é resolvido para aquele path — acha e roda só ele, SEM escanear o repo. Casou vários → filtro de nome (o scan resolve). |
| **escopo** → **nível padrão** | broad (`.`, raiz, fase) → **v1** (compacto). Uma FRENTE / feature (diretório, ou termo que casa vários) → **v2** (re-executa; linha do erro + endereço no stack por vermelho). Um ARQUIVO só → **v3** (v2 + o `log()` do teste). Um `-v:N` explícito manda. |
| `-v:0..3` | verbosidade. v1 compacto · v2 erros+endereços · v3 +output do teste. Escopo estreito RE-EXECUTA e sobe de nível sozinho (ver acima). Escopo LARGO não fura o cache nem com `-v:3` (regra do `--force` largo abaixo). |
| `--force` \| `-f` | ignora o cache. **Escopo largo está fora do procedimento** (`soml/docs/CRASH-LOG.md`): o pico de spawn da fase `eval`/`int` sob pressão de memória dispara o `systemd-oomd` e mata o editor junto. Use só sobre conteúdo filtrado — um arquivo, um `plans/N/N.F.eval.js`. Exemplo canônico: `utest chromium --force` (a fase `chromium` sobe o browser uma vez só). |
| `--json` | uma linha JSON por arquivo (`{phase,file,feature,state,cached,tests,checks,failCount,fails,ms}`), nada mais no stdout. `fails[]` = `[{line,code}]` dos checks vermelhos (só nos NÃO cacheados — o cache não guarda `checks[]`). Para consumidor de máquina — `sprint eval --sweep` usa isto. Exit 1 se há falha. |
| `--hogs` \| `-h` | só a lista de arquivos >1000ms, cega a passou/falhou |
| `--uncovered` \| `-u` | lista arquivos-alvo sem `.t.js` pareado |
| `--watch` \| `-w` | re-roda ao salvar, em SILÊNCIO (sem barra), RESPEITANDO o cache (sem `--force`). **Delta, não varredura**: se UM arquivo de teste mudou, roda só ele (sem scan); se mudou uma fonte, o run cacheado completo (o scan anda a árvore mas o cache pula quem não mudou). O relatório final aparece de uma vez, no log. |

## O relatório (`-v:1`, o default)

Compacto por desenho, e em **DUAS formas** conforme haja falha ou hog. **O tempo é
SEMPRE `Σ lastMs`** — a soma do tempo da última execução real de cada arquivo da fase (do
storage), nunca o tempo de parede da invocação (num replay de cache é ~0). Mesmo número
quente ou frio: o cache fica invisível.

**Tempo em SEGUNDOS, `🐢` = segundos.** As linhas-título e o rodapé mostram `(Σs 🐢N)` —
Σs = tempo total dos testes; `🐢N` = quantos desses segundos foram em hogs. Um badge de
arquivo é `🐢10` = 10 segundos daquele arquivo. `🐢` NUNCA é uma contagem. MS só aparece
no nível do teste individual (`-v:3`).

**O `kind` não muda o relatório.** Do ponto de vista do runner, `unit`, `eval`, `int` e
`tui` são a MESMA coisa a renderizar — cada fase é uma linha-título `phaseLine` mais, se
há vermelho OU hog, o bloco `compactFails` (vermelhos por inteiro + os 5 hogs mais
lentos). Nenhum ramo do render olha o nome da fase; o provider da `eval` só muda de ONDE
as entries vêm, não COMO aparecem. O drill-in (`-v:3 <arquivo>`) é igual para um
`.eval.js` e um `.t.js`. Era esta a assimetria de origem: um `unit` todo verde com hogs
colapsava na linha-título enquanto a `eval` (com vermelhos) mostrava um bloco.

**Linha viva** (só num TTY): enquanto uma fase roda, uma barra de progresso
`EVAL [████░░░░] plans/5-apps/5.26.eval.js ....  12/77` reescrita a cada arquivo, apagada
no fim da fase. Não vai para arquivo/pipe.

**RODADA LIMPA** (verde E sem hog) → bloco tight, sem moldura:
```
utest results
UNIT (1s) 📄8 🧪105 ✔244
EVAL (44s) 📄77 🧪174 ✔129
coverage: 30%
```
`NOME` + `(Σs)` right-aligned num campo, depois `📄🧪✔`. Sem hog nesta forma (por
definição), então o parén é só `(Ns)`.

**HÁ VERMELHO OU HOG** → relatório emoldurado. Um hog (arquivo verde acima de `HOG_MS`)
pede atenção do mesmo jeito que um vermelho — ganha a moldura e o bloco de detalhe. É o
que torna `unit` (com hogs) e `eval` (com vermelhos) estruturalmente IGUAIS:
```
────────────────────────────────────────────────────────────────────────
utest results
────────────────────────────────────────────────────────────────────────
UNIT .................................... (8s 🐢3) 📄119 🧪1234 ✔3506
  shell.t.js 🐢2  gallery.t.js 🐢1
EVAL ............................... (60s 🐢46) ✘45 📄77 🧪174 ✔129
  3.2.eval.js ✘1 🐢10  4.8.eval.js ✘2 🐢6  4.7.eval.js ✘1  …  2.4.eval.js ✘1
  5.26.eval.js 🐢15  5.31.eval.js 🐢2  6.3.eval.js 🐢2  3.7.eval.js 🐢2  3.3.eval.js 🐢1
────────────────────────────────────────────────────────────────────────
 tip: run  utest 3.2.eval.js  to see failure details     (o vermelho que encabeça o bloco)
────────────────────────────────────────────────────────────────────────
coverage: 24%                          (68s 🐢49) ✘45 📄196 🧪1408 ✔3635
```
- linha-título de fase: `NOME ..... (Σs 🐢N) [✘N 💥N] 📄N 🧪N ✔N` — bloco direito nessa
  ordem, `📄 🧪 ✔` na MESMA COLUNA em toda fase; a linha ocupa a largura CHEIA do terminal
  (dotfill até a borda, zero espaço sobrando). Sem bg color. `(Σs 🐢N)`: Σs = tempo total
  dos testes em SEGUNDOS, `🐢N` = quantos deles em hogs.
- **bloco de detalhe, indentado 2** — o MESMO para todo kind, dois grupos, cada um do mais
  lento para o menos:
  - **vermelhos por inteiro** — `nome ✘M`, SÓ o número de falhas (nunca os `✔`). SEM tempo
    para um arquivo rápido; um hog vermelho ganha o badge: `nome ✘M 🐢10`.
  - **hogs** (arquivo >`HOG_MS`, verde ou não) — `nome 🐢N` (N segundos). Cortados nos
    **5 mais lentos**; o resto vira `+N more 🐢`. Começam em linha nova, não se misturam
    com os `✘`.
- **o tempo é BADGE** — `🐢10` = 10 segundos, nunca `(🐢 10064ms)`. Um arquivo abaixo de
  `HOG_MS` não carrega tempo nenhum (ms de cacheado não diz nada, só custa tokens).
- **`deltaTag` (`+50%`/`-40%`) SÓ num HOG que re-rodou** — 20% num teste de 40ms é ruído de
  GC; 20% num hog de 10s é otimização real, e é ela que a seta recompensa. Um teste rápido
  que re-rodou não ganha `%`.
- **v1 (largo)**: sem `checkView` — a linha compacta e nada mais.
- **v2 (uma frente)**: por baixo de cada vermelho, a linha do check + o `f.js:NN` do stack.
  SEM o `log()` do teste.
- **v3 (um arquivo)**: v2 + o `log()` do teste.
- **`tip:`** — `utest <arquivo>` é um **OSC 8 hyperlink** para o `file://` do teste (no
  terminal do VS Code, clicável, abre o arquivo). Aponta para o MESMO arquivo que encabeça
  o bloco de detalhe: o vermelho mais LENTO. Em v1 largo → `utest <arquivo>` (que aí
  re-executa fundo). Em v2, só se um vermelho tem `log()` engolido → `utest <arquivo> -v:3
  to see full output`. Em v3 não há tip. Rodada hog-only → o hog mais lento (`… to see what
  is slow`).
- linha final: `coverage: N%` à esquerda, o bloco-direito da linha-título à direita.
- `🧪N` é a contagem REAL de nós-folha `test()`, e o storage a guarda — cacheado e vivo
  mostram o mesmo.

O par `received: false` / `expected: true` de um `check(expr, true)` não aparece nem em
`-v:3` (a linha-fonte já diz tudo); um `check(x, 40)` continua mostrando os dois valores.

## `.utest/results.json` — o histórico hierárquico, e por que quente == frio

O cache de tempo (§Regra do Cache) decide se um arquivo re-roda, carregando só a
CONTAGEM de checks nos timestamps de inode. `.utest/results.json` é o OUTRO lado — UM
arquivo por PROJETO (`findProjectRoot` sobe de `root` até o primeiro `.git`/`TEST.yaml`),
hierárquico por fase:

```json
{ "version": 1, "phases": { "unit": { "files": {
  "scl/button.t.js": { "ms": 12, "tests": 40, "checks": 40, "failCount": 0,
    "state": "passed", "mtime": 1788…, "depsNewest": 1788…, "at": 1788… } } } } }
```

`TestCache(root).results` expõe `get(phase, path)` / `record(phase, path, data)` /
`flush()` (um write por FASE, poda linhas de arquivo que sumiu do disco) / `fresh(phase,
path, extraDeps)` / `list(phase?)` (as chaves — o ÍNDICE). Serve a QUATRO coisas:

1. **output IDÊNTICO quente/frio** — o render lê SEMPRE daqui. Cache-hit e live convergem
   no mesmo registro (`{ checkCount, failCount, lastMs, state, tests }`), então as
   contagens, a lista de vermelhos, o badge `🐢N` de cada hog E o `(Σs 🐢N)` da fase são
   byte-idênticos entre uma rodada fria e a seguinte quente. A barra de progresso é a
   única coisa que difere (e é efêmera, não vai para arquivo).
2. **relatório** — `(Σs 🐢N)` da fase (segundos totais + segundos em hogs), o badge de
   cada hog, e a variação de tempo (só em hog que re-rodou).
3. **índice — `utest 3.2` sem scan** — `results.list()` dá `{ phase, relpath, abspath }[]`.
   Um termo que casa exatamente um arquivo é resolvido daqui ANTES de qualquer walk; a
   rodada acha e executa só aquele teste. É o que faz `utest button` / `utest 3.2` serem
   instantâneos no achar.
4. **verificação de 2º nível** — `results.fresh()` responde "o registro ainda bate com o
   disco?" (mesmo `mtime`, deps não mais novas) por um caminho INDEPENDENTE da regra dos
   timestamps. Cache de tempo diz HIT e o storage diz stale para o mesmo arquivo → um dos
   dois tem furo; o runner avisa no stderr, sem corrigir (o cache de tempo é a autoridade).
   Esse aviso é diagnóstico de MANUTENÇÃO do cache, não do teste — só aparece a partir de
   `-v:2`. No `-v:1` default fica calado: uma rodada larga cospe uma linha por vermelho
   cacheado cujo `.md` de feature mudou, e não há ação do lado de quem só quer o placar.

Gitignorado (`.utest/` em ambos os repos). Formato sem `{version:1, phases}` é descartado
— perdê-lo só custa uma rodada fria.

## Direcao Atual

- **Fases explicitas**: `unit`, `eval`, `int`, `tui`. Uma fase é declarada no
  `TEST.yaml` (por `include`/`exclude`) ou por um provider registrado no `boot:`
  (`eval` faz isso). `utest.js <nome-de-fase>` roda uma só. No relatório, cada fase é
  uma linha-título (ver `## O relatório` acima).
- **Workers por arquivo**: a arquitetura alvo executa cada arquivo em processo
  isolado e paralelizavel.
- **Streaming persistente**: resultados devem poder ser renderizados ao vivo e
  reabertos via IO.
- **Cache por tempo**: implementado — ver `## Regra do Cache` abaixo.
- **Falha visivel**: erro de import/load/shim e erro do modulo alvo deve virar
  resultado de teste, nunca sumir em `catch {}`.

O runner atual em `utest/utest.js` ainda e majoritariamente in-process. Isso e
util para compatibilidade e diagnostico, mas nao deve ser confundido com o
modelo final de isolamento.

## Regra do Cache

Implementado em `cache.js`, atras da factory `TestCache(root)` — um closure que
memoiza o grafo de imports e esconde de quem chama qual dos dois protocolos vale
(target pareado ou sidecar). `scanner.js` e o unico consumidor: os runners
recebem o cache pronto de `scan()` e nunca importam `cache.js`.

O cache nao tem banco nem hash: ele vive nos timestamps que todo inode ja tem.
**Seguida a risca, a regra nao tem furo.**

Cada vez que TODOS os testes de um target passam, o ts do target e cravado nos
segundos da sua ultima alteracao, e cada teste sincroniza com esse mesmo
segundo, com os milissegundos indicando o numero de checks que passaram:

```
ALVO    pixel.js              1788299588000     ms = 0    -> conjunto verde
  TESTE pixel.t.js            1788299588147     ms = 147 checks
  TESTE pixel.classes.t.js    1788299588010     ms = 10 checks
  TESTE pixel._resolveSize.t.js 1788299588008   ms = 8 checks
```

Um conjunto e **valido** quando todos os participantes compartilham o mesmo ts
arredondado para segundos **e** o target esta cravado nos segundos. Qualquer
arquivo tocado pelo mundo — editor, checkout, build — sai do segundo comum e
derruba o conjunto, que e exatamente o desejado.

Os milissegundos moram no TESTE, e nao no target, e e isso que deixa N testes
dividirem um target so: cada um guarda a propria contagem, os tres concordando
no mesmo segundo.

**Falha marca o TARGET com 1ms.** Se algum teste nao passa, o target vai para
`ms = 1` e o conjunto inteiro deixa de valer — inclusive os irmaos que
passaram. Nenhum teste daquele target e pulado enquanto a falha estiver de pe.

**`cacheFailure` — a falha REPRODUZIVEL que nao re-roda.** Um `.t.js` vermelho e
barato de re-rodar, e o stack fresco vale mais que o segundo economizado — entao
a falha so busta. Mas um passo de eval que gasta 10s subindo um Chromium so para
reconfirmar o mesmo vermelho e desperdicio puro. Quem chama `write` com
`{ cacheFailure: true }` (hoje so a fase `eval`, e so quando a feature nao tem
passo `real`/`linear` — os que rodam contra o projeto vivo, `.sprint/TEST-EVAL.md`
item 4) grava o resultado vermelho num sidecar carimbado com `segundo+1ms` do
alvo. `read` so o reusa enquanto esse carimbo bater E as deps (incluindo
`extraDeps`) nao tiverem mexido — um alvo reeditado sai desse segundo e o sidecar
deixa de casar sozinho. Passar limpa o sidecar (`rmSelf`). O resultado: uma fase
`eval` inteira, vermelhos incluidos, cai de dezenas de segundos para um `stat`
por arquivo quando nada mudou — e quente e frio dao o MESMO placar (o criterio de
aceite), porque a contagem `✔N ✘M` viaja junto no sidecar.

### Os dois detalhes que fazem a regra fechar

**ms inteiro separa carimbo de edicao.** O filesystem grava mtime com precisao
de nanossegundo, entao um arquivo ESCRITO cai em ms fracionario
(`...588601.1472`), enquanto `utimesSync` grava o inteiro exato pedido. Sem essa
checagem, um teste editado dentro do mesmo segundo do target passaria por
cacheado e devolveria uma contagem que nunca rodou.

**Deps medem contra o `atime`.** O teste guarda em `atime` o instante real da
gravacao, em precisao cheia. O segundo cravado tem resolucao de 1s, e uma dep
tocada logo depois da gravacao cairia dentro dele — invisivel. `deps()` segue
os imports (inclusive `import './x.js'` de efeito colateral) recursivamente
dentro do repo, e basta uma dep mais nova que o `atime` para re-rodar.

**Raizes extras, para o alvo cujas deps nao sao `import`.** `read`/`write`
aceitam `{ extraDeps }` — pontos de partida ADICIONAIS do walk. E o caso da fase
`eval`: um `.eval.js` pareia com o `N.F-*.md` da feature (`scanner.js#findTarget`
estende a regra do `.t.js` para `.eval.js`), o `.md` nao importa nada, e o
`files:` do frontmatter e o grafo real. `utest.js#runPhase` passa esse `files:`
como `extraDeps`; o crava do `.md` continua sendo o "segundo comum" do protocolo
pareado (o `.md` nao e compartilhado com `.t.js` nenhum, entao crava-lo nao
contamina outro conjunto). O grafo estatico do proprio roteiro continua valendo —
`extraDeps` so o amplia.

A contagem satura em 999, o teto do campo: acima disso o cache reporta menos do
que rodou. E o preco de caber no mtime, e o furo que sobra so encolhe um numero
exibido — nunca pinta de verde o que falhou.

### Por que isso importa

Um cache que serve verde sobre codigo quebrado e pior que nao ter cache. Duas
falhas reais que a regra anterior (bucket de MINUTO, sem deps) deixou passar:

- uma edicao no mesmo minuto era invisivel, e o teste era pulado como verde;
- um `export` removido em `scl/theme-params.js`, dois saltos alem do target
  pareado, nao invalidava nada — o crash so aparecia com `--force`.

**Cache quente e cache frio devem reportar o MESMO numero.** Se divergirem, o
cache esta mentindo. Hoje: 3276 nos dois.

## Estender: rodar outro tipo de arquivo

O vocabulario de sufixos (`.t.js`, `.test.js`, `.tuit`, `.it.js`) vive em
`kinds.js`, declarado uma vez. `register()` abre um tipo novo nas DUAS pontas ao
mesmo tempo — o matcher que decide o que entra na suite, e o `filter` do plugin
do Bun que injeta o shim:

```js
import { register } from './kinds.js'
register('eval')     // .eval.js passa a ser reconhecido
```

Abrir so uma das pontas e a falha silenciosa que motivou o modulo: um arquivo
colhido pelo scanner mas ignorado pelo loader roda sem shim, e um reconhecido so
pelo loader nunca entra na suite. Nenhum dos dois da erro.

O caso concreto que isso destrava — `sprint eval --sweep` reusando este cache
para rodar `.eval.js` em ms em vez de minutos — esta documentado em
`.sprint/TEST-EVAL.md`, no soml.

## Componentes

| Arquivo | Função |
|---------|--------|
| `utest.js` | CLI atual de compatibilidade, ainda in-process |
| `runner.js` | Execucao modular legada/experimental |
| `worker.js` | Base para execucao isolada por arquivo |
| `scanner.js` | Descoberta de arquivos de teste (e dona do cache) |
| `cache.js` | `TestCache(root)` — a regra do cache de tempo, o grafo de deps, e `results` (o histórico hierárquico `.utest/results.json` + o cross-check `fresh()`) |
| `probe.js` | `probe(fn\|obj\|Map)` — instrumenta chamadas para achar hogs: conta, mede self-time (chamada aninhada nao conta duas vezes). DUAS vistas: `probe.report()` é a FLAT (uma linha por função, todos os callers somados — "quem custa"); `probe.tree()` / `probe.callers(name)` / `probe.edges()` é a de GRAFO (mantém a identidade do caller — "de ONDE, e quanto pesa cada contexto"). Complementa `spyOn` (que e para ASSERTAR sobre chamada, nao medir) |
| `kinds.js` | Que sufixos o runner reconhece, e o `register()` que abre novos |
| `viewer.js` | render do relatório: `phaseLine`/`phaseHogSecs` (linha-título `(Σs 🐢N)`, ordem `✘ 📄 🧪 ✔`), `progressBar` (barra viva), `compactFails` (vermelhos + 5 hogs numa linha, badge `🐢N`=segundos), `deltaTag` (só em hog que re-rodou), `checkView`/`fullView` |
| `check.js` | Assertions e visual diffing |
| `index.js` | Entry point / exports |
| `setup.js` | Setup do ambiente de teste |
| `shims.js` / `shimmer.js` | Shims para compatibilidade |
| `paths.js` | Resolução de paths |
| `migrate.js` | Migração de formato de testes |

## Documentação Interna

| Arquivo | Conteúdo |
|---------|----------|
| `HANDOFF.md` | Handoff da sessão 3 (parallelização e streaming) |
| `TEST-MASTER-PLAN.md` / `TEST-MASTER-PLAN-2.md` | Planos de evolução do runner |
| `TEST-SPEC.md` / `TEST-SPEC-1.md` | Especificações de comportamento |
| `TEST-PROBLEMS-I-FOUND.md` | Achados recentes e limites da migracao |
| `TEST.yaml` | Configuração de testes |

## Ver também

- `lib/test-runner.js` — runner principal (usado por `bot test`)
- `cmds/testio/testio.js` — destino arquitetural do runner
- `lib/adapters/io-engine.js` — IO log/cache/result projection
- `tests/` — testes de integração E2E
