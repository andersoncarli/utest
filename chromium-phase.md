# `chromium-phase` — um browser para a fase inteira

## O problema

Nove `.check.mjs` dirigem um browser de verdade. Cada um fazia o seu
`chromium.launch()`: ~20 processos e ~1,4 GB de RSS por check. Numa varredura da fase
`eval` isso é o que dispara o `systemd-oomd` (`docs/CRASH-LOG.md`) — e, mesmo sem estourar,
é o custo que o `--trace` mostrava como `chromium ~0.3–0.9s` repetido nove vezes.

## O que destravou

O sprint 084d registrou isto como **bloqueado pelo runtime**: `chromium.connect` e
`connectOverCDP` não fechavam o handshake WebSocket sob Bun 1.3.12 (erro 1006). O gancho
`registerPhaseSetup` ficou pronto e sem uso.

O diagnóstico estava incompleto. Medindo as três camadas separadamente:

| o quê | resultado |
|---|---|
| `fetch` do `/json/version` do Chromium, sob Bun | **200** |
| `new WebSocket(url)` NATIVO do Bun, no mesmo endereço | **abre** |
| `playwright.connectOverCDP`, sob Bun | timeout (1006) |
| `playwright.connectOverCDP`, sob **node** | **conecta** |

Ou seja: o WebSocket do Bun funciona. Quem não fecha o handshake é o pacote `ws`, que o
`playwright-core` usa por dentro, rodando sob Bun. **A limitação é da biblioteca sob o
runtime, não do runtime** — e a saída é a que o próprio `TEST.boot.js` já apontava como
alternativa: rodar os checks de browser em `node`.

## Como funciona

```
registerPhaseSetup('eval', startSharedChromium)     ← TEST.boot.js
        │
        ├─ sobe UM chromium --remote-debugging-port=<aleatória>
        ├─ publica CHROMIUM_CDP=http://127.0.0.1:<porta>
        └─ publica CHECK_RUNNER=node
                │
                ▼
        cada .eval.js roda o check com "${CHECK_RUNNER:-bun}"
                │
                ▼
        connectOrLaunch() vê CHROMIUM_CDP → connectOverCDP → { shared: true }
```

`connectOrLaunch` (`apps/eval-mouse/gestures.check.mjs`) é a única porta pro browser nos
nove checks, então bastou ensiná-la a preferir o compartilhado. A ordem de decisão:

1. **Sem RAM** (`MemAvailable < CHECK_MIN_FREE_MB`) → `{ browser: null, skipped: 'lowmem' }`
   — o check PULA, exit 0. Um passo pulado por falta de recurso não é uma falha.
2. **`CHROMIUM_CDP` posto** → conecta no browser da fase, `shared: true`.
3. **Senão** → `chromium.launch()` próprio, como antes.

`shared: true` é o contrato de quem NÃO fecha: derrubar o browser é de quem o subiu, e um
check que o fechasse mataria os seguintes.

## Degradação

Nada disto é obrigatório. `startSharedChromium` devolve `null` — e cada check volta a
lançar o seu — quando não há `node` no PATH, não há Chromium no cache do playwright, a RAM
está abaixo do piso, ou já existe um `CHROMIUM_CDP` de fora (que não é nosso para derrubar).
**Mais lento, nunca incorreto.**

## Portabilidade dos checks

Rodar sob `node` exigiu tirar dois usos de API exclusiva do Bun:

| era | virou | onde |
|---|---|---|
| `Bun.spawn([...])` | `spawn()` de `node:child_process` | `input.check.mjs`, `dialects.check.mjs` |
| `Bun.sleep(ms)` | `new Promise(r => setTimeout(r, ms))` | idem |
| `import.meta.dir` | `dirname(fileURLToPath(import.meta.url))` | `input.check.mjs` |

O servidor de desenvolvimento continua sendo servido por `bun` — só quem o SOBE virou
portátil.

## Portas: sempre sorteadas

Seis `.eval.js` subiam o servidor em porta FIXA (7841, 7842, 7853, 7863, 7864, 7871). Isso
é a mesma armadilha que o 084d consertou dentro do `input.check.mjs`: quando o `kill` não
pega, o servidor fica escutando, e a rodada seguinte **casa com o órfão** — que serve um
bundle velho. A página nasce morta, o check falha, e o relatório só diz `🐢`.

Isto não é teoria: durante este sprint dois órfãos (PIDs 29598 e 29784) seguravam 7841 e
7871 e devolviam `500 Bundle failed` em `/runtime.js`, enquanto o mesmo app numa porta
nova buildava perfeitamente. Agora cada bloco sorteia:

```bash
PORT=$((20000 + RANDOM % 20000))
```

## Ver também

- `utest/chromium-phase.js` — a implementação
- `apps/eval-mouse/gestures.check.mjs` — `connectOrLaunch`, a porta única pro browser
- `docs/EVAL-REGRESSIONS.md` — classe D (ambiente externo) e D-bis (o vermelho que é relógio)
