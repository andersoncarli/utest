---
sprint: "019"
slug: "interface-issues-utest-arquivo-verde-imprime-so-n-wms-erro-cai-no-checkview-com-callerline-expected-received"
title: "interface-issues: utest <arquivo> verde imprime so ✔N (Wms); erro cai no checkView com callerLine/expected/received"
features: ["4.1"]
budget: null
state: "closed"
opened: "2026-09-09"
closed: "2026-09-09"
migrated: "0.2"
---

# 019 — interface-issues: utest <arquivo> verde imprime so ✔N (Wms); erro cai no checkView com callerLine/expected/received

Plano do sprint 019 (feature 4.1). Sprint guarda-chuva de quirks de interface — reaberto quantas vezes for preciso até a interface consolidar.

# PLAN

## Por que este sprint existe agora

`utest check.t.js` (um arquivo, verde) hoje imprime DUAS linhas:

```
check ✔20 ------------------------------------------------------ (1ms)
unit:  ✔20                                                       (0s)
```

A entryLine do arquivo E a phaseLine da fase, redundantes quando o escopo é UM arquivo. O
esperado é UMA linha, seca:

```
✔20 (5ms)
```

- sem nome de arquivo, sem `unit:`, sem dotfill até a borda
- `(Wms)` = o **wall-clock do runner** nesta invocação (não `Σ lastMs` do storage). Escopo
  de arquivo re-executa por design (feature 4.3); o tempo vivo é o que interessa ali.

E quando há **erro ou exceção**, cai no `checkView` já existente — `✘ <lineCode> .... <addr>`
com `callerLine`, `expected:` e `received:` embaixo, **omitindo `received: false` quando
`expected: true`** (o `trivialTruthy` de `viewer.js:124` já faz isso).

## Plano de materializacao

1. **`utest.js`** — no início do bloco de render, um curto-circuito: se `_isFile` E
   `rendered.length === 1` E `main.state === 'passed'` (sem vermelho, sem exceção) E não é
   `--hogs`/`--json`/`--trace` → imprimir uma linha só, `✔<Σchecks> (<wallMs>ms)`, e sair
   do bloco de render (pular phaseLine, coverage, tip). `wallMs` vem do tempo de parede do
   runner já medido (o `performance.now()` de abertura; ver `T.install` em L349 e o
   `main.duration`/relógio da rodada).
   - O streaming por-teste do `-v:3` durante `runPhase` NÃO pode ter impresso a entryLine
     nesse caso — ou suprimir o stream quando `_isFile` (deixar o render final falar), ou
     garantir que o único output seja a linha seca. Decidir na implementação olhando
     `runPhase`/`view`.

2. **`utest.js`** — o caso com **vermelho** num arquivo só: JÁ funciona via o ramo `else`
   (→ `fullView` → `failLines` → `checkView`). Conferido: `✘ <lineCode> .... <addr>` com
   `received:`/`expected:` embaixo, e `received: false` omitido quando o esperado era `true`
   (o `trivialTruthy` de `viewer.js:124`). Nada a mudar aqui.

3. **`viewer.t.js`** — testes novos:
   - escopo de arquivo verde → a saída é UMA linha, casa `/^✔\d+ \(\d+ms\)$/`, sem `unit:`
     nem o nome do arquivo
   - escopo de arquivo com um `check(1,2)` → `checkView`: tem o `lineCode`, `received: 2`,
     `expected: 1`
   - escopo de arquivo com `check(x, true)` falho → tem o `lineCode` e NÃO tem
     `received: false`

## Criterio de pronto

- `bun utest.js check.t.js` (com as demos de falha comentadas) → exatamente `✔N (Wms)`,
  uma linha
- `bun utest.js check.t.js` (com as demos ativas) → frame + `checkView` com
  callerLine/expected/received, `received: false` omitido no caso `expected: true`
- `bun utest.js viewer.t.js` — verde
- `bun utest.js .` — verde, sem regressão nas outras formas de saída (v0/v1/v2/v3 largo,
  emoldurado, `--hogs`)
- `sprint eval --sweep` — verde

## Diagnóstico

`utest.js`, no bloco de render (~L840+), o escopo de arquivo força `verbosity` a 3
(`utest.js:327`). Aí:

- **verde, cache-hit** → cai no ramo `verbosity >= 3 && nada rodou fresh` (L850): imprime
  `fullView(v:2)` = phaseLine + rio de passados.
- **verde, rodou fresh** → ramo `verbosity >= 3` (L860): a árvore por-teste já streamou em
  `runPhase`, e aqui sai a linha-resumo `phase: ✔ N (Ns)`. Combinado com a entryLine que o
  streaming imprimiu, dá as duas linhas.

Nenhum ramo trata "escopo é um arquivo só, verde" como caso especial.

# REPORT

`utest <arquivo>` verde imprimia a entryLine do arquivo E a phaseLine da fase — redundantes
num escopo de um arquivo. Agora: verde → uma linha seca `✔N (Wms)`; vermelho → direto no
arquivo (`fileLine` + `checkView`), sem frame/tip/coverage/phaseLine. `received`/`expected`
combinados numa linha quando cabem; `received: false` omitido em check de 1 arg falho;
exceção com ≥1 frame de callstack quando há um mais fundo que a linha do check. `utest .`
com 1 arquivo vermelho usa a mesma forma longa (agilidade); com >1, a compacta + `tip:`.

## O que aconteceu

**Objetivo**

Sprint guarda-chuva de quirks de interface — reaberto quantas vezes for preciso até a
interface consolidar. Primeira leva: a saída de `utest <arquivo>`.

`utest check.t.js` verde dava:
```
check ✔20 ------------------------------------------------------ (1ms)
unit:  ✔20                                                       (0s)
```
A entryLine do arquivo e a phaseLine da fase são a mesma informação quando o escopo é UM
arquivo. O esperado é uma linha só:
```
✔20 (14ms)
```
sem nome de arquivo, sem `unit:`, sem dotfill, e o tempo vindo do runner ao vivo (o arquivo
re-executa por design — feature 4.3), não do `Σ lastMs` do storage.

**O que foi entregue**

**`utest.js` — curto-circuito de render para escopo de arquivo verde** (feature 4.1)
No bloco de dispatch, antes de `if (hogs)`: se `_isFile && !anyRed && rendered.length === 1`
e não é `--hogs`/`--json`/`--trace`, imprime `${✔}${s.passed} (${runMs}ms)` e sai. `runMs`
é `Σ (t.lastMs || duration)` dos testes do arquivo — o tempo de EXECUÇÃO medido nesta
rodada, sem o boot do bun nem a abertura do ledger que a parede (`startAll`) incluiria.

**`utest.js` — o stream por-teste do `-v:3` é adiado quando `_isFile`**
`runPhase` streama `view(t)` por teste conforme roda (o `-v:3`). Num arquivo verde isso
imprimia a entryLine no meio da fase, de volta às duas linhas. Agora, com `_isFile`, o
stream vai para um buffer (`_streamBuf`) e só é solto se o arquivo terminar VERMELHO
(exceção ou falha) — aí o detalhe por-teste ajuda a localizar; verde, o render final
(`✔N (Wms)`) fala sozinho.

**Caso com vermelho — forma direta no arquivo, sem cabeçalhos/rodapés** (feature 4.1)
`utest <arquivo>` (ou `utest .` largo com EXATAMENTE um arquivo vermelho no total) deixou de
emoldurar: nada de frame `─────`, `utest results`, `tip:`, phaseLine `unit:` nem a linha
`coverage`. Só a barra do arquivo (`fileLine`: nome ✔N ✘M) e, sob ela, cada erro/exceção por
inteiro (`failLines` → `checkView`). Com >1 arquivo vermelho, o `utest .` segue no relatório
emoldurado completo com o `tip:` — ali o detalhe de todos não caberia. O caso de 1 arquivo
vermelho no `utest .` traz a forma longa direto: agilidade, sem custar um `utest <arquivo>`
separado. No dispatch de `utest.js` isso virou o PRIMEIRO ramo (`_isFile || reds===1`), antes
dos ramos `verbosity >= 3` (que o `_isFile` forçava e faziam sair a phaseLine + a árvore
streamada). O stream por-teste do `-v:3` durante a fase é suprimido quando `_isFile` — o
render final fala sozinho nos dois casos (verde e vermelho).

**`checkView` — três ajustes** (`viewer.js`)
- `received`/`expected` **combinados numa linha** (`received: 1  expected: 2`, 2 espaços)
  quando cabem na largura sob a indentação de 2; senão volta às duas linhas.
- `trivialTruthy` → `trivialFalsy` (`a==='false' && (b===undefined || b==='true')`): agora
  um `check(expr)` de 1 arg que falha também não imprime `received: false` (é sempre falsy;
  a expressão já está no lineCode). `received: 0`/`null`/string continuam.
- exceção: **≥1 linha de callstack** sempre que houver um frame DISTINTO do endereço do
  header e não-interno (`extractFrames`, e o parse cru de `err.stack` como rede). Quando o
  throw foi na própria linha do check (arrow de 1 linha), o header já é a localização — sem
  frame redundante. A linha de frame virou `  <func> ..... <file>:NNN` (antes duplicava o
  nome da função e tinha um `padEnd(2)` sem efeito).

**Cobertura** (`viewer.t.js`)
Dois casos de integração (spawnam `utest.js` de verdade contra um `.t.js` scratch, porque o
render mora no dispatch de `utest.js`, não numa fn de `viewer.js`):
- escopo de arquivo verde → a saída casa `/^✔\d+ \(\d+ms\)$/`, sem `unit:`, sem o nome do
  arquivo, sem `---`
- escopo de arquivo com falha → começa direto na `fileLine` (`^bad\.t\.js .*✘`), SEM `utest
  results`/`tip:`/`coverage:`/`unit:`/`═`; o `checkView` tem o callerLine, `received: 4
  ` + 2 espaços + `expected: 5` na MESMA linha, sem `received: false` no `check(x, true)`
  falho, e a exceção com o header `💥 Boom!` + o endereço

Casos unitários de `checkView`:
- combina `received: 1  expected: 2` quando cabe; a 60 de largura com valores de 40 chars →
  volta às duas linhas
- `check(x, true)` falho E `check(x)` de 1 arg falho → sem `received: false`; `received: 0`
  → aparece (não é trivial)

## Prova

- `bun utest.js check.t.js` (demos comentadas — verde) → `✔20 (Wms)`, uma linha
- `bun utest.js <scratch vermelho>` e `bun utest.js .` (esse scratch o único vermelho) →
  SAÍDA IDÊNTICA: `fileLine` + `failLines`, sem frame/tip/coverage/phaseLine;
  `received/expected` combinados; exceção aninhada mostra os frames (`outer :009`, o
  callsite `:011`), exceção na linha do check mostra só o endereço
- `bun utest.js viewer.t.js --force` — verde, ✔195 (10 casos novos de `hogMs`/badge)
- `bun utest.js .` cold + hot — 📄12 🧪209 ✔613, mesma contagem, exit 0
- `bun utest.js . --hogs 100` — moldura `-v:2`, só arquivos >100ms + vermelhos, cada hog com
  `🐢N×`; num cache QUENTE os tempos (e os badges) vêm do storage, idênticos ao frio
- `bun utest.js . --hogs` — mesmo caminho novo, limiar 1000, badges `🐢N×`
- `bun utest.js .` sem `--hogs` — inalterado (`🐢Ns` = segundos na linha-título)
- `sprint eval --sweep` — 12/8 varridos, nada caiu
- `sprint docs` — ok

## O que fica aberto

- Quirk de cache observado en passant: `utest check.t.js` serviu um `✔20` verde de um estado
  antigo mesmo com falhas no arquivo, até `rm -f .utest/*check.t.js*` forçar leitura limpa.
  Pode ser a mesma classe do sprint 018 (arbitragem) ou um staleness à parte — anotar para
  uma próxima reabertura deste sprint.
- Outras quirks de interface (output esperado × presente) ainda por levantar — este sprint
  reabre para cada uma até a interface consolidar.

## Leva 3 — `--hogs [N]` volta ao relatório `-v:2` com badge de múltiplo

`--hogs` imprimia uma lista de tempo chapada (`hogReport`: `🐢 fase/nome · Nchecks (Nms)` +
rodapé parede/soma) — formato próprio, cego a vermelho. O pedido: que voltasse ao formato
`-v:2` (moldura + `phaseLine` por fase + `compactFails`), com um badge dizendo quantas vezes
cada teste passou do limite, e que `--hogs <N>` escolhesse o limite (`--hogs 100` → tudo
acima de 100ms).

**`--hogs [N]` — o limiar EM MS para a execução inteira** (`utest.js`)
`--hogs 100` / `-h 100`: o positional numérico logo após a flag vira `globalThis.utestHogMs`,
e `viewer.js` ganhou `hogMs() = globalThis.utestHogMs ?? HOG_MS`. Todo ponto que classificava
hog por `> HOG_MS` (o `🐢` inline do `-v:2`, `phaseHogSecs`, a linha-título, o rodapé,
`compactFails`, `fullView`) passou a ler `hogMs()` — **um só conceito de hog por rodada**.
Sem `<N>` (ou sem `--hogs`), `undefined` → cai no `HOG_MS` de sempre (1000). O `<N>` é
tirado de `positional` para não virar filtro de nome nem ser testado como path.

**`--hogs` renderiza o relatório emoldurado, corpo filtrado a hogs + vermelhos** (`utest.js`)
O ramo `} else if (hogs)` parou de chamar `hogReport(…, {standalone:true})`. Agora poda cada
`main` para `state != passed` OU `tempo > hogMs()` e passa por `fullView(…, {verbosity: 2})`
— a MESMA moldura da rodada vermelha (frame, `phaseLine`, `coverage`). Os verdes rápidos
somem; os vermelhos rápidos FICAM (a leitura de saúde continua inteira). `hogReport` segue
existindo como a seção automática de fim-de-relatório (`fullView` sem `--hogs`), intacta —
só saiu do caminho da flag.

**O badge vira `🐢N×` — N = múltiplo do limiar** (`viewer.js`)
`hogBadge(ms) = 🐢${Math.max(1, Math.floor(ms / hogMs()))}×`. `--hogs 100`, arquivo de 450ms
→ `🐢4×`. `--hogs` só, arquivo de 2300ms → `🐢2×`. Mínimo `1×` (se `isHog` já o selecionou,
passou ≥1×). **O `N×` do badge por-arquivo é distinto do `🐢Ns` da linha-título/rodapé**, que
continua sendo SEGUNDOS — o `×` marca a diferença: o badge responde "quantas vezes passou do
limite que EU pedi", o parén "quanto tempo a fase gastou nisso".

**Os tempos vêm do cache — quente == frio** (`viewer.js`)
Dois pontos de `fullView` liam `t.duration` (a parede desta rodada, ~0 num replay de cache),
apagando o `(Nms)` e o `🐢` de um hog cacheado:
- o `tookMs` do header do arquivo virou `t.lastMs || Math.round(t.duration || 0)` — como o
  resto da família (`fileLine`, `phaseMs`, `compactFails`) já lia. De quebra, o `deltaTag`
  desse header (que comparava `round(duration)` contra `lastMs`, ambos o MESMO run → sempre
  0%, tag morta) passou a comparar `tookMs` contra `t.prevMs` (o `ms` do registro anterior)
  — agora a seta de variação realmente aparece num hog que re-rodou.
- o `passTok` do rio de verdes do v2 não carregava badge nenhum — um `--hogs` (que entra em
  v2) listava o arquivo lento sem dizer o quão lento. Agora anexa `🐢N×` (+ `deltaTag` se
  `prevMs`) igual ao `compactFails`.
- a contagem `hogs` do rodapé de `fullView` v3 trocou `t.duration` por `t.lastMs || …`.

**Cobertura** (`viewer.t.js`)
- `hogMs()` respeita `globalThis.utestHogMs`, senão `HOG_MS`; limpa depois
- `compactFails` com `--hogs 100`: pega arquivos que 1000 não pegava, badge = múltiplo de 100
  (450ms → `🐢4×`, 2300ms → `🐢23×`); 60ms segue fora
- `hogBadge` mínimo `1×`: 1001ms → `🐢1×`, nunca `🐢0×`
- as ~10 asserções de badge existentes (`🐢9` = segundos) viraram `🐢N×` = múltiplo; as de
  `phaseLine`/`bare` (`(42s 🐢42)`, `(90s 🐢50)`) ficaram — ali `🐢` ainda é segundos
