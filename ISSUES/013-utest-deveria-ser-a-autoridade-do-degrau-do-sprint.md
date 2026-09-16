# utest deveria ser a autoridade final do degrau de uma feature no jargao do `sprint` — hoje o veredito nao e confiavel o bastante pra automatizar isso

Encontrado em `~/tui` na sessao de 2026-09-15, mesma revisao que gerou
[ISSUES/012](DONE/012-watch-nao-pega-tudo-force-deveria-ser-desnecessario.md).

**Atualizacao (sprint 024): as tres formas de instabilidade listadas abaixo ja fecharam**
(007 e as duas frentes de 012 — cache/`--force` e o watch atrasado) — ver `ISSUES.md#DONE`.
O que falta desta issue agora e so a parte que pertence ao `sprint-cli`: decidir se/como
consumir `--json` como fonte continua de degrau automatico, em vez de `--sweep` manual.
Essa e a issue mais importante deste board — as outras eram bloqueio; esta e o proximo
passo real.

---

## O pedido (do usuario, via `~/tui`)

O `sprint` (jargao ZSS: escada de sete degraus ⚫→🟠→🟡→🟢→🔵→🟣→⚪, mais o eixo de saude
🔴) ja tem o mecanismo CONCEITUAL certo: `sprint eval --sweep` e `sprint test --sweep`
rodam a suite e DERIVAM o degrau — verde promove ate 🟢, vermelho rebaixa ate 🟡 (inclusive
um 🔵, limpando confirmacao). Isso esta documentado em `.sprint/BOOT.md` do `~/tui`.

O que falta: isso deveria acontecer **automaticamente**, e o `utest` deveria ser a **ultima
palavra** sobre o estado de uma frente/feature e seus testes/evals — nao so quando alguem
lembra de rodar `--sweep`. Hoje o rebaixamento e um comando que precisa ser disparado; o
usuario quer que o veredito do `utest` seja a fonte de verdade continua, nao um sweep
manual ocasional.

## Por que isso NAO da pra automatizar hoje, com seguranca

O `sprint` so pode virar consumidor automatico do veredito do `utest` se esse veredito for
estavel — senao ele vai rebaixar (ou promover) features baseado em ruido, o que e pior que
nao automatizar. Na mesma sessao que motivou este pedido, o veredito do `utest` mostrou
tres formas de nao ser estavel:

1. **Exit code agregado nao bate com o estado por-arquivo** — ja documentado e
   diagnosticado em [ISSUES/007](DONE/007-grand-failcount-cross-file.md): o `grand` que decide
   o exit code e um agregado global que pode vazar contagem entre arquivos concorrentes
   (`checks` de um arquivo somando no de outro). Se o `sprint` automatizasse o rebaixamento
   sobre esse exit code, uma feature poderia cair pra 🟡 por um vazamento de OUTRO arquivo,
   sem ter regressao real.

2. **Cache mente sem `--force`, silenciosamente na maior parte do tempo** —
   [ISSUES/012](DONE/012-watch-nao-pega-tudo-force-deveria-ser-desnecessario.md): rodar sem
   `--force` minutos apos editar produzia inconsistencia. Um `sprint` automatico que confia
   no primeiro `utest .` que rodar (sem saber que precisava de `--force`) herda esse
   problema.

3. **`-w` (watch) fica atras do estado real** — mesma issue 012: o watch mostrou
   `3.2.eval.js ✘1` enquanto uma chamada direta simultanea dava `✔6` pro mesmo arquivo.
   Se o `sprint` observasse o watch para decidir o degrau em tempo real, herdaria esse
   atraso.

## Pedido concreto

Antes (ou junto) de o `~/sprint-cli` tratar `utest` como autoridade automatica de degrau,
o `utest` precisa fechar a lacuna de confiabilidade:

- resolver [ISSUES/007](DONE/007-grand-failcount-cross-file.md) — exit code por invocacao tem
  que refletir SO os arquivos daquela invocacao, sem vazamento entre eles;
- resolver [ISSUES/012](DONE/012-watch-nao-pega-tudo-force-deveria-ser-desnecessario.md) — cache
  e watch tem que ser confiaveis sem `--force` manual;
- expor um contrato explicito e estavel que outra ferramenta (`sprint`) possa consumir
  como "verde/vermelho para ESTE conjunto de arquivos, agora" — provavelmente o `--json`
  por-arquivo ja e esse contrato (ver o contorno documentado em 007: filtrar por
  `state !== 'passed' || fails.length > 0`), mas isso precisa ser a *fonte primaria*
  suportada, nao um workaround para o exit code agregado nao ser confiavel.

## Impacto

Alto para o roadmap do `sprint`: o rebaixamento automatico de degrau e um recurso que os
dois times (usuario do `~/tui`, mantenedor do `utest`) querem, mas construi-lo em cima de
um veredito que ja falhou 3 vezes na mesma sessao teria o efeito oposto — destruiria a
confianca no board do `sprint` ("por que essa feature caiu pra 🟡 do nada?").
