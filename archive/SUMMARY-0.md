# utest HANDOFF

This document is a complete state transfer for continuing development of `utest/` in a new conversation thread.

---

## What utest Is

A unified test runner replacing four legacy runners:
- `utils/test/test-runner.js` — the reference for output format
- `lib/test-runner.js`
- `cmds/testio/testio.js`
- (original `utest/`)

**Contract:**
```
bun utest/index.js [phase] [path] [name-filter] [-v:1|2|3] [--force]
```
- Phase: `unit` (default), `rendering`, `integration`, `all`
- Path: defaults to `.` (cwd)
- `-v:1` (default): errors only + summary line
- `-v:2`: one line per test with dotFill format
- `-v:3`: full output including captured logs
- `--force`: bypass cache

**Summary line format** (target):
```
utils: ✔ 435 ✘ 4 💥 1 (N ms)
```
- `✔ N` = checks passed  
- `✘ N` = assertion failures (tests that ran but failed)
- `💥 N` = exceptions (test files that crashed before running)

---

## Current Status

Run `bun utest/index.js utils --force -v:1` to see current state.

Last known results (before this thread ended):
- Bot tests: `.: ✔ 386+` — all passing
- Utils tests: `utils: ✔ 435 ✘ 0 💥 1 (≈50s)` — **1 remaining failure**

The one remaining failure is `utils/index.t.js`:
```
TypeError: G._test is not a function. (In 'G._test(process.argv.slice(2))', 'G._test' is undefined)
```
This is a meta-test in utils that calls `G._test()` — a function that may not exist in the current G implementation. It may be intentionally skipped or may need a G plugin. Investigate whether the native runner also fails on it:
```bash
cd ~/bot/utils && bun ./test/test-runner.js . -v:1
```
If the native runner also fails it, it's a pre-existing known issue and not our problem. If it passes, we need to understand why (likely `G._test` is set up by the native runner's atmosphere differently).

---

## Files Changed

All changes are in `utest/`:

### `utest/index.js`
- New positional arg parsing: phase → path → filter
- Loads `loadConfig(root)` and passes `config.seed` as absolute path to `runAll()`
- `isMain` guard prevents recursive execution when index.js is scanned as a test file

### `utest/config.js` (new)
- `loadConfig(root)` reads `root/TEST.yaml` using the `yaml` package
- Returns `{ seed, exclude[], unit, rendering, integration }`
- Falls back to `DEFAULTS` if no `TEST.yaml` found

### `utest/scanner.js`
- `_` exclusion: skips files where any dot-segment of the basename starts or ends with `_`
- Uses `(?<![\w.])test\s*\(` to detect test files (avoids false-positives from `.test()` method calls)
- `SKIP_FILES` set prevents scanning runner/infra files themselves

### `utest/cacher.js`
- Added `getMaxMtime(file)` — recursively walks `import from '...'` deps to get max mtime
- Cache is invalidated when any transitive dependency is newer than the cached result
- Exported `findSourceFile(absTestPath)` — finds the companion source file for display

### `utest/harness.js`
- Wraps `check`/`checkFail`/`checkException` to count checks in `state.active` per test
- `done` object (passed as first arg to test functions) now includes: `test`, `it`, `log`, `debug`, `check`, `checkFail`, `checkException`, `expect`, `is`, `cl`, `G`
- `resolves`/`rejects` implemented via `Proxy` to delegate any matcher method
- `rejects.toThrow` special-cased: checks `caught.message` directly (doesn't call the value as a function)
- `state.results.tests[]` tracks per-test name, checks, status for v:2 output

### `utest/runner.js`
- `runAll()` accepts `{ verbose, force, seed }` options
- Loads `seed` (absolute path) once per run via dynamic `import()` before any tests
- Passes `UTEST_SEED` env var to subprocess executor
- `exceptions` counter: distinguishes crashes (no `results`) from assertion failures
- `renderResults()` outputs: `path: ✔ N ✘ N 💥 N (ms)` format
- `process.on('unhandledRejection', ...)` suppressor prevents stray rejections from crashing runner
- v:2 output: per-test lines using `dotFill(t.name, t.checks, srcRel)` — not per file

### `utest/executor.js`
- `UTEST_SEED` env var: loaded before `seedGlobals()` via `import(pathToFileURL(seed))`
- Bun plugin registered at startup: redirects `bun:` and bare `"bun"` to `bun-mock.js`
- `shim()` improvements:
  - Strips `import { test } from 'bun:test'` multi-line imports
  - Injects only globals not already declared (`const/function/import test`)
  - Injects `__dirname`/`__filename` override when file uses them but doesn't define them
  - Rewrites `import.meta.url` to the original file path (fixes `fileURLToPath(import.meta.url)`)
  - Guards `Object.defineProperty` to be idempotent (prevents crash when seed pre-loaded the module)
- `runDiagnostic()` uses shim approach for both Bun and Node (direct import broke test discovery when seed pre-cached modules)

### `utest/loader.js`
- Intercepts bare `"bun"` package AND `bun:*` protocol → redirects to `bun-mock.js`
- Auto-adds `.js`/`.ts`/`/index.js` extensions for extensionless relative imports (Node ESM requires explicit extensions)

### `utest/bun-mock.js`
- Added `Glob` class with async `*scan()` generator (for `import { Glob } from "bun"` usage)

### `utils/TEST.yaml`
- Added `seed: ./globals.d.js` — loads the utils atmosphere before running utils tests

---

## Known Remaining Issues

### 1. `utils/index.t.js` — `G._test is not a function`
```
TypeError: G._test is not a function
```
File: `utils/index.t.js:3` calls `G._test(process.argv.slice(2))`. This is likely a meta-runner entry point that's being picked up as a test file. 

**Likely fix:** Add `index.t.js` to `SKIP_FILES` in `scanner.js`, or add it to `utils/TEST.yaml` exclude list. Check whether the native runner skips it.

### 2. `utils/g-plugins/debug.t.js` — `caller detects current file` (may be fixed by `import.meta.url` rewrite)
```
CheckError: caller detects current file
```
`g.caller(1).file` returns the temp shim path instead of `debug.t.js`. The `import.meta.url` rewrite in the shim should fix this, but it was not yet verified. Run with `--force` to confirm.

### 3. Slow execution (≈50s for utils)
The native utils runner does 496 tests in 40ms (Bun cached). We take ≈50s because:
- Each test is a separate `bun executor.js` subprocess spawn
- No parallelism in `runAll()` — tests run sequentially

**Potential fix:** Use `Promise.all` with a concurrency limit (e.g. 8 workers) in `runAll()`, similar to what `lib/test-runner.js` does. This would bring utils runtime down to ≈5-10s.

---

## Architecture Decision: No utils Dependency

`utest/` does NOT import from `utils/`. The seed mechanism (`UTEST_SEED` → `globals.d.js`) is the correct boundary: utest loads utils' *atmosphere* (globals) but doesn't depend on utils' internals. This prevents circular dependencies (utils tests are run by utest).

The output format mirrors `utils/test/test-runner.js` exactly as the reference standard, but is independently implemented.

---

## Quick Verification Commands

```bash
# Bot tests (should all pass)
bun utest/index.js . --force -v:1

# Utils tests (target: ✔ 496, 💥 0)
bun utest/index.js utils --force -v:1

# Second run (cached, should be instant)
bun utest/index.js utils -v:2

# Verbose — per-test output with dotFill format
bun utest/index.js utils --force -v:2

# Name filter
bun utest/index.js utils array -v:2 --force
```

## File Index

```
utest/
├── index.js       — CLI entry, arg parsing, config loading
├── config.js      — TEST.yaml loader with seed support
├── scanner.js     — file discovery, _ exclusion, test() detection
├── cacher.js      — mtime + dependency graph cache
├── harness.js     — globalThis.test/expect/check/spyOn setup, test runner
├── runner.js      — runAll(), renderResults(), subprocess/in-process dispatch
├── executor.js    — per-file subprocess: seed loading, shim, harness
├── loader.js      — Node ESM loader hook (bun: redirect, extensionless imports)
├── bun-mock.js    — bun:test / bun:sqlite / Glob mock implementations
├── seeder.js      — loads check/checkFail/is/cl globals from utils/src/
├── fs.js          — withTempDir helper
└── self-test.t.js — utest's own self-tests
```
