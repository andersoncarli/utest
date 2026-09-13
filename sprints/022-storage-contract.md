---
sprint: "022"
slug: storage-contract
title: "storage-contract — o baseline raw que torna iodb mensuravel"
features: ["8.4"]
budget: "80k-150k"
state: open
opened: "2026-09-12"
closed: null
---

# 022 — storage-contract

Um contrato unico de storage de arvore (`treeEngine.js`) com tres implementacoes — raw,
iodb e sqlite — e o baseline raw que e um **iodb nu**: so log e projecao, single user, sem
concorrencia. Em producao roda uma engine por vez; o bench roda as tres na mesma fixture
provando saida identica e medindo tempo e bytes. Nasce da constatacao de que o utest tem
quatro persistencias e nenhuma regua para compara-las.

# PLAN

_Selado em 2026-09-12._ Guarda o que se pretendia **antes de saber**; o REPORT pode
contradize-lo, nunca edita-lo.

## O que foi pedido

Transcrito da conversa de 2026-09-12, na voz de quem pediu:

- "Vamos rever o sistema de storage de utest. desde o basico de um simples .json/pojo
  representando a arvore. [...] sem iodb ou fswatch, puro .js em export default {...}"
- "A arvore deve substituir tudo em uma interface simples com persistencia inicialmente em
  puro pojo. Este e o nosso baseline."
- "use _ctime, ... e name e de fato a tag. 'dir':{'file.js':{}}"
- "devemos criar uma unica interface em tree.json e tree.jsonl. (paralelo com iodb, mas
  raw). De fato iodb e fswatch sao o destino final. mas como utest e a primeira aplicacao
  da nova ferramenta, nos precisamos de um baseline para comparar com sqlite e iodb. as 3
  engines devem funcionar em paralelo com resultados iguais e tempos mensuraveis."
- "pode ser json/jsonl ou js/js. (esta ultima gera arquivos menores e mais bonitos. Mas o
  resultado deve ser identico entre ambos. O que queremos aqui e ver um iodb nu em raw js
  mas sem todos os seus recursos. so um log e uma projecao. single user no concurrency."

O quarto pedido **corrige** o primeiro: o primeiro dizia `.js` com `export default`, o
quarto pede `tree.json`/`tree.jsonl`. O quinto reabre a escolha e a resolve como formato
plugavel. Ficam os tres, na ordem — um pedido que mudou no meio da conversa e dois fatos,
nao um fato corrigido.

## Por que este sprint existe agora

O *porque* da feature esta na ficha da 8.4 (secao **Objetivo**) e nao se repete aqui. O que
e deste sprint e o **momento**:

- A 8.3 esta bloqueada por falta de regua. Ela propoe fswatch como engine padrao, e nao ha
  como decidir isso sem um baseline ao lado para medir. **Este sprint desbloqueia a 8.3.**
- O sprint 021 mediu o custo do caminho iodb e a conclusao registrada foi que ele e "maior
  do que se esperava". Medida sem comparacao nao conclui nada — falta o outro lado.
- A janela e boa: `fswatch` esta **desligado em producao** (`utest.js:502` nunca passa
  `{fswatch:true}`), entao mexer na fonte da arvore agora nao move o chao de ninguem.

## Features que este sprint toca

- **[8.4] storage-contract** — `plans/8-ledger/8.4-storage-contract.md` — dona da spec:
  shape do no, projecao + log, formato plugavel, o contrato do `treeEngine.js`, o irmao de
  resultados, a prova de igualdade. O que dirige a execucao: **um `walk(filter, exclude)`
  de assinatura identica a de `openFswatchSource`** (`fswatchSource.js:111`), tres engines
  atras dele, e um bench que falha se discordarem.
- **[8.3]** nao e tocada. Este sprint e a regua que a destrava, nao a sua implementacao.

## Plano de materializacao

Nove passos. Cada um traz o comando que o prova.

**1. Extrair a classificacao compartilhada.** Novo `classify.js` recebendo `SOURCE_RE` e
`classify()` de `fswatchSource.js:19,80`; `scanner.js` e `fswatchSource.js` importam.
Refactor puro — se algum teste precisar mudar, algo vazou. Vem primeiro porque a terceira
copia da regex e o que mataria a premissa de igualdade.
`bun utest.js scanner.t.js fswatchSource.t.js --force`

**2. A arvore como estrutura, sem I/O.** Novo `tree.js`: `emptyTree`, `setNode`, `delNode`,
`getNode`, `paths`, `totalSize`, `canonical`, `diff`. Novo `tree.t.js` cobrindo no folha vs
`_dir`, `delNode` de diretorio removendo a subarvore, `paths()` nao emitindo diretorios,
`canonical()` estavel sob ordem de insercao, `diff()` simetrico e minimo, e **a colisao
nome-vs-metadado**: um arquivo chamado `_mtime` no disco tem que sobreviver. Esse teste e a
premissa inteira do shape.
`bun utest.js tree.t.js --force`

**3. Serializacao plugavel.** Novo `treeFormat.js` com os backends `json` e `js`. Novo
`treeFormat.t.js` provando resultado identico entre formatos e medindo o custo do append no
`js` — e essa medida que decide se o log `js` fica ou se o log e sempre `jsonl`.
`bun utest.js treeFormat.t.js --force`

**4. Persistencia raw.** Novo `treeStore.js`: `loadTree`, `appendMutations`,
`writeProjection`, `compactIfNeeded`. Novo `treeStore.t.js`: projecao sozinha; projecao +
log reconciliando; entradas com `seq` antigo ignoradas; **tail truncado no meio de uma
linha** parando a aplicacao sem corromper; compactacao preservando estado e truncando o
log; `_v` e `_root` errados devolvendo arvore vazia. Fixtures com
`mkdtempSync(join(tmpdir(),'utest-tree-'))`, como `fswatchSource.t.js`.
`bun utest.js treeStore.t.js --force`

**5. A engine raw atras do contrato.** Novos `treeEngine.js` e `rawEngine.js`, mais
`rawEngine.t.js`: primeiro `refresh()` numa fixture nova produz tudo como `add`; **segundo
`refresh()` sem mudancas produz zero mutacoes** (o teste que prova que o baseline serve
para algo); tocar um arquivo produz exatamente um `upd`; apagar produz um `del`; `walk()`
devolve as mesmas listas que `walk()` de `scanner.js`.
`bun utest.js rawEngine.t.js --force`

**6. O adapter iodb.** Novo `iodbEngine.js` envolvendo `openFswatchSource` e acrescentando
`tree()`, mais `iodbEngine.t.js` guardado por `haveFswatch` (`fswatchSource.t.js:27`) com
skip limpo sem o sibling, asserindo `tree()` da iodb igual a da raw na mesma fixture.
`bun utest.js iodbEngine.t.js --force`

**7. Plugar em `scan()`.** Modificados `scanner.js:139-151`, `utest.js:502` (repassa
`cfg.storage`/`UTEST_STORAGE`) e `TEST.yaml`. Em `scanner.t.js`, estender o assert de
`fswatchSource.t.js:44`: `scan()` com `'walk'`, `'raw'` e `'iodb'` devolve `entries` e
`uncovered` identicos. **Um diff maior que ~5 linhas em `scanner.js` significa que o
contrato esta errado.**
`bun utest.js .`

**8. O irmao de resultados.** `results.flush()` (`cache.js:219`) passa a escrever
`results.tree.json` tambem. Novo `results-tree.t.js`: cada chave de `results.json` tem
endereco correspondente com os mesmos `_ms`/`_checks`/`_state`. Escrita espelhada, leitura
nao migrada.
`bun utest.js results-tree.t.js cache.t.js --force`

**9. O bench de tres.** `scanner.bench.js` com `ENGINES`, cold/warm/bytes e a prova de
igualdade com exit diferente de 0.
`bun scanner.bench.js`

## Riscos de execucao

Os riscos **permanentes do design** estao na ficha da 8.4. Aqui so os que sao deste
sprint:

- **`findProjectRoot` duplicado** (`cache.js:124` e `cacheLedger.js:44`). `treeStore.js`
  precisa dele. Nao fazer a terceira copia: extrair para `paths.js`, que ja existe e e o
  lugar. Se a extracao parecer arriscada no meio do trabalho, importar de `cache.js`,
  nunca copiar.
- **`.utest/` e gitignorado** (`.gitignore:3`). A projecao nunca viaja entre maquinas, o
  que torna o cold-start obrigatoriamente correto, mas significa que um bug que so aparece
  com estado warm nunca aparece em CI. Os testes do passo 4 constroem o estado warm
  explicitamente.
- **Ordem dos passos e carga.** 1 a 4 nao tocam producao. O risco real concentra-se no
  passo 7, que e o unico que muda o caminho que todo run percorre.
- **Divida preexistente, fora de escopo**: `sprints/021-....report.md` esta sem
  frontmatter, o que o `sprint docs` acusa. Reportado, nao consertado.

## Expectativa de budget

**80k-150k tokens.**

Base do palpite: o sprint 021 (dois modulos novos, um bench, integracao em `scanner.js`)
e o vizinho mais proximo em forma. Este tem mais arquivos novos (sete) mas menos
descoberta — a spec ja esta fechada na ficha da 8.4, e os passos 1 a 4 sao autocontidos e
testaveis sem tocar producao. A faixa alarga para cima se o passo 3 revelar que o append
no formato `js` e inviavel, ou se o passo 7 esbarrar na divergencia de symlink.

## Criterio de pronto

- `bun utest.js .` verde com o default (`walk`) inalterado — a prova de que nada quebrou.
- `UTEST_STORAGE=raw bun utest.js .` produz **a mesma saida** que o default.
- `bun scanner.bench.js` imprime a tabela das tres engines com cold, warm, ms/entry e
  bytes, e sai com codigo 0 — qualquer divergencia entre engines derruba o bench.
- A mesma arvore gravada em `json` e em `js` rele profundamente igual.

---

# REPORT

_A preencher ao fechar._ Escrito **depois** da implementacao, comparando com o PLAN acima
sem edita-lo.

## O que aconteceu

A preencher.

## Onde o PLAN errou

A preencher: quais passos mudaram de ordem, de forma ou de custo, e por que. Um passo que
saiu exatamente como previsto tambem e um achado — diga.

### Expectativa de budget

| | tokens |
|---|---|
| previsto | 80k-150k |
| real | a preencher |

## Prova

A preencher: os comandos rodados e a saida que sustenta o criterio de pronto.

## O que fica aberto

A preencher.
