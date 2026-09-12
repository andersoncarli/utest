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
    state: () => [],
    out: () => () => {},
  }
}

// `openLedger` degrada para no-op sem `../iodb` presente, ou com o ledger desligado por
// config — um runner de testes nao pode ficar refem do seu proprio log.
export async function openLedger(root, options = {}) {
  if (options.enabled === false) return noop()

  let IO, append
  try {
    ;({ default: IO, append } = await import('../iodb/src/io-engine.js'))
  } catch (e) {
    // O degrade continua sendo o contrato. O SILENCIO nao: este `catch` engoliu um
    // `ERR_MODULE_NOT_FOUND` (o caminho apontava para `../iodb/io-engine.js`, sem o
    // `src/`) por nove commits, e o no-op resultante fazia `ledger.t.js`/`state.t.js`
    // falharem por um motivo que nao aparecia em lugar nenhum. Sob `UTEST_DEBUG` o
    // motivo real sai no stderr, sem que o runner deixe de degradar.
    if (process.env.UTEST_DEBUG) process.stderr.write(`[utest] ledger degradado: ${e.message}\n`)
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

  // ── Por que os `test:result` sao BUFFERIZADOS ate o fim da fase ────────────
  // Cada `io.in()` adquire o lock do storage e reescreve o arquivo INTEIRO no flush. Com
  // os workers em paralelo, um `io.in()` por teste vira N disputas pelo mesmo lock sobre
  // um arquivo que cresce a cada rodada — e o `acquireLock` do iodb desiste em 1000ms.
  // O sintoma e um `Lock timeout` intermitente que derruba a rodada inteira: o runner
  // morrendo pelo proprio log, exatamente o que a regra de custo zero do 8.1 proibe.
  //
  // O buffer nao enfraquece a cadeia: os eventos entram na MESMA ordem, encadeados do
  // mesmo jeito, so que num `run:tests` agregado — o mesmo movimento que o `run:start` ja
  // fazia com o `fileSet` em vez de um evento por arquivo. A granularidade do registro
  // segue a granularidade do que se pergunta a ele, nao a do laco que o produziu.
  const buffered = []

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
    // O sha256 do CONTEUDO fica no `run:start` (o `fileSet`), UMA vez por rodada — nao
    // aqui. Hashear por evento parecia mais direto e custou uma regressao real: o `io.in()`
    // segura o lock do storage durante o flush, e um `readFileSync`+sha256 de teste, alvo e
    // deps dentro de cada `test:result` estourou o lock timeout de 1000ms com os workers
    // em paralelo. A anfora do conteudo e a mesma; o lugar dela e o evento agregado.
    //
    // `payload.target` / `payload.deps` viajam como CAMINHO relativo: quem projeta
    // (`cacheLedger.js`) cruza com o `fileSet` do `run:start`, que ja tem o sha de todos.
    test(file, result, payload = {}) {
      const { target, deps, phase, ...rest } = payload
      buffered.push({
        event: 'test:result',
        file: relative(root, file),
        name: result.name,
        status: result.status,
        error: result.error || null,
        elapsed: result.elapsed || 0,
        cached: !!result.cached,
        phase: phase ?? options.phase,
        target: target ? relative(root, target) : null,
        deps: (deps || []).map(d => relative(root, d)),
        ...rest,
      })
    },
    event(workerEvent, payload = {}) {
      write(`worker:${workerEvent.event}`, { ...workerEvent, ...payload })
    },
    end(summary) {
      // Um write so com todos os resultados da fase — ver o comment-block do `buffered`.
      if (buffered.length) write('run:tests', { results: buffered.splice(0) })
      write('run:end', summary)
      io.close()
    },
    verify: () => io.verify(),
    // O HISTORICO projetado: com `reduce: append` e `initial: []`, o estado reduzido do
    // iodb JA E o array de eventos na ordem em que entraram. Quem quer derivar algo da
    // stream (o `cacheLedger.js` deriva o frescor por sha256) le daqui — nao remonta a
    // projecao por conta propria, e nao mantem um segundo registro em paralelo.
    state: () => io.state() || [],
    out: (h) => io.out(h),
  }
}
