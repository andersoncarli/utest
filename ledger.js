import { readFileSync } from 'fs'
import { join, relative } from 'path'
import { createHash } from 'crypto'

const sha256 = (file) => {
  try { return createHash('sha256').update(readFileSync(file)).digest('hex') }
  catch { return null }
}

const noop = () => {
  const noopFn = () => {}
  return {
    runId: null,
    write: noopFn,
    start: noopFn,
    file: noopFn,
    test: noopFn,
    event: noopFn,
    end: noopFn,
    verify: () => ({ valid: true, length: 0 }),
    out: () => () => {},
  }
}

// `openLedger` degrada para no-op sem `../iodb` presente, ou com o ledger desligado por
// config — um runner de testes nao pode ficar refem do seu proprio log.
export async function openLedger(root, options = {}) {
  if (options.enabled === false) return noop()

  let IO, append
  try {
    ;({ default: IO, append } = await import('../iodb/io-engine.js'))
  } catch {
    return noop()
  }

  const runId = `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`
  const io = IO(join(root, '.utest', 'ledger'), {
    reduce: append, initial: [], type: 'test-run', entity: 'utest',
  })
  io.open({ _entity: 'utest', _type: 'test-run-log' })

  // A chave que `io.in()` devolve (`'#<p>'`, o hash progressivo encadeado do iodb) já É
  // o breadcrumb de validação: um write que retorna normalmente PASSOU. Um write que
  // falha (lock timeout, corrida no iodb) lança — o erro sobe pra stream de quem chamou,
  // sem precisar de telemetria paralela. Não medir o que o próprio retorno já prova.
  const write = (event, payload = {}) =>
    io.in({ event, runId, at: new Date().toISOString(), ...payload })

  return {
    runId,
    write,
    start(files) {
      write('run:start', {
        phase: options.phase,
        target: options.target,
        fileSet: files.map(file => ({
          file: relative(root, file),
          sha256: sha256(file),
        })),
        total: files.length,
      })
    },
    file(event, file, payload = {}) {
      write(event, { file: relative(root, file), ...payload })
    },
    test(file, result, payload = {}) {
      write('test:result', {
        file: relative(root, file),
        name: result.name,
        status: result.status,
        error: result.error || null,
        elapsed: result.elapsed || 0,
        cached: !!result.cached,
        ...payload,
      })
    },
    event(workerEvent, payload = {}) {
      write(`worker:${workerEvent.event}`, { ...workerEvent, ...payload })
    },
    end(summary) {
      write('run:end', summary)
      io.close()
    },
    verify: () => io.verify(),
    out: (h) => io.out(h),
  }
}
