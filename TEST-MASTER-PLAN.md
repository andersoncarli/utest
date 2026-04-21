# TEST-MASTER-PLAN.md

Handoff document for the utest architectural refactor.
Continues from conversation: "run `cd ~/bot$ ./utils/utest.js utils --force` and classify the errors"

---

## Situation Summary

The codebase has **three test runners** in various states:

| Runner | Location | LOC | Coupling | Status |
|--------|----------|-----|----------|--------|
| `utils/utest.js` | utils/ | ~800 | Full G atmosphere | Active — being refactored |
| `lib/test-runner.js` | lib/ | 465 | Seeded G | Parallel, keep for now |
| `utest/index.js` | utest/ | ~1200 | Self-seeded | Consolidation target (see UTESTS-REVIEW.md) |

The conversation established the **correct architecture** and did the first pass of surgical cleanup on `utils/utest.js`. This document describes the architecture, what was done, what remains, and the known failures.

---

## Architectural Decision: Three Phases, Three Entrypoints

The core insight agreed on:

> A test file must never need to import anything to define its tests. `test()` is global. `is`, `check`, `log`, `debug` arrive as `fn` arguments at run-time.

### Phase 1 — Scan (`utils/scanner.js`) — Zero dependencies

**Dependency:** `fs`, `path`, `yaml` (Node built-ins + YAML package), `utils/test.js` (test collector stub).

**Responsibilities:**
- Install `globalThis.test` stub before any file loads (Layer 0)
- Walk target paths per `TEST.yaml` config
- `import()` every `.js` file matching the test heuristic
- Any `test()` call inside the file registers into the tree
- Returns a **POJO tree** (`test.main`) with `fn` references attached

**Test file heuristic (in priority order):**
1. Explicit: `*.t.js`, `*.test.js`, `*.tuit` — always included
2. Content scan: any `.js` file matching `/(?<![.\w])test\s*\(/` — standalone `test(` calls only (NOT method calls like `.test(` or `str.test(`)
3. Skipped: files where any `.`-separated basename segment starts or ends with `_` (disabled-test convention from TEST-SPEC.md)
4. Skipped: infrastructure files: `utest.js`, `scanner.js`, `runner.js`, `viewer.js`, `index.t.js`

**Output:** `test.main` — plain object with shape:
```json
{
  "name": "Main",
  "state": "pending",
  "tests": [
    { "name": "...", "fn": <Function>, "tests": [], "checks": [], "state": "pending", "stack": "...", "_address": "/abs/path.js" }
  ]
}
```
`fn` refs are present (needed by runner) but the shape is otherwise a plain object, no class instances.

**Key invariant:** Scanner has no knowledge of G. It must be possible to run scanner.js in a completely fresh process with only `bun`/`node` installed.

---

### Phase 2 — Run (`utils/runner.js`) — Depends on G

**Dependency:** `G` atmosphere must be booted before calling `run()`. Specifically needs: `G.check`, `G.test`, `G.callstack` (for stack frame extraction).

**Responsibilities:**
- Build context object `{ check, test, callstack }` from live G globals
- Execute each `fn(context)` from the scan tree
- Capture check results, exceptions, output, duration
- Write mtime-offset cache entries on pass
- Return a **serialized POJO** — no `fn` refs, fully JSON-serializable

**Context passed to each test fn:**
```js
{
  check, checkFail, checkException,  // from G.check
  test,                               // from G.test (for nested tests)
  log:   (...args) => t.output.push(['log', args]),
  debug: (...args) => t.output.push(['debug', args]),
  ...test.context                     // spread of any extra context from core
}
```

**Cache protocol (mtime-offset encoding):**
- No external cache file — encoded in the test file's own mtime
- `testMtime (minutes) == sourceMtime (minutes)` → passed
- `testMtime.getSeconds() == 0` → verified marker
- `testMtime.getMilliseconds()` → check count (0–999)
- Source file = resolved via `findSourceFile()` (see below)

**`findSourceFile(absTestPath)`** — maps test file to its paired source:
1. Strip `.t.js`/`.test.js` suffix → try `.js` / `.ts`
2. Sibling match by `getBasal()` (handles multi-dot names like `foo.bar.t.js → foo.bar.js`)
3. Orphan fallback: self-pair (the test file IS the source)

**Output shape:**
```json
{
  "name": "Main",
  "state": "passed|failed|exception",
  "duration": 1234,
  "tests": [
    {
      "name": "...",
      "state": "passed|failed|exception",
      "duration": 42,
      "address": "/abs/path.js:042",
      "cached": false,
      "checks": [{ "state": "passed", "received": "...", "expected": "...", "message": "...", "address": "...", "lineCode": "..." }],
      "output": [["log", ["arg1", "arg2"]]],
      "error": { "message": "...", "stack": "..." },
      "tests": [...]
    }
  ]
}
```

---

### Phase 3 — View (`utils/viewer.js`) — Rendering only

**Dependency:** `G.cl`, `G.dotfill`, `G.checkView`, `G.errorView` — loaded lazily via `getRender()`. No test logic, no boot required if rendering deps are already on globalThis.

**Responsibilities:**
- Receive the runner's serialized POJO
- Compute `summary()` (pass/fail/exception counts recursively)
- `view(t, op)` — renders a single test node (synchronous, requires `op._render`)
- `render(results, op)` — async entry point: loads rendering deps, builds `_render`, calls `view()` for each root test

**Verbosity levels** (per TEST-SPEC.md):
- `0` — silent, exit code only
- `1` (default) — failures, exceptions, timehogs (>100ms), final summary
- `2` — file-level summary per test, debug only on failure
- `3` — full tree, all log/debug output

**Key fix applied here:** `checkView.js`'s `isInternal` regex must include `viewer\.js` and `scanner\.js` to prevent these infrastructure files from being blamed as the "origin" of a check failure when callstack walks up the stack during error rendering.

---

## Layer 0: The Test Stub

`utils/test.js` is the Layer 0 bedrock. It is a **pure collector** — no imports of any framework, just captures `(name, fn)` pairs:

```js
// utils/test.js — already correct shape
export function test(name, fn = () => {}, op = {}) {
  const t = { name, fn, op, stack: new Error().stack, checks: [], tests: [], state: 'pending', ... }
  const parent = (this && this.tests) ? this : test.main
  if (parent && parent !== t) { t.parent = parent; parent.tests.push(t) }
  return t
}
test.main = { name: 'Main', tests: [], checks: [], state: 'pending' }
```

Scanner.js installs this as `globalThis.test` before any file is imported. No G, no `is`, no `check` needed at this point.

---

## Layered Boot Model

```
import './scanner.js'          ← Layer 0: test stub on globalThis, walk + collect
                                    ↓ test.main (POJO + fn refs)
import './globals.d.js'        ← Layer 1: G atmosphere boot (is, check, cl, debug, ...)
import { run } from './runner.js'    ← Layer 2: execute tree with context
                                    ↓ serialized results POJO (no fn refs)
import { render } from './viewer.js' ← Layer 3: format & display
```

`utest.js` is the **thin CLI orchestrator** that chains these three phases. It adds no logic of its own beyond argument parsing and console suppression during low-verbosity runs.

---

## Files Changed in This Conversation

| File | Change |
|------|--------|
| `utils/scanner.js` | **New** — Phase 1, zero deps |
| `utils/runner.js` | **New** — Phase 2, G-dependent |
| `utils/viewer.js` | **New** — Phase 3, render-only |
| `utils/utest.js` | **Rewritten** — thin CLI orchestrator (was 797-line monolith) |
| `utils/src/core.js` | **Fixed** — broken import `'../test/test.js'` → `'../test.js'` |
| `utils/src/checkView.js` | **Fixed** — added `viewer\.js` and `scanner\.js` to `isInternal` regex |

---

## Current Test Run State

```
cd ~/bot/utils && ./utest.js utils --force
✔ 485   ✘ 1   💥 6   (1840ms)
```

All 7 failures are in `utils/src/G.t.js`. They are **pre-existing** — identical failures existed before this refactor.

---

## Known Failures: Classified

### Category A — `test` module not found (5 exceptions) — PRE-EXISTING

**Tests affected:**
- `Multi-module space-separated syntax (sync)`
- `Alias caching - test:TEST pattern`
- `Multiple aliases`
- `Mixed eager and global tiers`
- `G._list() introspection`

**Root cause:** G.t.js creates fresh `GlobalGateway` instances and boots them with custom paths:
```js
// G.t.js line 9-10
const PLUGIN_DIR = path.join(__dirname, '../g-plugins')  // utils/g-plugins/
const TEST_DIR   = path.join(__dirname, '../test')       // utils/test/   ← WRONG
```
These tests expect to load a `test` module from `[utils/src/, utils/g-plugins/, utils/test/]`. But `test.js` lives at `utils/test.js` (root) — not inside `utils/test/` (subdirectory).

The discovery plugin (`g-plugins/discovery.js`) scans those three dirs and finds no `test.js`. G then falls through to `import.meta.resolve('test')` which fails: `Cannot find package 'test'`.

**Fix (one line in G.t.js):**
```js
// Change line 10 from:
const TEST_DIR = path.join(__dirname, '../test')
// To:
const TEST_DIR = path.join(__dirname, '..')       // utils/ root — where test.js actually lives
```

Alternatively, place a `test.js` symlink or re-export stub in `utils/test/`:
```js
// utils/test/test.js
export { default } from '../test.js'
```

### Category B — Cascading failures from Category A (1 exception + 1 check failure) — PRE-EXISTING

**`Async multi-module destructuring`** (exception):
```js
const { is: isModule, test: testModule } = await g['is test']  // G.t.js:126
```
`_loadMultiple(['is', 'test'])` throws because `test` fails. The await result is never resolved → destructuring of null throws `Cannot destructure property 'is' from null or undefined value`.

**Fix:** Same as Category A. Once `test` is discoverable, this resolves automatically.

---

**`G proxy getter returning Promise`** (1 check fail + 1 exception):
```js
const testPromise = g.test          // G.t.js:141
check(is.promise(testPromise))      // ✘ false — testPromise is undefined
check(is.string(testPromise._hint)) // 💥 undefined is not an object
```
`g.test` calls `_loadSingle('test')` which returns `undefined` (not in registry → no Promise). So `testPromise` is `undefined`, not a Promise. `_hint` is set on Promise results in `_proxyGet` (G.js:490):
```js
if (result instanceof Promise && !key.startsWith('_')) result._hint = key
```
Undefined is not a Promise, so `_hint` is never set.

**Fix:** Same as Category A.

---

### Category C — `check() native:001` (1 check failure) — NEEDS INVESTIGATION

After the Category A exceptions, the final line shows:
```
✘ check()  ........  native:001
```
`native:001` means callstack couldn't resolve a source file — the check call came from a native/compiled context. This is likely a check inside one of the Category A/B exception handlers that tries to run after the exception state, or a check in the test that verifies exception behavior.

Likely resolves automatically once Category A is fixed. Low priority until then.

---

## Remaining Work: Priority Order

### P0 — Fix `test` module path in G.t.js (one line)

```js
// utils/src/G.t.js line 10
const TEST_DIR = path.join(__dirname, '..')  // was '../test'
```

This fixes 6 of 7 failures immediately (5 exceptions + 1 cascading exception + likely the `native:001` check fail).

### P1 — Validate scanner phase isolation

Scanner.js should be runnable standalone without G:
```bash
bun -e "import { scan } from './scanner.js'; const tree = await scan(['./src']); console.log(tree.tests.map(t=>t.name))"
```
Verify: no G reference, no globals.d.js import in scanner's import chain.

The `YAML` dependency is the only non-builtin. If truly zero-dep is needed, replace TEST.yaml reading with:
```js
// Minimal YAML-free TEST.yaml reader (key: value only, no nesting)
// Or accept YAML as infrastructure dep — it has no transitive deps
```

### P2 — Runner.js: `path` is used but not imported

`runner.js` uses `path.resolve(addr)` (line ~175) but `path` is accessed via `G.path` (which is global after boot). Make this explicit:

```js
// runner.js — at top of run()
const { path } = G
```

Or add an explicit import since runner.js is G-dependent anyway:
```js
import path from 'path'
```

### P3 — `_` exclusion convention (from TEST-SPEC.md)

Scanner.js doesn't implement the underscore-skip convention yet:
> Files where any `.`-separated segment of the basename starts or ends with `_` are silently skipped. This lets you disable a test by renaming `foo.t.js` → `foo_.t.js`.

Add to scanner.js `walk()`:
```js
// In the file loop, after entry.name checks:
const segments = entry.name.split('.')
if (segments.some(s => s.startsWith('_') || s.endsWith('_'))) continue
```

### P4 — Phase assignment by file pattern (from TEST-SPEC.md)

Scanner doesn't yet assign `phase` to each test node. Currently phase is passed as a filter but files aren't tagged. Add to `loadOne()`:

```js
function detectPhase(filename) {
  if (filename.endsWith('.tuit')) return 'rendering'
  if (/\.rendering\.t\.(js|ts)$/.test(filename)) return 'rendering'
  if (/\.(integration|live)\.t\.(js|ts)$/.test(filename)) return 'integration'
  return 'unit'
}
// In loadOne(), after stamping _address:
t._phase = detectPhase(path.basename(fullPath))
```

### P5 — TUIT rendering phase support

Scanner.js has no `.tuit` handling yet. The old `utest.js` had:
```js
if (fullPath.endsWith('.tuit')) {
  const { parseTuitText, runTuitFile, renderStream } = await getTuitRunner()
  // ... register a test node that wraps the TUIT runner
}
```
This needs to move into scanner.js (the registration part) with runner.js calling the TUIT execution. The TUIT runner (`soml/tuit-runner.js`) is a G-dependent module, so scanner would register a stub and runner would execute it.

### P6 — Transitive dep mtime for cache (from UTESTS-REVIEW.md)

`runner.js:findSourceFile()` only checks the direct source file mtime. `lib/test-runner.js` has `getMt()` which recursively walks `import` statements to find the max mtime across the whole dependency tree. This catches utility changes that invalidate a test without touching the source.

Port from `lib/test-runner.js:getMt()`:
```js
function getMt(file, seen = new Set()) {
  if (seen.has(file)) return 0
  seen.add(file)
  let max = fs.statSync(file).mtimeMs
  const src = fs.readFileSync(file, 'utf8')
  for (const m of src.matchAll(/from ['"](\.[^'"]+)['"]/g)) {
    const dep = path.resolve(path.dirname(file), m[1])
    const resolved = [dep, dep + '.js', dep + '/index.js'].find(p => fs.existsSync(p))
    if (resolved) max = Math.max(max, getMt(resolved, seen))
  }
  return max
}
```

### P7 — `utest/` consolidation (from UTESTS-REVIEW.md)

The `utest/` directory is a separate self-seeded runner targeting portability. After the `utils/utest.js` refactor stabilizes, the consolidation target is `utest/index.js`. Key gaps in `utest/`:

1. **`typeOf` at shim init time** — add `'typeOf'` to shimmer.js globals array (line 17)
2. **Transitive dep mtime** — adopt `getMt()` into `utest/cacher.js`
3. **Global cleanup** — add `cleanup()` restore after run
4. **TUIT phase** — stub for future
5. **`getBasalPrecise`** multi-dot filename handling in cacher.js

---

## Architecture Diagram

```
utest.js (CLI orchestrator)
  │
  ├─ scanner.js ──────── test.js (Layer 0 stub)
  │   import()s all .js      globalThis.test = test
  │   files matching         tree built by test() calls
  │   test() heuristic       ↓
  │                      test.main (POJO + fn refs)
  │                          │
  ├─ globals.d.js ────── G atmosphere
  │   boots G               is, check, cl, debug, callstack, ...
  │                          │
  ├─ runner.js ──────── G.check, G.test, G.callstack
  │   executes tree          fn(context) for each node
  │   mtime cache            ↓
  │                      results POJO (no fn refs, fully serializable)
  │                          │
  └─ viewer.js ──────── G.cl, G.dotfill, G.checkView, G.errorView
      render()               formatted string → stdout
```

---

## Files of Interest for Next Session

| File | Why |
|------|-----|
| `utils/src/G.t.js` lines 9-10 | One-line fix: `TEST_DIR` wrong path — root cause of 6/7 failures |
| `utils/scanner.js` | New Phase 1 — needs `_` convention + phase detection |
| `utils/runner.js` | New Phase 2 — needs explicit `path` import, transitive mtime |
| `utils/viewer.js` | New Phase 3 — stable, minor cleanup only |
| `utils/utest.js` | Thin orchestrator — stable |
| `utils/src/core.js` | Fixed broken import (was `'../test/test.js'`, now `'../test.js'`) |
| `utils/src/checkView.js` | Fixed `isInternal` — added `viewer\.js` and `scanner\.js` |
| `utest/UTESTS-REVIEW.md` | Full analysis of all three runners + consolidation gaps |
| `utest/TEST-SPEC.md` | Canonical spec — scanner conventions, cache protocol, verbosity |

---

## Quick Verification Commands

```bash
# Full run with force — should be ✔485 ✘1 💥6 before fix, ✔492 ✘0 💥0 after
cd ~/bot/utils && ./utest.js utils --force

# Run only the failing test file
cd ~/bot/utils && ./utest.js src/G.t.js --force

# Run scanner standalone (verify zero-dep)
cd ~/bot/utils && bun -e "
  import { scan, test } from './scanner.js'
  await scan(['./src'], { filter: 'check' })
  console.log('Tests found:', test.main.tests.length)
"

# Run a single phase in isolation
cd ~/bot/utils && bun -e "
  import './globals.d.js'
  import { scan, test } from './scanner.js'
  import { run } from './runner.js'
  import { render } from './viewer.js'
  await scan(['./src/check.t.js'])
  const results = await run(test.main)
  console.log(await render(results, { verbosity: 2 }))
"
```
