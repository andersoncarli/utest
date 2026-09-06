import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'

const sha256 = (file) => {
  try { return createHash('sha256').update(readFileSync(file)).digest('hex') }
  catch { return null }
}

const noop = () => ({
  configChanged: false,
  fileId: () => null,
  recordScan: () => {},
})

// A CHAVE que o iodb devolve pra um registro (`io.in()` → `'#<p>'`) já é o hash progressivo
// da cadeia — única, encadeada, criptográfica por construção (`hash.js`: `key =
// sha64(payload) XOR sha64(prevKey)`). Não inventar um ID paralelo: a chave do registro
// de PRIMEIRA APARIÇÃO de um arquivo *é* o ID dele no sistema — substituto do path/dos
// metadados em qualquer lugar que precise referenciar aquele arquivo.

// `.utest/STATE.jsonl` (histórico append-only, um registro por rodada de scan) projeta
// `.utest/STATE.yaml` (o último estado) via `iodb` — mesma infraestrutura do
// `ledger.js` (8.1). Degrada para no-op sem `../iodb`: um runner de testes não pode
// ficar refém do seu próprio log.
export async function openState(root, options = {}) {
  if (options.enabled === false) return noop()

  let IO, assign
  try {
    ;({ default: IO, assign } = await import('../iodb/io-engine.js'))
  } catch {
    return noop()
  }

  const configPath = options.configPath || join(root, 'TEST.yaml')
  const currentHash = sha256(configPath)

  const io = IO(join(root, '.utest', 'STATE.jsonl'), {
    reduce: assign, initial: {}, type: 'scan-state', entity: 'utest', format: 'jsonl',
  })
  io.open({ _entity: 'utest', _type: 'scan-state-log' })

  const last = io.state() ?? {}
  const configChanged = existsSync(configPath) && last.configHash !== undefined &&
    last.configHash !== currentHash
  const knownFiles = { ...(last.files || {}) }

  return {
    configChanged,
    // a chave (`fileId`) de cada arquivo já visto — para quem quer resolver path → ID
    // sem reler o `.jsonl` inteiro.
    fileId: (file) => knownFiles[file]?.id ?? null,
    // um registro por rodada de scan, agregado (não per-file) + um registro INDIVIDUAL
    // pra cada arquivo NUNCA visto antes — sua chave no iodb (`io.in()` devolve `#<p>`)
    // vira o `id` dele em `files`, gravado de volta na projeção principal. `close()`
    // força a projeção `.utest/STATE.yaml` a refletir o estado imediatamente — sem isso
    // o `iodb` só reescreve o yaml a cada 100 flushes.
    recordScan({ phase, included, excluded }) {
      for (const file of included) {
        if (knownFiles[file]) continue
        const key = io.in({ event: 'file:added', file, phase, at: new Date().toISOString() })
        knownFiles[file] = { id: key, phase, firstSeenAt: new Date().toISOString() }
      }
      io.in({ phase, included, excluded, configHash: currentHash, files: knownFiles, at: new Date().toISOString() })
      io.close()
    },
  }
}
