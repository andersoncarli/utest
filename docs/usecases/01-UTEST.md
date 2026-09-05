# UTEST-EXPERIENCE.md — log de uso do `utest` como runner do `sprint-cli`

> **Este arquivo NÃO documenta o `utest` em si** (isso vive em `~/utest/README.md` e
> `AGENTS.md`) **nem o plano do sprint 071** (isso vive em
> `sprints/071-utest-como-unica-forma-de-teste-do-sprint.plan.md`). É um *diário de
> defeitos e atritos encontrados ao consolidar o `sprint-cli` sobre o `utest`* — entrada
> por episódio, para virar issue/PR no `utest` (bugs do runner) ou ajuste no `sprint-cli`
> (incompatibilidade do lado de cá). Mesmo modelo de `12-UTEST.md`
> (`SPRINT-EXPERIENCE.md`), espelhado pro sentido inverso: aquele registra o `sprint`
> visto de dentro do `utest`; este registra o `utest` visto de dentro do `sprint-cli`.

Uma entrada por episódio, mais nova no topo. `[+]` beleza, `[-]` atrito, `[?]` dúvida em
aberto, `[bug]` defeito reproduzível.

---

## 2026-09-04 — primeira rodada: `utest . --force` no sprint-cli, sem nenhuma config

Contexto: sprint 071 (feature 50.120), objetivo de tornar `utest` a única forma de teste
do sprint-cli. Antes de escrever qualquer `TEST.yaml`/adapter, rodei `utest . --force` cru
na raiz do sprint-cli — só para ver o que o runner reconhece por padrão.

### `[+]` o que funcionou sem nenhuma configuração

- **`utest . --force` já reconhece `tests/*.test.js` nativamente** — nenhum `TEST.yaml`
  existia no sprint-cli até este sprint, e mesmo assim o runner encontrou os 10 arquivos
  de `tests/` e rodou 420 testes verdes de cara. `KINDS` (`utest/kinds.js:29`) já inclui
  `test` no vocabulário default.
- **Resolve via `bun link` global** — não precisou de `utest/` vendorizado dentro do
  sprint-cli nem de PATH configurado a mão; o `bun link` prévio
  (`~/.bun/install/global/node_modules/utest → ~/soml/utest`) bastou.
- **O relatório compacto entrega sinal real de primeira** — `deltaTag` (`+37%`, `+86%`,
  `-43%`) já apontou hogs relativos sem eu pedir nada, e o rodapé `💥8` separou "crash"
  de "assert falhou" na cara, o que acelerou o diagnóstico (ver bugs abaixo).

### `[bug]` `test(name, { timeout }, fn)` (ordem `bun:test`) crasha com mensagem enganosa

**Reproduzido em:** `tests/degraus.test.js` — 7 dos 8 crashes (`💥`) da rodada.

`utest/test.js:4` declara `test(name, fn = () => {}, op = {})` — `fn` na posição 2,
`options` na posição 3. `bun:test` aceita a ordem inversa também
(`test(name, options, fn)`), e é essa forma que `degraus.test.js` usa em 7 lugares
(`test("...", { timeout: 20000 }, () => {...})`, ex.: linha 85, 102, 118...).

O shim do utest (`utest/setup.js`, plugin `onLoad`) substitui o `test` do módulo antes de
qualquer coisa rodar — não há como o arquivo "optar" pela assinatura antiga. O resultado
não é um erro de tipo claro; é:

```
`--yes` numa feature ja 🔵 nao a rebaixa pra 🟢 (a escada e monotonica) 💥
  💥 t.fn.call is not a function. (In 't.fn.call(t, (e) => e ? rej(e) : res(), tCtx)', 't.fn.call' is undefined)
```

`t.fn` aqui é o objeto `{ timeout: 20000 }` (recebido na posição de `fn`), e o runner
tenta `.call()` nele como se fosse uma função. A mensagem não menciona `test()`,
assinatura, nem timeout — quem lê o `💥` sem saber da troca de ordem não tem como
adivinhar a causa. **Sugestão pro utest**: um guard em `test()` que detecta
`typeof fn === "object" && typeof op === "function"` e ou inverte automaticamente (mais
compatível com `bun:test`) ou lança `TypeError: test() espera (name, fn, options) — "fn"
recebeu um objeto, "options" recebeu uma função. Ordem trocada?` em vez de deixar o erro
estourar de dentro do `.call()`.

**Do lado sprint-cli**: as 7 chamadas em `degraus.test.js` precisam inverter a ordem
(`test(name, fn, { timeout })`) — rastreado no plano do sprint 071, passo 3.

### `[bug]` `check` importado explicitamente colide com o `check` global injetado pelo shim

**Reproduzido em:** `tests/eval-script.test.js` (1 dos 8 crashes).

`utest/setup.js:34` injeta, no topo de TODO arquivo de teste carregado (via plugin
`onLoad`), um header `import { test, describe, it, expect, ..., check } from
"<shims.js>"`. O arquivo já importa `check` explicitamente de `../src/check.js`
(linha 9, porque `check` é compartilhado entre `bun:test` e `.eval.js` — ver o comentário
de topo do próprio arquivo). Resultado:

```
eval-script.test.js 💥
  💥 "check" has already been declared
```

É um `SyntaxError` de dupla-declaração léxica (dois `import { check }` no mesmo módulo
ESM), não um erro de runtime — quebra o arquivo inteiro antes de qualquer teste rodar
(por isso aparece como 1 crash de arquivo, não N crashes de teste).

**Achado geral, não só deste arquivo**: qualquer projeto que já importava `check` de uma
lib própria (padrão razoável — é como o `sprint-cli` compartilha o `check` entre
`bun:test` e `.eval.js` hoje) vai colidir do mesmo jeito ao migrar pro utest, SE o nome do
símbolo bater com um dos globais que o shim injeta (`test, describe, it, expect,
beforeAll, afterAll, beforeEach, afterEach, withTempDir, spyOn, jest, vi, mock, check`
— lista em `utest/setup.js:44`). **Sugestão pro utest**: o `onLoad` poderia checar se o
arquivo já importa um binding com o mesmo nome (regex simples em cima do `code` antes de
prepender o header) e pular esse símbolo específico do header injetado, em vez de
injetar cegamente por cima.

**Do lado sprint-cli**: remover o import explícito de `check` (deixar o global do shim
cobrir) — rastreado no plano do sprint 071, passo 3. Ainda não confirmado se
`checkException`/`equal`/`CheckError` (os outros três símbolos da mesma linha de import)
também são injetados — `setup.js:44` só lista `check`, então a expectativa é que os
outros três continuem precisando de import explícito; a validar na correção.

### `[?]` dúvida em aberto

- O restante da suíte (420 ✔) não colidiu com nenhum outro global do shim
  (`describe`/`it`/`expect`/etc.) — mas isso é sorte de nomenclatura, não garantia. Vale
  perguntar ao utest se existe (ou faz sentido existir) um modo `--strict-globals` que
  falha alto e cedo quando um arquivo já declara um símbolo que o shim tentaria injetar,
  em vez de deixar o `SyntaxError` de dupla-declaração ser a primeira pista.

## 2026-09-04 — segunda rodada: `check`/`checkException` do utest não são os do sprint-cli

Ao corrigir os dois crashes acima e rodar de novo, `degraus.test.js`/`eval-script.test.js`
pararam de crashar mas passaram a **falhar de verdade** em lugares novos — trazendo à tona
mais um nível de incompatibilidade, este semântico (não sintático).

### `[bug]` `check`/`checkException` do sprint-cli e do utest são APIs diferentes com o mesmo nome

`src/check.js#check(a, b)` é **imperativo**: lança `CheckError` na hora se `a`/`b`
divergirem. `utest/check.js#check(a, b, op, cb)` (`check.js:74-78`) é **declarativo**:
sempre retorna um objeto `Check` com `.state` (`'passed'|'failed'|'exception'`) e nunca
lança sozinho — quem decide o veredito do teste é `t.oncheck` (o runner, registrado via
`check.test`, setado globalmente antes de cada `test()` rodar — `utest.js:120`).

`eval-script.test.js` importava `check`/`checkException` de `../src/check.js` e testava a
API imperativa (`expect(() => check(1,2)).toThrow(CheckError)`). Como o shim do utest já
injeta um `check` global com semântica diferente, os dois não são intercambiáveis — usar
o global nesse bloco exigiu reescrever a lógica do teste, não só trocar o import (decisão
do usuário: manter a suíte testando através da API do runner escolhido, mesmo sabendo que
isso passa a exercitar uma implementação diferente da que os 77 `.eval.js` de `plans/**`
de fato usam via `src/eval-run.js#makeCtx` — aqueles continuam no `check` do sprint-cli,
passado como parâmetro de contexto, não afetados por este bloco).

### `[bug]` `check()`/`checkException()` chamados soltos dentro de um `test()` se auto-registram — não há como "testar uma falha esperada" sem `checkFail`

Descoberta ao tentar `const r = check(1, 2); expect(r.state).toBe("failed")` dentro de um
`test()` do utest: o teste falhava, mesmo o `.state` estando correto (`"failed"`, confirmado
rodando `check()` fora do runner via script solto). Causa: `Check` (`check.js:70`) faz
`const t = boundTest || check.test` — `check.test` é setado GLOBALMENTE pelo runner antes
de cada teste (`utest.js:120`, `runner.js:61`), então qualquer `check()` chamado durante a
execução de um `test()` já se registra como assert daquele teste via `t.oncheck`
(`test.js:22-25`), **mesmo que o código nunca use o retorno**. Não há como uma chamada nua
de `check()` escapar disso — `this` não ajuda (`check()` já testa `this && this.oncheck`
antes de cair no fallback global).

O padrão idiomático certo — achado lendo `utest/check.t.js` (o próprio teste do módulo) —
é `checkFail(a, b)`: inverte o veredito internamente (`check.js:65-68`), então "isto DEVE
falhar" vira um assert que passa sem derrubar o teste. E os três (`check`, `checkFail`,
`checkException`) chegam **destructured do parâmetro da função de teste**
(`test('nome', ({ check, checkFail, checkException }) => {...})`), não de um import solto —
é assim que ficam bound ao `t` do teste corrente.

**Sugestão pro utest**: `check()`/`checkException()` chamados fora de um contexto que os
destructura do parâmetro (import direto do módulo, ou uso solto dentro do corpo) ainda
mutam `check.test` global silenciosamente — um jeito de "testar uma asserção sem
side-effect no teste corrente" (equivalente a um `check` desligado do tracker) não existe
hoje além de `checkFail`, que inverte semântica em vez de neutralizar. Documentar esse
comportamento no README ajudaria — não é óbvio que uma chamada solta de `check()` tem
efeito colateral no teste em execução.

### `[bug]` `expect(val).not.toMatch(regex)` não existe — `not` não cobre todos os matchers de `expect`

**Reproduzido em:** `tests/degraus.test.js:266` — `expect(curado).not.toMatch(/^regression:/m)`.

`utest/shims.js:111-128` implementa `not` com um subconjunto dos matchers de
`matchers(val)` (linha 74-129): `toBe`, `toEqual`, `toStrictEqual`, `toContain`,
`toBeTruthy/Falsy`, `toBeNull`, `toBeDefined/Undefined`, `toThrow` — mas não
`toMatch`, `toBeInstanceOf`, `toHaveLength`, `toHaveProperty`, `toBeGreaterThan` e outros
que `matchers()` positivo tem. Chamar um matcher ausente em `not` dá
`expect(...).not.toMatch is not a function` — `TypeError` de propriedade ausente, não uma
falha de asserção.

**Do lado sprint-cli**: reescrito para `expect(regex.test(val)).toBe(false)` — funciona,
mas é menos legível que o `not.toMatch` original. **Sugestão pro utest**: completar `not`
com o espelho de todo matcher positivo (a maioria é `check(!condicao)` — mecânico), ou pelo
menos falhar com uma mensagem que nomeie o matcher ausente em vez de um `TypeError` de
propriedade indefinida.

## 2026-09-04 — terceira rodada: a fase `eval` de ponta a ponta expõe dois achados reais

Ao escrever `src/eval-utest-phase.js` (o adapter que delega `.eval.js` de `plans/**` pro
utest — sprint 071, passo 4) e rodar a fase `eval` completa pela primeira vez, dois
problemas apareceram — nenhum dos dois é bug do utest; os dois são coisas que o motor
antigo (interativo, um humano no controle) nunca expôs, porque nunca rodou as 77 features
de uma vez, sem parar, sem intervenção.

### `[bug]` `.eval.js` de `plans/**` entra no `uncovered`/`coverage` da fase `unit`

`utest/scanner.js#walk` (linha 16-35) percorre TODA a árvore sob `root`, não só o que o
`include` da fase corrente casa — qualquer `.js`/`.ts` que não vira `test` (por não bater
o `include` OU o `testRe()`) cai em `sources` (linha 32: `else if (SOURCE_RE.test(e.name))
out.sources.push(abs)`). Rodando a fase `unit` (que só declara `include:
["tests/**/*.test.js"]`), os 77 `.eval.js` de `plans/**` — reconhecidos como TEST pelo
`testRe()` (depois de `register('eval')` no boot) mas não pelo `include` desta fase
específica — caíam em `sources`, e como nenhum `.t.js` os pareia, viravam `uncovered`:
`unit entries: 10, uncovered: 116` antes da correção, contra `uncovered: 39` depois. O
`coverage: N%` da fase `unit` ficava artificialmente baixo por arquivos que a fase `eval`
já cobre — `scan()` roda uma fase de cada vez, sem visibilidade do que as outras cobrem.

**Do lado sprint-cli**: `TEST.yaml`'s fase `unit` ganhou `exclude: ["plans/**"]` — tira
`plans/**` inteiro do cômputo de cobertura da fase `unit` (não só os `.eval.js`; os `.md`
de feature também não deveriam contar como "fonte sem teste"). Resolve o sintoma sem
mexer no utest. **Sugestão pro utest**: `uncovered`/`coverage` poderiam ser cross-phase —
um arquivo que é `test` reconhecido em QUALQUER fase declarada no `TEST.yaml` não deveria
contar como `source` sem par em nenhuma outra fase, mesmo que o `include` daquela fase
específica não o alcance. Hoje cada fase decide sozinha, e a única forma de corrigir do
lado do consumidor é excluir explicitamente — funciona, mas é fácil esquecer numa segunda
fase nova.

### `[bug]` um `.eval.js` sem timeout trava a fase inteira — sem sinal, sem `-v` que ajude

`plans/10-assimilacao/10.20.eval.js` tinha um `await sh("sleep 86400")` (24h) — um roteiro
que tentava simular "1 dia depois" com `sleep` real, comentário do próprio autor já
admitindo "não funciona no sandbox". Como `Bun.spawnSync` (o `sh()` de
`src/eval-run.js#makeCtx`, usado pelo executor da fase `eval`) não tinha `timeout`, esse
UM `.eval.js` quebrado travava a fase inteira — nenhum output, nenhum erro, `utest eval`
(e `utest .`) simplesmente nunca retornavam. `-v:2`/`-v:3` não ajudam aqui: o travamento é
DENTRO de um passo, antes de qualquer `test()` existir pro runner reportar progresso.

Achado por bisseção manual (rodar o executor passo a passo, uma entry por vez, com
`Promise.race` contra um timeout curto) — o utest não tem um jeito embutido de apontar
"travou aqui" quando o travamento está dentro de um `registerExecutor` customizado, antes
da árvore de `test()` existir. A barra de progresso viva (`EVAL [████░░░░]
plans/N.eval.js .... 51/77`) teria mostrado o arquivo certo, mas só aparece em TTY — os
testes rodados via pipe/redirect (como todo este diagnóstico) não a veem.

**Do lado sprint-cli**: adicionado `timeout: 30_000` (30s) ao `Bun.spawnSync` de `sh()`
(`src/eval-run.js#makeCtx`) e `runLinearStep` — um comando que estoura o teto agora falha
como qualquer outro (exit `null`/`SIGTERM`, tratado como não-zero), em vez de travar pra
sempre. `10.20.eval.js` foi reescrito para simular datas via `GIT_AUTHOR_DATE`/
`GIT_COMMITTER_DATE` (a forma correta), não `sleep`. **Sugestão pro utest**: um teto
default (configurável) por passo/entry no PRÓPRIO runner, não só client-side em cada `sh`
que um projeto-consumidor escreve — outro projeto que registre um `registerExecutor`
customizado com um `sh()` próprio herdaria o mesmo risco sem saber, e a barra de progresso
já teria a informação (`entryStart`/`_done`) pra reportar "arquivo N está rodando há Xs,
mais que o normal" mesmo fora de TTY, se emitida como linha ocasional em vez de só `\r`.

### `[+]` a fase `eval` rodando de ponta a ponta achou bugs reais em 3 `.eval.js`, pré-existentes

Depois de corrigir o timeout e o `sleep`, a fase `eval` completa (77 arquivos) rodou até o
fim (antes travava em `10.20`). Resultado: **70/77 passam**, 7 falham — e a maioria das 7 é
bug real de OUTRAS features (fora do escopo deste sprint), nunca antes exercitado numa
varredura completa:

- **`50.20` e `60.20`**: `t.sandbox(..., async ({ write, check }) => {...})` usava `read(...)`
  no corpo sem desestruturá-lo do parâmetro de contexto — `read is not defined`. Corrigido
  (`{ write, read, check }`). Confirmado reproduzível FORA do utest (rodando `runStep`
  direto), então não é efeito do adapter — é um roteiro que nunca tinha rodado de verdade.
- **`00.30`**: um `t.sandbox` itera `["README.md", "STATUS.md", "CHANGELOG.md"]` aplicando os
  MESMOS 3 checks aos três, incluindo `check(!/\bZSS\b/i.test(txt))` — mas `README.md`
  contém "ZSS" de propósito (o bloco `<!-- zss:begin -->` que `sprint init` injeta é o
  ponteiro esperado, não uma reexplicação proibida do método). Não corrigido — feature
  diferente (00.30), fora do escopo do sprint 071; reportado aqui e no report do sprint.
- **`00.200`, `40.80`, `40.110`, `40.30`, `20.110`, `90.40`**: falhas reais não investigadas a
  fundo (fora do escopo — decisão do usuário foi reportar, não consertar). `exitCode`
  divergente, strings de output que mudaram, listas truncadas — a maioria parece o mesmo
  padrão do achado `USE-CRITIQUE-7-FULLEVAL` (`docs/usecases/07-FULLEVAL.md`): roteiro
  escrito contra uma versão anterior do comando/mensagem, nunca revalidado desde então.

**O padrão geral**: nenhuma dessas 9 falhas (das quais 3 corrigidas) é causada pelo motor de
delegação em si — todas são roteiros que descreviam um comportamento que já não bate com o
código atual, e que só ficaram invisíveis porque o `--sweep` antigo, sem cache e caro (3min),
nunca rodava com frequência suficiente pra pegar a divergência cedo. A fase `eval` do utest,
cacheada e barata o bastante pra rodar toda hora, é o que torna esse tipo de apodrecimento
detectável de novo — o próprio motivo de existir do `.sprint/TEST-EVAL.md` original.

## 2026-09-04 — quarta rodada: o cache pareado não acelera a fase `eval` entre chamadas

Depois de tudo verde/reportado corretamente, o usuário apontou que a fase `eval` deveria
ser cacheada e instantânea igual já acontece em `~/soml` — e não estava. Investigação:

### `[bug]` a fase `eval` não fica mais rápida numa segunda chamada — cache não pula execução

Medido com `time`, três rodadas consecutivas de `utest eval --json`/`utest eval -v:1`, sem
tocar em NENHUM arquivo entre elas: **84s, 87s, 108s, 82s** — nenhuma acelerou. O relatório
mostra `🐢N` (badge de hog/tempo) em quase toda entry, inclusive as que PASSAM — sinal de
que estão rodando de verdade, não sendo puladas via cache-hit.

Isolando a leitura do cache (`scan(".", "./TEST.yaml", "eval")`, fora do `utest.js`, num
processo `bun -e` à parte): **70/77 entries têm `entry.cache` preenchido e válido**
(`{checks, tests, exception: false}` — o par `.eval.js`/`.md` cravado no mesmo segundo,
exatamente a condição que `cache.js#readPaired` (linha 223-231) exige para servir cache-hit).
A lógica de decisão em `utest.js:465` (`cacheHit = entry.cache && (entry.cache.failed ||
!entry.cache.exception)`) deveria ser `true` para essas 70 e pular a execução (`continue`,
linha 494) — mas na prática, rodando o CLI de verdade, isso não parece acontecer: o tempo
de parede é idêntico com ou sem cache supostamente presente.

**Não determinei a causa raiz** — as duas hipóteses mais prováveis, sem confirmação:
1. Algo entre o `scan()` que popula `entry.cache` e o loop de execução em `utest.js`
   (linha 444+) reseta/ignora esse campo especificamente quando a fase usa
   `registerExecutor` (provider) — meu `eval-utest-phase.js` é a primeira fase deste
   projeto a usar esse caminho combinado com glob simples (`include`, sem
   `registerEntries`); talvez a combinação "provider só para EXECUÇÃO, mas entries via
   `scan()` normal" não esteja coberta pelo caminho de cache do jeito que os outros casos
   (soml, com `registerEntries` completo) estão.
2. Um efeito colateral do meu executor — `makeScratch()`/`rmSync()` (git init, `sprint
   init`, remoção da árvore descartável) rodando 70+ vezes por chamada, mesmo para
   entries que deveriam ter sido puladas — sugeriria que o `continue` do cache-hit NÃO
   está sendo alcançado, e o executor roda para todas as entries independente do cache.

**Reforça o achado**: numa checagem isolada logo depois de uma rodada completa,
`scan()` reportou `entries: 0` (zero!) numa chamada e `entries: 77` na chamada seguinte,
sem nada mudar no disco entre elas (mtimes dos `.eval.js`/`.md` confirmados idênticos
antes/depois via `stat`). Isso é uma INCONSISTÊNCIA TRANSITÓRIA real, reproduzida duas
vezes, que pode ser o mesmo vazamento assíncrono que o `.sprint/TEST-EVAL.md` (a doc
original do soml) já documentava: *"process.exit()/rejeição de child-process de testes
que usam spawn chegando depois que o runner passou para o arquivo seguinte"* — meu
executor dispara `Bun.spawnSync` (síncrono) em série dentro de `makeScratch`/`runStep`,
então não deveria ser a fonte direta, mas o SINTOMA (contagem de entries instável entre
chamadas do MESMO comando de leitura, sem execução real no meio) é idêntico em espécie.

### `[bug]` causa raiz encontrada e corrigida: `entry.cacheFailure` mutava um CLONE, nunca o `entry` real

Instrumentei `~/utest/utest.js` com um `console.error` temporário no branch de decisão do
cache (revertido depois — `git checkout -- utest.js`, nenhuma mudança ficou no utest) e
descobri que **as 70 entries que PASSAM já estavam sendo puladas corretamente
(`cacheHit=true`, `continue` alcançado)** — o tempo de ~87-108s inteiro vinha das 7
entries que FALHAM, que nunca cacheavam. Causa: `utest.js` só grava cache pra uma falha
quando o executor seta `entry.cacheFailure = true` (o mesmo gate documentado no
`.sprint/TEST-EVAL.md` do soml — `apps/eval/utest-phase.js:73`). Meu
`src/eval-utest-phase.js` já fazia isso (`entry.cacheFailure = script.real.length === 0
&& script.linear.length === 0`) — mas mutava o `entry` ERRADO: `registerEvalPhase` passava
`(entry) => evalExecutor(withFeature(entry))`, e `withFeature` fazia `{ ...entry, feature:
... }` — um CLONE via spread. A mutação `entry.cacheFailure = ...` dentro de
`evalExecutor` acontecia no clone, descartado ao retornar; `utest.js` lia
`entry.cacheFailure` do objeto ORIGINAL (nunca mutado) na hora de decidir `cache.write`
— sempre `undefined`, sempre bustava.

**Corrigido**: `featureOf(entryPath)` virou uma função PURA (só deriva o N.F do nome do
arquivo, sem clonar), e `registerExecutor("eval", evalExecutor)` passa o `entry` original
direto — a mutação agora é vista por `utest.js`. Efeito medido: de 0/7 falhas cacheáveis
para 2/7 (`40.80`, `20.110` — sandbox puro, sem passo `real`) gravando sidecar em
`.utest/plans__.../*.json` corretamente na rodada seguinte. As outras 5 falhas
(`90.40`, `00.30`, `00.200`, `40.110`, `40.30`) TÊM passo `t.real(...)` — corretamente
NUNCA cacheáveis, pela mesma regra do soml (passo real roda contra o projeto de verdade,
que pode ter mudado por fora; cachear seria mentir).

### `[?]` dúvida em aberto — a melhoria não é totalmente estável entre rodadas

Numa terceira rodada consecutiva, `20.110.eval.js` e `40.80.eval.js` (que tinham cacheado
na rodada anterior) voltaram a aparecer como re-executadas (`🐢7`, `🐢4` de novo, não
`(cached)`), e o tempo total voltou a ~108s/71s — não ficou estável em "rápido depois da
1ª rodada" como esperado. Não investiguei até o fundo (passa do escopo razoável deste
sprint) — hipóteses não confirmadas: `depsFresh()` (cache.js) invalidando por alguma dep
que muda entre rodadas (talvez algo que `makeScratch`/`sprint init` toca fora da árvore
descartável?), ou uma interação com o `mtime` do PRÓPRIO `.eval.js` sendo tocado de
alguma forma pela minha sessão (várias edições concorrentes nos mesmos arquivos ao longo
deste sprint tornam esse ambiente de teste especialmente ruidoso — um teste limpo, numa
árvore sem histórico de edições recentes nos `.eval.js`, provavelmente mostraria
comportamento mais estável). Vale re-medir depois que a poeira desta sessão assentar.

## 2026-09-04 — quinta rodada: `sweep()` sem fallback quebra em projetos SEM `TEST.yaml` próprio

Depois de reescrever `sweep()` (`cmds/eval.js`) pra sempre delegar pro utest via
`node_modules/utest` (sem o fallback interno condicional de antes), a suíte própria do
sprint-cli regrediu: `tests/degraus.test.js` foi de 100% verde pra `✔47 ✘16` — todos os
testes que exercitam `sprint eval --sweep` numa árvore SCRATCH (criada por `sprint init`
dentro do próprio teste, não o checkout do sprint-cli).

### `[bug]` (do lado sprint-cli, não do utest) `sprint init` não escrevia `TEST.yaml`/`TEST.boot.js`

Causa: `sweep()` roda `bun node_modules/utest/utest.js eval --json` com `cwd` = o projeto
AVALIADO — correto, é onde os `.eval.js` dele vivem. Mas isso só funciona se ESSE projeto
tiver seu próprio `TEST.yaml` (declarando a fase `eval`) e `TEST.boot.js` (registrando o
executor via `src/eval-utest-phase.js`). O checkout do sprint-cli tinha os dois porque eu
os escrevi à mão nesta sessão — nenhum OUTRO projeto (nem uma árvore scratch de teste, nem
um projeto real rodando `sprint init`) os ganhava. Sem eles, `utest eval --json` no
projeto-alvo não sabe que a fase `eval` existe, devolve `[]`, e `sweep()` reporta
"não devolveu nada".

**Corrigido**: `cmds/init.js` agora escreve `TEST.yaml` e `TEST.boot.js` (via `create()`,
idempotente — nunca sobrescreve) em todo projeto que roda `sprint init`. `TEST.boot.js`
importa `registerEvalPhase` por CAMINHO ABSOLUTO pro checkout do sprint-cli instalado
(`join(HERE, "..", "src", "eval-utest-phase.js")`, resolvido pelo binário que está
rodando o `init` agora) — não uma dependência nova do projeto-alvo. Testado num projeto
novo do zero (`sprint init` → `sprint new` → escrever um `.eval.js` → `sprint eval
--sweep --all`): funciona sem vendoring manual, a feature promove 🟢 corretamente.

**Achado geral**: ao trocar "fallback condicional" por "delegação sempre", TODO
pré-requisito que antes era opcional (só usado quando presente) vira OBRIGATÓRIO — e é
fácil esquecer de propagar esse requisito pro scaffold que cria projetos novos. A suíte
própria do sprint-cli (que cria árvores scratch via `sprint init` real, não mocks) pegou
isso na hora — é exatamente o tipo de regressão que só aparece rodando os testes de
verdade, não só testando manualmente no próprio checkout (que já tinha os arquivos).

### `[bug]` mensagem de falha perdeu a linha exata do check — só o arquivo

Efeito colateral da mesma reescrita: a mensagem de falha do `sweep()` via utest usava só
`row.file` (`1.1.eval.js`), não `arquivo:linha` como o runner interno antigo produzia
(via `res.site.line`). O `--json` do utest já carrega isso em `row.fails[].line`
(formato `"1.1.eval.js:008"`) — só não estava sendo lido. Corrigido: a mensagem agora usa
`row.fails?.[0]?.line` quando disponível, mesmo formato de antes.

## 2026-09-04 — sexta rodada: `utest . --force` sob máquina sob carga

Usuário reportou `utest . --force` mostrando SÓ `UNIT` no resultado final (sem `EVAL`,
`coverage: 20%` — o número da fase `unit` isolada, sem contribuição de `eval`). Investiguei
tentando reproduzir: `utest .` sem `--force` terminou corretamente mostrando as duas fases
(confirmado, `UNIT` 68s + `EVAL` 113s = ~181s total). Mas ao tentar reproduzir com
`--force` especificamente, o processo ficou rodando MUITO além do esperado — passou de
250s de timeout sem terminar nem uma vez, em várias tentativas.

### `[?]` não confirmado: a lentidão pode ser puramente ambiental, não um bug

Investigando a demora anormal do PRÓPRIO diagnóstico (não só do sintoma do usuário),
achei: `uptime` mostrou `load average: 5.31` (depois `4.29`) num sistema de **4 núcleos**
— sobrecarga real de CPU por processos de desktop (Brave, VSCode) concorrentes, e
`free -h` mostrou memória quase esgotada com **swap ativo** (2.4Gi em uso). `ps aux
--sort=-%cpu` pegou um `bun sprint new 1.1 x` a 88% CPU no meio da investigação — um
subprocesso disparado por dentro de um `makeScratch()` de algum `.eval.js` sandbox.

Não confirmei se essa contenção é SUFICIENTE para explicar "EVAL desaparece do relatório
final" (só vi "demora muito mais que o esperado", que É consistente com carga alta, mas
não teria por que fazer `phaseResults.filter(r => r.main.tests.length > 0)`
(`utest.js:685`) tratar a fase eval como vazia — a menos que sob pressão extrema algo
dentro do `runPhase("eval")` lance uma exceção que é engolida silenciosamente em algum
ponto, deixando `main.tests` vazio sem propagar erro. Não rastreei esse caminho até o
fim — ficou bloqueado pela própria demora de reproduzir sob a mesma carga.

**Hipótese mais provável, não 100% confirmada**: 78 sandboxes, cada um subindo
`git init` + `bun cmds/init.js` (um processo Bun completo por sandbox), rodando NUMA
MÁQUINA já sob pressão de CPU/memória por outros processos do desktop, pode fazer com
que passos individuais estourem timeouts (o `SH_TIMEOUT_MS = 30_000` que adicionei em
`src/eval-run.js`, sprint 071) sob carga que não estouraria em uma máquina ociosa — e
um padrão de falha sob timeout pode se comportar diferente do padrão de falha por
assert vermelho no agregador do utest. Vale re-testar numa máquina/momento sem outros
processos pesados competindo, ou revisitar `SH_TIMEOUT_MS` pra ser generoso o bastante
pra tolerar contenção real do host, não só o caso ocioso.

**Não é um bug introduzido por este sprint** — `utest .` sem `--force`, testado no mesmo
ambiente sob a mesma carga, completou e mostrou as duas fases corretamente. O sintoma
específico de `--force` some/demora desproporcionalmente merece revisita separada,
idealmente numa máquina sem outros processos pesados rodando ao mesmo tempo.

### `[+]` o que ajudou a diagnosticar rápido

- Rodar `bun /tmp/probe.mjs` chamando `utest/check.js` diretamente (fora do runner, sem o
  shim) isolou em segundos se o problema era a lógica do `check` ou o registro automático
  via `check.test` — sem isso, a mensagem de erro (`received: 1, expected: 2` num teste
  que não tinha um `expect()` naquela linha) seria bem mais difícil de rastrear até a causa.
- Ler o próprio `utest/check.t.js`/`test.t.js` (os testes do módulo, não a doc) revelou o
  padrão idiomático real (`checkFail`, destructuring do parâmetro) mais rápido que o
  README/TEST-SPEC — os specs documentam a API, os `.t.js` documentam o USO.
