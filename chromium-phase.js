// chromium-phase.js — UM Chromium para a fase inteira, em vez de um por `.check.mjs`.
//
// Sobe o browser com `--remote-debugging-port` e publica o endereço em `CHROMIUM_CDP`;
// cada `.check.mjs` (todos passam por `connectOrLaunch`, em
// `apps/eval-mouse/gestures.check.mjs`) se conecta a ele em vez de lançar o próprio. Um
// `chromium.launch()` custa ~20 processos e ~1,4 GB de RSS — com nove checks de browser
// numa varredura, é o que dispara o `systemd-oomd` (`docs/CRASH-LOG.md`).
//
// ── Por que `node` e não `bun` ────────────────────────────────────────────────
//
// Conectar num browser já de pé exige fechar um handshake WebSocket, e `playwright-core`
// o faz pelo pacote `ws`, que sob Bun 1.3.12 não completa o upgrade (erro 1006) — nem por
// `chromium.connect`, nem por `connectOverCDP`. Não é limitação do Bun em si: o WebSocket
// NATIVO do Bun abre exatamente o mesmo endereço. É o `ws` sob Bun.
//
// Daí `nodeRunner()`: os checks de browser são invocados com `node`, e só eles. O resto da
// suíte segue em Bun. Sem `node` no PATH a fase não sobe browser nenhum e cada check volta
// a lançar o seu — mais lento, mas correto.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PORT_MIN = 9500
const PORT_MAX = 9999
const READY_TIMEOUT_MS = 20_000
const LIGHT_ARGS = [
  '--no-sandbox', '--disable-dev-shm-usage', '--no-zygote',
  '--disable-gpu', '--disable-extensions', '--disable-background-networking',
  '--headless=new',
]

export function findChromium() {
  if (process.env.CHROME) return process.env.CHROME
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright')
  if (!fs.existsSync(cache)) return null
  for (const b of fs.readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome',
                       'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const p = path.join(cache, b, rel)
      if (fs.existsSync(p)) return p
    }
  }
  return null
}

// O `node` que roda os checks de browser. `null` = não há, e o chamador cai no launch por check.
export function nodeRunner() {
  const r = spawnSync('node', ['--version'], { encoding: 'utf8' })
  return r.status === 0 ? 'node' : null
}

const freeMemMB = () => {
  try {
    const kb = /MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'))?.[1]
    return kb ? Math.round(kb / 1024) : Infinity
  } catch { return Infinity }
}

// Porta aleatória por invocação — porta fixa foi o que deixou um servidor órfão de uma
// rodada servir a rodada seguinte (sprint 084d, o bug dos 30s mudos).
const pickPort = () => PORT_MIN + Math.floor(Math.random() * (PORT_MAX - PORT_MIN))

async function waitReady(port, deadline) {
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (r.ok) return true
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}

// `registerPhaseSetup` espera `fn() → Promise<teardown | void>`.
export async function startSharedChromium({ minFreeMB = Number(process.env.CHECK_MIN_FREE_MB || 1600) } = {}) {
  if (process.env.CHROMIUM_CDP) return null          // já há um de fora; não é nosso para derrubar
  const free = freeMemMB()
  if (free < minFreeMB) return null                  // sem RAM: os checks pulam sozinhos
  const exe = findChromium()
  if (!exe || !nodeRunner()) return null

  const port = pickPort()
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'utest-chromium-'))
  const proc = spawn(exe, [...LIGHT_ARGS, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`],
    { stdio: 'ignore', detached: true })
  proc.unref()

  if (!await waitReady(port, Date.now() + READY_TIMEOUT_MS)) {
    try { process.kill(-proc.pid, 'SIGKILL') } catch { /* já morreu */ }
    return null
  }

  process.env.CHROMIUM_CDP = `http://127.0.0.1:${port}`
  process.env.CHECK_RUNNER = nodeRunner()

  return async () => {
    delete process.env.CHROMIUM_CDP
    delete process.env.CHECK_RUNNER
    // O grupo inteiro: o Chromium é uma árvore de ~20 processos, e matar só o líder
    // deixa os filhos segurando a RAM que esta fase existe para não gastar.
    try { process.kill(-proc.pid, 'SIGKILL') } catch { /* já morreu */ }
    // O SIGKILL é assíncrono: apagar o perfil na mesma tick corre contra o browser
    // ainda escrevendo nele, e o diretório sobrevive. Uma folga curta e o `force`
    // resolvem — e mesmo falhando, o perfil é `os.tmpdir()`, não estado de ninguém.
    await new Promise((r) => setTimeout(r, 250))
    try { fs.rmSync(profile, { recursive: true, force: true }) } catch { /* best effort */ }
  }
}

export default { startSharedChromium, findChromium, nodeRunner }
