# utest — `-w` nao pega toda mudanca; `--force` nao deveria ser necessario no dia a dia

Encontrado em `~/tui` na sessao de 2026-09-15, revisando o sprint 007 (feature 4.3) e
corrigindo 4 imports quebrados (`../iodb/io-engine.js` → `../iodb/src/io-engine.js`,
mesma classe do [ISSUES/005](005-ledger-state-testes-vermelhos.md), em arquivos diferentes).

---

## Sintoma 1 — `utest . -w` fica atras do estado real

Rodando `utest . -w` em background enquanto editava 4 arquivos (`supervisor.js`,
`plugins/eval/ledger.js`, `plugins/eval/super-sink.t.js`, `plans/4-sessao/4.3.eval.js`), o
watch reagiu e re-rodou apos cada edicao — mas o relatorio que ele mostrou ficou pelo menos
uma rodada atras do que uma chamada direta (`utest <arquivo> --force`) mostrava no mesmo
instante. Exemplo: apos o ultimo fix, o watch ainda reportava `3.2.eval.js ✘1`, enquanto
`utest 3.2.eval.js --force` rodado em paralelo dava `✔6` verde. Precisei validar cada fix
com uma chamada direta e `--force` de qualquer forma — o watch serviu como sinal de "algo
mudou", nao como fonte de verdade do resultado.

## Sintoma 2 — `--force` parece necessario para qualquer leitura confiavel

Em quase toda chamada da sessao, `utest <alvo>` sem `--force` respondia com o cache antigo
(`[cache] ... dizia HIT, ledger discorda ... → re-rodando` — o proprio utest desconfia do
cache e re-roda, mas a mensagem aparece sempre, para qualquer edicao recente). Rodar sem
`--force` normalmente e uma f-string de "confie no cache"; na pratica, editar um arquivo e
rodar sem `--force` no minuto seguinte ja produzia inconsistencia entre chamadas (ver
sintoma 3), entao `--force` virou habito defensivo em toda invocacao — o que anula o
proposito do cache.

## Sintoma 3 — resultado flaky entre chamadas isoladas e chamadas agregadas

`utest 1.2.eval.js --force` isolado: `✘2`. Mesma feature dentro de `utest . --force`
(agregando varios `.eval.js`): as duas asserts do arquivo passam quando reproduzidas
manualmente fora do utest. `utest 3.2.eval.js --force` isolado: verde; dentro do watch
rodando `.` completo minutos antes: `✘1`. Nao identifiquei a causa (suspeita: estado global
entre fases/arquivos no mesmo processo — proxima da familia ja documentada no
[item 4 do handoff 260907](../issues/260907-tui.md) sobre `configure()` sem reset, ou do
[item 3](../issues/260907-tui.md) sobre registry poluido entre fases) mas o efeito e visivel:
o mesmo comando, minutos de diferenca, concorrencia diferente, resultados diferentes para o
MESMO arquivo sem nenhuma mudanca de codigo no meio.

## Impacto

Alto no fluxo interativo que o `-w` deveria habilitar. O ciclo esperado —
"edito, o watch me diz o veredito atual, confio nele" — nao fechou nesta sessao: cada
correcao precisou de uma chamada isolada com `--force` para confirmar, e mesmo assim um
resultado isolado e um agregado (`.`) discordaram para o mesmo arquivo sem mudanca de
codigo. Isso empurra de volta para o habito pre-`-w`: editar e rodar `utest <alvo> --force`
manualmente a cada passo.

## Pedido

Nao e um bug pontual que sei apontar linha a linha — e uma experiencia de uso que nao
fechou. Vale investigar:

1. por que `-w` mostra um resultado que uma chamada direta simultanea contradiz;
2. por que o cache precisa de `--force` tao frequentemente no dia a dia (o cache deveria
   proteger de trabalho redundante, nao proteger de resultado errado);
3. se o flaky entre chamada isolada e agregada (sintoma 3) e o mesmo estado-global-sem-reset
   ja rastreado em outra issue, ou uma causa nova.
