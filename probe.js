/**
 * probe.js — instrumentar chamadas de função para achar hogs.
 *
 * `spyOn` (shims.js) existe para ASSERTAR sobre uma chamada — recebeu os args
 * certos, foi chamada N vezes. `probe` é o outro uso: MEDIR onde o tempo mora,
 * quando um render de 4ms deveria ser sub-1ms (docs/PERF-render.md). Conta
 * chamadas, self-time (relógio menos o tempo gasto DENTRO de outras funções
 * probeadas — chamadas aninhadas não contam duas vezes), e emite um relatório
 * ordenado pelo custo.
 *
 * Três formas, uma função:
 *
 *   const p = probe(fn)                  // envolve UMA função, devolve o wrapper
 *   probe(obj, 'method')                 // troca obj.method no lugar
 *   probe(mapOrObj)                      // envolve TODO valor-função (um registry)
 *
 * `probe.report()` imprime a tabela de tudo que está sob observação nesta
 * sessão; `probe.reset()` zera os contadores; `probe.restore()` desfaz todas as
 * trocas. Uma medição típica:
 *
 *   probe(pixel._registry)              // todo factory
 *   probe.reset()                       // descarta o warm-up
 *   for (let i = 0; i < 200; i++) soml({ 'x shell': {} })
 *   probe.report()                      // quem custou o quê
 */

const registered = [];   // { name, stats, restore }
let depth = 0;           // profundidade de chamadas probeadas, para o self-time
let stolen = 0;          // ms gasto em filhos probeados da chamada corrente

const now = () => performance.now();

function makeStats(name) {
  return { name, calls: 0, totalMs: 0, selfMs: 0, maxMs: 0 };
}

function wrap(fn, stats) {
  const probed = function (...args) {
    stats.calls++;
    const outerStolen = stolen;
    stolen = 0;
    depth++;
    const t0 = now();
    try {
      return fn.apply(this, args);
    } finally {
      const wall = now() - t0;
      depth--;
      stats.totalMs += wall;
      const self = wall - stolen;
      stats.selfMs += self;
      if (self > stats.maxMs) stats.maxMs = self;
      // devolve ao pai o tempo que ELE gastou aqui dentro, mais o que roubamos
      stolen = outerStolen + wall;
    }
  };
  probed._probeOriginal = fn;
  probed._probeStats = stats;
  return probed;
}

export function probe(target, key) {
  // FORMA 2 — probe(obj, 'method')
  if (key !== undefined) {
    const original = target[key];
    if (typeof original !== 'function') {
      throw new TypeError(`probe: ${String(key)} não é uma função`);
    }
    if (original._probeStats) return original;   // já sob observação
    const name = original.name || String(key);
    const stats = makeStats(name);
    const probed = wrap(original, stats);
    target[key] = probed;
    registered.push({ name, stats, restore: () => { target[key] = original; } });
    return probed;
  }

  // FORMA 3 — probe(Map | objeto): envolve todo valor que é função
  const isMap = target instanceof Map;
  const entries = isMap ? [...target.entries()] : Object.entries(target);
  const looksLikeCollection = entries.length > 1 && entries.every(([, v]) => typeof v === 'function' || v == null);
  if (looksLikeCollection || isMap) {
    for (const [k, v] of entries) {
      if (typeof v !== 'function' || v._probeStats) continue;
      const name = v.name || String(k);
      const stats = makeStats(name);
      const probed = wrap(v, stats);
      if (isMap) target.set(k, probed);
      else target[k] = probed;
      registered.push({
        name, stats,
        restore: () => { if (isMap) target.set(k, v); else target[k] = v; },
      });
    }
    return target;
  }

  // FORMA 1 — probe(fn)
  if (typeof target !== 'function') {
    throw new TypeError('probe: alvo tem que ser função, objeto de funções, ou Map');
  }
  if (target._probeStats) return target;
  const name = target.name || '(anon)';
  const stats = makeStats(name);
  const probed = wrap(target, stats);
  registered.push({ name, stats, restore: () => {} });   // sem host, nada a desfazer
  return probed;
}

probe.reset = () => {
  for (const r of registered) Object.assign(r.stats, makeStats(r.stats.name));
  depth = 0;
  stolen = 0;
};

probe.restore = () => {
  for (const r of registered) r.restore();
  registered.length = 0;
  depth = 0;
  stolen = 0;
};

// Os números crus, para um `.t.js` afirmar sobre eles sem parsear texto.
probe.stats = () =>
  registered
    .map((r) => ({ ...r.stats }))
    .filter((s) => s.calls > 0)
    .sort((a, b) => b.selfMs - a.selfMs);

probe.report = ({ top = 30, write = (s) => process.stdout.write(s) } = {}) => {
  const rows = probe.stats();
  if (!rows.length) { write('probe: nenhuma chamada registrada\n'); return; }

  const totalSelf = rows.reduce((a, r) => a + r.selfMs, 0);
  const nameW = Math.min(32, Math.max(8, ...rows.map((r) => r.name.length)));

  const line = (c1, c2, c3, c4, c5) =>
    write(`${c1.padEnd(nameW)}  ${c2.padStart(9)}  ${c3.padStart(11)}  ${c4.padStart(11)}  ${c5.padStart(8)}\n`);

  line('function', 'calls', 'self ms', 'ms/call', '% self');
  write('-'.repeat(nameW + 46) + '\n');
  for (const r of rows.slice(0, top)) {
    line(
      r.name,
      String(r.calls),
      r.selfMs.toFixed(1),
      (r.selfMs / r.calls).toFixed(4),
      ((r.selfMs / totalSelf) * 100).toFixed(1),
    );
  }
  write('-'.repeat(nameW + 46) + '\n');
  line('TOTAL', String(rows.reduce((a, r) => a + r.calls, 0)), totalSelf.toFixed(1), '', '100.0');
};

export default probe;
