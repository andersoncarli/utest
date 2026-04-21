# utest/ Session Summary — 2026-04-20

## Goal

Consolidate `utils/utest.js` and `lib/test-runner.js` into a single portable test runner.
The decided approach: **expand `utils/utest.js` in-place** with shimmer-based module isolation.
`utest/` exists as the portability layer (launcher + shimmer). Not a rewrite.

---

## Current State

### What was done

1. **`utils/utest.js`** — 3 targeted changes applied:
   - Added imports at top: `shim` from `../utest/shimmer.js`, `pathToFileURL` from `url`, `withTempDir` from `../lib/withTempDir.js`
   - `loadTests` options now accepts `tmpDir`; `loadOne` uses shimmer when `tmpDir` is present (falls back to direct import otherwise)
   - `runCLI` wraps load/run/render in `withTempDir(async (tmpDir) => { ... })`, threading `tmpDir` through all `loadTests` calls
   - `getConfig()` now accepts `searchPath`, checks target dir first then `process.cwd()`, uses a `Map` cache instead of a single `_config` var (fixes wrong TEST.yaml being read when running from a different cwd)
   - Removed `await G('./globals.d.js')` from `runCLI` (it re-ran atmosphere init from cwd, corrupting `G.test` when cwd ≠ utils/)

2. **`utest/shimmer.js`** — kept unchanged, used by `utils/utest.js`

3. **`utest/` cleanup** — deleted: `runner.js`, `harness.js`, `scanner.js`, `seeder.js`, `executor.js`, `loader.js`, `bun-mock.js`, `config.js`, `fs.js`, `cacher.js`, `self-test.t.js`, `utils/` (all files)

4. **`utest/index.js`** — rewritten but broken (G.test undefined due to dynamic import context). Still present, needs to become a thin launcher (see below).

### Current test results

```
cd ~/bot/utils && ./utest.js . --force    → ✔ 486  ✘ 1  💥 7  (SOTA, baseline)
cd ~/bot && utils/utest.js utils --force  → TypeError: G.test.main.tests undefined
```

### Remaining problem

Running `utils/utest.js` from outside `utils/` still fails at `loadOne` line ~371:
```
TypeError: undefined is not an object (evaluating 'G.test.main.tests')
```

**Root cause identified but not yet fixed:**

`G.test` is `undefined` inside `loadOne` even after `await G._ready`. This only happens when the runner is invoked from a different cwd.

Debug confirmed `G.test` IS a function when `globals.d.js` is loaded dynamically from the correct absolute path (tested from `~/bot`). So the issue is not the dynamic import itself.

The actual cause: `loadOne` checks `G.test.main.tests` **before** `await G._ready` is awaited in its own scope. `loadTests` awaits `G._ready` at its start, but `loadOne` is a closure inside `loadTests` and accesses `G.test` directly. The `G.test` property in the G atmosphere is a **lazy getter** — it returns the test function only after the eager boot has completed. When cwd ≠ utils/, something in the boot sequence leaves `G.test` as a Thenable/undefined at the time `loadOne` first runs.

**Fix to apply:**

Replace the direct `G.test.main.tests` guard in `loadOne` with a safe check:
```js
// line ~371 in utils/utest.js, inside loadOne:
// OLD:
if (G.test.main.tests.some(t => (t._address || t.address) === abs)) {

// NEW — resolve test lazily, guard against undefined:
const testFn = G.test || await G._read?.('test')
if (testFn?.main?.tests?.some(t => (t._address || t.address) === abs)) {
```

Also: `run()` and `runTest()` use `G.test` / `G.check` directly — audit all such accesses in the same way.

Actually the deeper fix: the `loadOne` early-exit check is only needed to avoid loading a file that was already loaded during atmosphere boot. When `G.test` is undefined, skip that check entirely:
```js
const testMain = G.test?.main
if (testMain?.tests?.some(t => (t._address || t.address) === abs)) {
```

---

## Architecture Decisions

### utils/utest.js is the canonical runner
- Full G atmosphere dependency is intentional and correct
- Shimmer adds per-file module isolation without breaking G
- `import './globals.d.js'` at top is a STATIC import — always resolves relative to utest.js location, not cwd. So portability works automatically.

### utest/ role going forward
```
utest/
├── index.js    # Thin launcher: resolves utils/utest.js and forwards all args
├── shimmer.js  # Module shimmer used by utils/utest.js
```

`utest/index.js` should be ~5 lines:
```js
#!/usr/bin/env bun
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
const here = dirname(fileURLToPath(import.meta.url))
await import(resolve(here, '../utils/utest.js'))
// process.argv already contains the target args — utest.js isMain check picks them up
```

This lets you run `~/bot/utest/index.js some/path --force` from anywhere.

---

## Key Files

| File | Status |
|------|--------|
| `utils/utest.js` | Modified, 1 bug remaining (G.test undefined on portable run) |
| `utest/shimmer.js` | Good, no changes needed |
| `utest/index.js` | Needs rewrite as thin launcher (~5 lines) |
| `lib/withTempDir.js` | Used as-is |
| `utils/globals.d.js` | Static import, no changes needed |

---

## Pre-existing failures (not regressions)

Both runners have the same 8 failures regardless of the above:
- `G.t.js`: `import 'test'` package not installed (7 exceptions)
- `G.t.js`: `check(is.promise(testPromise))` — promise identity check fails through G proxy (1 failure)
- `debug.t.js`: `caller.file === 'debug.t.js'` — shimmer changes the filename to the tmp shim path (1 failure, new with shimmer)

The `debug.t.js` failure is a genuine shimmer regression. The test checks `callstack` reports the original filename. Since the shimmed file runs from `/tmp/shim_...js`, the callstack sees that path instead. Fix: the shimmer injects `const __filename = <original>` — `callstack` may need to use that. Or the test can be relaxed. Low priority.

---

## Next Steps (in order)

1. Fix `G.test?.main?.tests` guard in `loadOne` (safe optional chaining)
2. Rewrite `utest/index.js` as thin launcher (~5 lines)
3. Verify: `cd ~/bot && utils/utest.js utils --force` matches `cd ~/bot/utils && ./utest.js . --force` (486 ✔)
4. (Later) Fix `debug.t.js` shimmer filename regression
5. (Later) Plan disconnection from utils/ dependencies for true portability
