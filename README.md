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
| `utest.js <path>` | escopo do walk (arquivo ou diretório) |
| `utest.js <nome-de-fase>` | roda SÓ aquela fase (`unit`, `eval`, `int`, …) — casa um nome declarado no `TEST.yaml`, cacheado. Um positional que não casa fase é filtro de nome. |
| `utest.js <termo>` | filtro de nome de arquivo; ativa live-run (fura o cache) nos que casam |
| `-v:0..3` | verbosidade. **`-v:3` == `--force`**: "a saída completa de uma execução". Em escopo estreito (um path, um termo, uma fase) `-v:3` **liga o `force` sozinho** — drill-in de um vermelho cacheado é só `utest.js <arquivo> -v:3`. Sem alvo, `-v:3` NÃO força a suíte (avisa e roda sobre o cache — a regra do `--force` largo abaixo). |
| `--force` \| `-f` | ignora o cache. **Escopo largo está fora do procedimento** (`soml/docs/CRASH-LOG.md`): o pico de spawn da fase `eval`/`int` sob pressão de memória dispara o `systemd-oomd` e mata o editor junto. Use só sobre conteúdo filtrado — um arquivo, um `plans/N/N.F.eval.js`. Exemplo canônico: `utest chromium --force` (a fase `chromium` sobe o browser uma vez só). |
| `--json` | uma linha JSON por arquivo (`{phase,file,feature,state,cached,tests,checks,failCount,fails,ms}`), nada mais no stdout. `fails[]` = `[{line,code}]` dos checks vermelhos (só nos NÃO cacheados — o cache não guarda `checks[]`). Para consumidor de máquina — `sprint eval --sweep` usa isto. Exit 1 se há falha. |
| `--hogs` \| `-h` | só a lista de arquivos >1000ms, cega a passou/falhou |
| `--uncovered` \| `-u` | lista arquivos-alvo sem `.t.js` pareado |
| `--watch` \| `-w` | re-roda ao salvar |

## O relatório (`-v:1`, o default)

Compacto por desenho, e em **DUAS formas** conforme haja falha. **O tempo mostrado é
SEMPRE `Σ lastMs`** — a soma do tempo da última execução real de cada arquivo da fase
(do storage), nunca o tempo de parede da invocação (que num replay de cache é ~0). Assim
o número é o mesmo quente ou frio: o cache fica invisível.

**Linha viva** (só num TTY): enquanto uma fase roda, uma barra de progresso
`EVAL [████░░░░] plans/5-apps/5.26.eval.js ....  12/77` reescrita a cada arquivo, apagada
no fim da fase. Não vai para arquivo/pipe.

**TUDO VERDE** → bloco tight, sem moldura:
```
utest results
UNIT     (781ms) 📄8 🧪105 ✔244
EVAL (🐢 8 43823ms) 📄77 🧪174 ✔129
coverage: 30%
```
`NOME` + `(Σms)` right-aligned num campo (`(🐢 n Σms)` se a fase tem hog), depois `📄🧪✔`.

**HÁ VERMELHO** → relatório emoldurado:
```
────────────────────────────────────────────────────────────────────────
utest results
────────────────────────────────────────────────────────────────────────
UNIT ................................. (43909ms) 🐢8 📄119 🧪1227 ✔3474
  viewer.t.js ✘1 (130ms) +100%
EVAL ....................................... (0ms) ✘45 📄77 🧪117 ✔127
  1.3.eval.js ✘2 (🐢 1429ms)  1.7.eval.js ✘1  2.3.eval.js ✘2  …
────────────────────────────────────────────────────────────────────────
 tip: run  utest 1.3.eval.js  to see failure details
────────────────────────────────────────────────────────────────────────
coverage: 24%                          (43943ms) ✘45 📄196 🧪1344 ✔3602
```
- linha-título de fase: `NOME ..... (Σms) [✘N 💥N 🐢N] 📄N 🧪N ✔N` — bloco direito nessa
  ordem, `📄 🧪 ✔` na MESMA COLUNA em toda fase; a linha ocupa a largura CHEIA do terminal
  (dotfill até a borda, zero espaço sobrando). Sem bg color.
- saída da fase **indentada 2** (efeito `console.group`).
- vermelhos: `nome ✘M (Nms)` — SÓ o número de falhas, nunca os `✔`; SEMPRE `(Nms)` da
  última execução (`(🐢 Nms)` se hog); `deltaTag` (`+50%`) só quando re-rodou. Soft-wrap.
- **nenhum `checkView` em `-v:1`/`-v:2`** — o detalhe é `-v:3 <arquivo>`, que re-executa.
- **`tip:`** — `utest <arquivo>` é um **OSC 8 hyperlink** para o `file://` do teste. No
  terminal do VS Code é clicável e abre o arquivo; onde o terminal não suporta, o escape
  some e fica só o texto.
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
`flush()` (um write por FASE) / `fresh(phase, path, extraDeps)`. Serve a três coisas:

1. **output IDÊNTICO quente/frio** — o render lê SEMPRE daqui. Cache-hit e live convergem
   no mesmo registro (`{ checkCount, failCount, lastMs, state, tests }`), então as
   contagens, a lista de vermelhos, o `(Nms)` de cada um E o `Σ lastMs` da fase são
   byte-idênticos entre uma rodada fria e a seguinte quente. A barra de progresso é a
   única coisa que difere (e é efêmera, não vai para arquivo).
2. **relatório** — `Σ lastMs` da fase, `(Nms)` de cada vermelho, e a variação de tempo.
3. **verificação de 2º nível** — `results.fresh()` responde "o registro ainda bate com o
   disco?" (mesmo `mtime`, deps não mais novas) por um caminho INDEPENDENTE da regra dos
   timestamps. Cache de tempo diz HIT e o storage diz stale para o mesmo arquivo → um dos
   dois tem furo; o runner avisa no stderr, sem corrigir (o cache de tempo é a autoridade).

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
| `viewer.js` | render do relatório: `phaseLine` (linha-título, ordem `✘ 📄 🧪 ✔`, `ms` fixo), `progressBar` (barra viva), `compactFails` (vermelhos numa linha, `(🐢 Nms)`), `deltaTag` (variação de tempo), `checkView`/`fullView` |
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
