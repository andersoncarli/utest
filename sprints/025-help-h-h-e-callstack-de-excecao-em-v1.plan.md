# 025 — Plano: help -h/-H e callstack de excecao em v1

Plano do sprint 025 (feature 4.1).

## Objetivo

Três achados do uso manual da CLI depois do sprint 024, sem relação com as
causas raiz já fechadas (007/012):

1. **`-h` era alias de `--hogs`, não de `--help`** — convenção universal de
   CLI quebrada; não existia help nenhum implementado. Pedido do usuário:
   `-H` vira o alias de `--hogs`, `-h`/`--help` imprime ajuda e sai.
2. **Erro de build/import (`💥`) não mostra callstack em v1** — o modo
   padrão de `utest .` resumia só `nome 💥K`, sem mensagem nem linha; o
   detalhe (`errorView`/`callstack.js`) só aparecia em `-v2`/`-v3`. Um erro
   de sintaxe virava "re-rode com -v2 para saber o quê".
3. **Badges (ícones) na linha de título de arquivo (`fileLine`) vinham à
   ESQUERDA do tempo** (`nome 💥1 ✔21 ····· (38ms)`) — pedido do usuário:
   inverter para o tempo vir primeiro, badges depois (`nome ····· (38ms)
   💥1 ✔21`).

## Passos

1. `utest.js` (~linha 228): bloco novo `-h`/`--help` — imprime tabela de
   flags e `process.exit(0)` antes de qualquer outro parsing. `-H` substitui
   `-h` como alias de `--hogs` (linhas do `includes`/`findIndex`).
2. `src/viewer.js#fileLine`: `dotfill(left, fill, right)` — badges saem do
   `left` (antes do nome+fill) e entram no `right` (depois do tempo).
3. `src/viewer.js#compactFails`: para cada `t` vermelho com exceção
   (`t._cached ? t.excCount : summary(t).exception`), empilhar
   `failLines(t, {width, indent:true})` logo abaixo do rio de tokens — só
   para exceção, falha de check comum continua resumida em v1.
4. `README.md`: tabela de flags — `-h`→`-H` na linha de `--hogs`, nova linha
   para `--help`/`-h`.
5. `src/viewer.t.js`: 2 testes que casavam o formato ANTIGO de `fileLine`
   (regex exigindo espaço logo após o nome do arquivo) atualizados para o
   novo layout.

## Verificação

- `utest -h` / `utest --help` imprimem a tabela e saem com código 0.
- `utest . -H` continua no modo laser de hogs (antigo `-h`).
- Erro de build reproduzido em fixture `/tmp` com 2 arquivos vermelhos:
  `utest .` (v1) mostra `broken.t.js 💥1` + a mensagem do erro, sem precisar
  de `-v2`.
- `utest .` e `utest . --force` no repo próprio: idênticos, `✔630`, zero
  vermelho.
- `src/check.t.js`: as 3 linhas de exceção forçada (demo, descomentadas
  manualmente pelo usuário para reproduzir o bug) foram recomentadas —
  o arquivo é fixture de demonstração, não teste permanente.

## Critério de pronto

`sprint test` verde para 4.1; `-h`/`--help`/`-H` comportando-se como
descrito; erro de build visível em v1 sem re-rodar.
