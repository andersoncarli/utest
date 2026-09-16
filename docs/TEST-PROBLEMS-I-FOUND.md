# utest Problems Found

Session date: 2026-06-18. All items below were found during test runner migration (utest2.js → utest.js) and check-count investigation.

## Architectural integration

This file is now an evidence log for the next test architecture. The decisions
have been folded into:

- `utest/STATUS.md` - current direction and active decisions.
- `utest/TEST-SPEC.md` - target contract for phases, workers and cache.
- `cmds/testio/ARCHITECTURE.md` - operational architecture for the runner that
  should absorb `utest` behavior on top of `lib/adapters/io-engine.js`.

Items below remain useful as regression cases. In particular, source-map
preservation, anchored internal-frame filtering, `process.exitCode`, TUI/non-TTY
separation, and in-process ESM cache limits should become explicit fixtures for
`testio`.

---

## Fixed in this session

### 1. `utest2.js → utest.js` migration
- `utest/utest2.js` renamed to `utest/utest.js` (in-process runner is now official)
- `utest/scanner2.js` deleted (dead code, no imports)
- `package.json` scripts updated: both `"test"` and `"utest"` now point to `utest/utest.js`

### 2. Bun plugin breaking source maps (`native:NNN` addresses)
- **File:** `utest/utest.js` plugin setup
- **Problem:** Plugin was transforming ALL test files, causing Bun to lose source maps → stack frames showed as `native:007` instead of `file:line`.
- **Fix:** Only transform files that contain `bun:test` or `node:test` imports. Other files returned as-is with `{ contents: code, loader: 'js' }`.

### 3. `INTERNAL` regex false positive in viewer
- **File:** `utest/viewer.js`
- **Problem:** Pattern `test\.js` matched `io-engine.test.js` as an internal framework file → no address shown for failures in that file.
- **Fix:** Anchored all filename patterns: `^test\.js$`, `^utest2?\.js$`, etc.

### 4. Exception check dedup in viewer
- **File:** `utest/viewer.js` `checkView()`
- **Problem:** When the `💥` header and the first frame had the same address, the same line appeared twice.
- **Fix:** `const seen = new Set([addr])` — skip frames already shown in the header.

### 5. `log` not injected by test runner (`io-nutshell.t.js`)
- **File:** `nutshell/io/io-nutshell.t.js`
- **Problem:** Tests destructured `{ log }` but the runner's `tCtx` does not inject `log` — only `check`, `checkFail`, `checkException`, `expect`, `withTempDir`, `spyOn`.
- **Fix:** Removed `log` from all test signatures and removed all `log(...)` call bodies.

### 6. `semsieve/**` excluded from TEST.yaml
- **File:** `TEST.yaml`
- **Problem:** 12 semsieve files not excluded by the existing individual exclusions. Some contain CUDA/WebGPU native code that causes `exit 134` (SIGABRT), killing the Bun process and producing zero output.
- **Fix:** Replaced ~25 individual `semsieve/...` lines with a single `semsieve/**`.

### 7. `utils/TEST.yaml` including integration tests
- **File:** `utils/TEST.yaml`
- **Problem:** Did not exclude `*.int.t.js`. When running `bun utest/utest.js utils/ -f`, integration tests (G.int.t.js, GlobalPipeline.int.t.js, etc.) ran first and polluted global module state, causing subsequent unit tests (e.g., `hash53.t.js`) to cache `checks=0`.
- **Fix:** Added `"**/*.int.t.js"` and `"**/*.int.js"` to the exclude list in `utils/TEST.yaml`.

### 8. `process.exit()` truncates stdout on piped runs
- **File:** `utest/utest.js` line ~317
- **Problem:** `process.exit(code)` abruptly terminates Bun before the stdout buffer is flushed. In piped/redirected context (e.g., `bun utest . --force > file.txt`), the output file is 0 bytes.
- **Fix:** Changed to `process.exitCode = code` — lets the event loop drain naturally and flushes stdout.

---

## Still open / not fixed

### A. `tui/input.kbd.t.js` and `tui/input.mouse.t.js` crash in non-TTY mode
- **Symptom:** `process.stdin.on is not a function` when running without a real terminal.
- **Root cause:** `InputKeyboard` constructor calls `process.stdin.on("data", ...)`. In Bun, when stdout is piped, `process.stdin` is a `ReadableStream` (no `.on()` method). The test uses `spyOn(process, "stdin", "get")` in `beforeAll` to mock stdin, but this spy fails because stdin property is non-configurable in piped mode.
- **Impact:** These files always get `bustCache` → always re-run. In full `--force` runs the stdin corruption may affect batch output write timing.
- **Fix options:**
  1. Guard in `input.kbd.js`: `if (!process.stdin?.on) return` early
  2. Exclude `tui/**/*.kbd.t.js` and `tui/**/*.mouse.t.js` from unit phase (move to integration)
  3. Fix `spyOn` to use `Object.defineProperty` with `configurable: true`

### B. Full `--force .` run crashes with `semsieve/node_modules/.bin/node-llama-cpp` ENOENT — FIXED
- **Symptom:** After running all tests, Bun's internal file watcher fires an ENOENT error for `semsieve/node_modules/.bin/node-llama-cpp`.
- **Root cause:** `utest/utest.js` started `fs.watch(root, { recursive: true })` unconditionally after rendering, even when `--watch` was not requested. That made ordinary full runs observe excluded paths such as `semsieve/**` during cleanup.
- **Impact:** Crash at cleanup time, prevents clean exit even with `process.exitCode` fix.
- **Fix:** Watch setup is now guarded by `if (watch)`, so non-watch runs finish naturally after setting `process.exitCode`.
- **Fix options:**
  1. Keep watch setup behind `--watch/-w`.
  2. If Bun still emits cleanup ENOENT from its own internals later, add a narrowly scoped `uncaughtException` guard for this exact path.
  3. Run `bun --no-addons utest/utest.js` only as a diagnostic fallback.

### C. Passing checks from failing suites are not cached
- **Current behavior:** If a suite has ANY failure or exception, `bustCache(entry.path)` is called. The suite re-runs on every non-force invocation. Its PASSING checks ARE counted in the live run total, but on the NEXT run they re-run again (no savings). More importantly, caches that were written by the OLD subprocess runner (with different counts) may still be on disk.
- **Impact:** Check count varies between runs depending on which suites are live vs cached. Cached total (753) appears lower than the expected ~1500.
- **Known always-live suites:**
  - `lib/adapters/io-engine.test.js` — 1 failure (`io.get("#1").manual` returns undefined)
  - `lib/context.t.js` — 1 failure (KERNEL.md path resolution)
  - `cmds/status/status.t.js` — `status command` test always times out (1000ms), 30 other checks pass
  - `lib/archive/patch/patch.t.js` — exception (missing `../../lib/node.js`)
- **Fix option:** Write cache for the PASSING subset even when suite has failures (store passing check count separately from failed count). Requires protocol change in `writeCache`/`readCache`.

### D. `checks=0, tests=N` in cache is misrepresented as `✔` (1 check)
- **Current behavior:** `summary()` does `n = t.checkCount || 1`. If `checkCount = 0`, contributes 1 to total. This happens for:
  - Tests that pass by state alone (no `check()` calls) — correct behavior
  - Tests where `checks=0` was cached due to module cache pollution (bug)
  - `input.kbd.t.js` (exception suite, cached as `checks=0, tests=4`)
- **Impact:** Total shown in footer is slightly higher than actual check count for files with 0 checks.

### E. In-process module cache: same file can't be re-run in one process
- **Fundamental constraint:** `await import(path)` in Bun is idempotent — a module executes only once per process lifetime. If two entries in the scanner point to the same test file (e.g., via symlinks or deduplication failures), the second run registers 0 tests.
- **Impact:** `--force` on a directory that contains tests already loaded by infrastructure (via transitive imports) may silently skip re-registering those tests.
- **Not a blocker** for normal use since test files don't import each other.

---

## Check count summary

| Run type | Count | Explanation |
|----------|-------|-------------|
| Old cached (before session) | ~1575 | Mix of old subprocess-runner caches (higher counts) + current in-process caches |
| Full `--force .` | 0 bytes output | semsieve SIGABRT crash + node-llama-cpp ENOENT at exit |
| Partial force (lib/ + cmds/ + nutshell/ + utils/ + SKILLS/) | 914 live | Correct live totals per directory |
| Current normal run | 753 | Sum of cached checkCounts; lower because: failing suites' passing checks not cached; `checks=0` files contribute 1 |
| Expected correct total (all suites passing) | ~1560 | Consistent with `grep -r "check\(" *.t.js | wc` ≈ 974 check() + 589 expect() calls |
