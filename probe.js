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
 *
 * DUAS VISTAS sobre a MESMA medição. `probe.report()` é a vista FLAT — uma linha
 * por função, todos os callers somados: responde "quem custa". A vista de GRAFO
 * — `probe.tree()` / `probe.callers(name)` / `probe.edges()` — mantém a
 * IDENTIDADE do caller: responde "de ONDE `mergeProps` é chamado, e quanto pesa
 * cada contexto". É o que separa "`mergeProps` roda 14000×" de "`mergeProps`
 * roda 4000× de `factoryDefaultsFor` e 700× de `mergeComputedProps`" — a
 * pergunta que um fix de perf precisa responder antes de escolher onde mexer
 * (docs/PERF-render.md §Grafo de chamadas). A pilha `callStack` só custa um
 * push/pop por chamada rastreada; nada muda quando nada está sob `probe()`.
 */

const registered = [];   // { name, stats, restore }
let depth = 0;           // profundidade de chamadas probeadas, para o self-time
let stolen = 0;          // ms gasto em filhos probeados da chamada corrente

const callStack = [];    // nomes das chamadas rastreadas ATIVAS — para a aresta caller▸callee
const edges = new Map(); // `${caller}\0${callee}` → { caller, callee, calls, totalMs, selfMs, maxMs }

const now = () => performance.now();

function makeStats(name) {
  return { name, calls: 0, totalMs: 0, selfMs: 0, maxMs: 0 };
}

function edgeFor(caller, callee) {
  const k = caller + '\0' + callee;
  let e = edges.get(k);
  if (!e) edges.set(k, e = { caller, callee, calls: 0, totalMs: 0, selfMs: 0, maxMs: 0 });
  return e;
}

function wrap(fn, stats) {
  const probed = function (...args) {
    stats.calls++;
    const edge = edgeFor(callStack[callStack.length - 1] || '(root)', stats.name);
    edge.calls++;
    callStack.push(stats.name);
    const outerStolen = stolen;
    stolen = 0;
    depth++;
    const t0 = now();
    try {
      return fn.apply(this, args);
    } finally {
      const wall = now() - t0;
      depth--;
      callStack.pop();
      stats.totalMs += wall;
      const self = wall - stolen;
      stats.selfMs += self;
      if (self > stats.maxMs) stats.maxMs = self;
      edge.totalMs += wall;
      edge.selfMs += self;
      if (self > edge.maxMs) edge.maxMs = self;
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
  edges.clear();
  callStack.length = 0;
  depth = 0;
  stolen = 0;
};

probe.restore = () => {
  for (const r of registered) r.restore();
  registered.length = 0;
  edges.clear();
  callStack.length = 0;
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

// ─── Vista de grafo — caller▸callee, o contexto que `report()` colapsa ──────────

// Números crus por aresta, para um `.t.js` afirmar sem parsear texto.
probe.edges = () =>
  [...edges.values()]
    .filter((e) => e.calls > 0)
    .sort((a, b) => b.selfMs - a.selfMs);

// Todas as arestas que CHEGAM em `name` — de onde ele é chamado e quanto pesa cada
// origem. É a resposta direta ao "histórico de chamadas de uma função por contexto".
probe.callers = (name) => {
  const out = {};
  for (const e of edges.values()) {
    if (e.callee !== name || e.calls === 0) continue;
    out[e.caller] = { calls: e.calls, selfMs: e.selfMs, totalMs: e.totalMs };
  }
  return out;
};

probe.tree = ({ top = 30, write = (s) => process.stdout.write(s) } = {}) => {
  const active = probe.edges();
  if (!active.length) { write('probe: nenhuma chamada registrada\n'); return; }

  const childrenOf = (caller) =>
    active.filter((e) => e.caller === caller).sort((a, b) => b.totalMs - a.totalMs);
  const roots = childrenOf('(root)');
  const rootTotal = roots.reduce((a, e) => a + e.totalMs, 0) || 1;

  let printed = 0;
  const walk = (edge, depth, seen) => {
    if (printed >= top) return;
    printed++;
    const cyclic = seen.has(edge.callee);
    const pct = (n) => ((n / rootTotal) * 100).toFixed(1);
    write(
      `${'  '.repeat(depth)}${edge.callee}${cyclic ? ' ↻' : ''} · ${edge.calls} · ` +
      `self ${edge.selfMs.toFixed(1)}ms (${pct(edge.selfMs)}%) · ` +
      `total ${edge.totalMs.toFixed(1)}ms (${pct(edge.totalMs)}%)\n`,
    );
    if (cyclic) return;
    const next = new Set(seen).add(edge.callee);
    for (const child of childrenOf(edge.callee)) walk(child, depth + 1, next);
  };
  for (const r of roots) walk(r, 0, new Set());
  if (active.length > printed) write(`… ${active.length - printed} aresta(s) além de top:${top}\n`);
};

export default probe;
