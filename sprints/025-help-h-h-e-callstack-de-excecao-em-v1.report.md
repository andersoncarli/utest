---
sprint: 25
date: 2026-09-16
features: [4.1]
thread: null
---
# 025 — help -h/-H e callstack de excecao em v1

Intro: `-h`/`--help` vira ajuda de verdade (era alias de `--hogs`, agora `-H`), erro de
build/import mostra mensagem+endereço em v1 sem precisar de `-v2`, e os ícones da linha de
título de arquivo passam a vir depois do tempo, não antes.

## Objetivo

Três achados do uso manual da CLI depois do sprint 024 (007/012), sem relação com as causas
raiz já fechadas ali:

1. `-h` era alias de `--hogs`, colidindo com a convenção universal de `-h`/`--help`.
2. Erro de build/import (`💥`) só mostrava um resumo (`nome 💥K`) no modo padrão (`v1`) de
   `utest .` — a mensagem e o endereço só apareciam re-rodando com `-v2`/`-v3`.
3. A linha de título de um arquivo (`fileLine`) trazia os badges (ícones) ANTES do
   dotfill/tempo — pedido do usuário para inverter.

## O que mudou

- **`utest.js`**: bloco novo no topo do parsing de args — `-h`/`--help` imprime a tabela de
  flags e sai (`process.exit(0)`) antes de qualquer outro processamento. O antigo alias de
  `--hogs` sobe para `-H` (maiúsculo); nenhum teste testava `-h` como string de CLI isolada
  (só `--hogs` por extenso), então a troca não quebrou nada.
- **`src/viewer.js#fileLine`**: os badges (`🐢N ✘M ✔P`) saem do `left` do `dotfill` (antes do
  nome) e entram no `right` (depois do tempo) — `nome ······ (38ms) 💥1 ✔21` em vez de
  `nome 💥1 ✔21 ······ (38ms)`.
- **`src/viewer.js#compactFails`** (o path de v1 com >1 arquivo vermelho): para cada arquivo
  vermelho que tem uma exceção (`t._cached ? t.excCount : summary(t).exception`), emite
  também `failLines(t, {width, indent:true})` — mensagem + até 6 frames do stack, mesmo
  mecanismo que v2/v3 já usavam via `errorView`/`callstack.js`, sem alterar nenhum dos dois.
  Falha de `check()` comum continua resumida em v1 (comportamento intencional, documentado).
- **`README.md`**: tabela de flags atualizada (`--hogs`/`-H`, nova linha `--help`/`-h`).
- **`src/viewer.t.js`**: 2 testes que casavam o formato ANTIGO de `fileLine` (regex exigindo
  espaço logo após o nome do arquivo, antes do dotfill) atualizados para o novo layout.
- **`plans/4-report/4.1.eval.js`** (novo): 4 passos `t.sandbox` cobrindo os três
  comportamentos acima fim-a-fim via `sh("utest ...")`.

## Achado incidental durante o eval

O padrão `t.real` com caminhos absolutos em `/tmp/...` (usado no `4.6.eval.js` pré-existente)
está quebrado: o `sh()` desse harness roda com um cwd que não reconhece paths absolutos fora
dele, caindo em "parece caminho mas não existe — tratado como filtro de nome" e escaneando o
repo inteiro em vez do fixture. Não é uma regressão desta sessão — confirmado rodando
`sprint eval 4.6 --yes` (não tocado aqui), que falha do mesmo jeito, com o mesmo sintoma,
mesmo sem nenhuma mudança de código relacionada. O padrão correto é `t.sandbox` (fixture
isolada, `write()`/`sh()` relativos ao próprio sandbox) — usado neste sprint e já usado em
`plans/7-isolation/7.2.eval.js`. Registrado como pendência (não corrigido aqui, fora do
escopo declarado de 4.1): `4.6.eval.js` precisa ser reescrito para `t.sandbox`.

## Verificação

- `utest -h` / `utest --help`: imprime a tabela, sem rodar suite.
- `utest . -H 1 --force`: modo laser de hogs, comportamento idêntico ao antigo `-h`.
- Erro de build de 2+ arquivos (fixture sandbox): `utest .` (v1) mostra a mensagem da
  exceção sem precisar de `-v2`.
- `utest .` e `utest . --force` no repo próprio: idênticos, `✔630`, zero vermelho.
- `sprint eval 4.1 --yes`: 4/4 passos verdes, 4.1 promovida 🟡 → 🟢.
