# UTESTS-REVIEW.md

## Context

Three implementations exist. `utest/` is an ongoing consolidation of the other two into a single portable runner with no external dependency on the full G atmosphere.

| Runner                  | Scope          | LOC  | Coupling   |
|-------------------------|----------------|------|------------|
| `utils/utest.js`        | utils/src/     | 797  | Full G     |
| `lib/test-runner.js`    | lib/           | 465  | Seeded G   |
| `utest/index.js` + deps | portable       | ~1200| Self-seeded|

---

## What each one does

### utils/utest.js
Runs tests inside the live G atmosphere. Loads test files via `import()` directly into the running process. Uses `G.test.main` as a singleton accumulator. Rich rendering via `G.dotfill`, `G.callstack`, `G.errorView`. Caching via mtime protocol (minute-match + seconds=0 marker + ms=check-count). Supports phases, `.tuit` files, and TEST.yaml config.

**Dependency:** requires `globals.d.js` and full G plugin chain to be loaded before running.

### lib/test-runner.js
Self-contained runner for `lib/`. Seeds its own minimal globals from `utils/src/` (no G.test, just globalThis). Inline shimmer that rewrites relative imports to absolute paths and writes to tmpDir. JSON cache in `.bot/testio-cache.json`. Has its own `expect()`, `spyOn()`, `describe()`, `before*/after*` hooks. No G atmosphere needed.

**Dependency:** needs `utils/src/` present to seed globals — but doesn't need G to be initialized.

### utest/index.js
Modular unification of the above. Isolates the utilities needed for portability into `utest/utils/` (intentional copy, not a deficiency). Same mtime caching protocol as `utils/utest.js`. Same shimmer approach as `lib/test-runner.js` but extracted and improved (prototype guard, line mapping, `import.meta.url` rewrite, `__dirname` injection). Full `expect()`, `spyOn()`, `describe()`, hooks from `lib/test-runner.js`. Seeder loads utils from `utest/utils/` so the runner works standalone, anywhere.

**Dependency:** only needs Bun or Node — no other bot module required.

---

## Test Results

```
utils/utest.js   ✔ 486  ✘ 1  💥 7   (2171ms)
utest/index.js   ✔ 384  ✘ 2         (2457ms)
```

Both share the same 8 pre-existing failures. Breakdown:

1. **`import 'test'` / `bun:test`** — G.js tests exercise importing the Bun test package. Not installed. Test-content issue, not a runner issue.
2. **`G.typeOf is not a function`** (5 failures, utest only) — Root cause below.
3. **`check(is.promise(...)) = false`** — Same in both; promise identity check fails through the G proxy tier.

---

## Root Cause: `G.typeOf` failures in utest

`keys.js`, `shrink.js`, `create.js`, `properties.js`, `findIndex.js` all call `G.typeOf(o)` **at module evaluation time** (top-level or in module-init code), not inside a function body.

In `utest/`, `G` is `new Proxy({}, { get: (_, k) => globalThis[k] })`. The seeder loads `typeOf` via `await load('typeOf')` sequentially. But when the shimmed test file is `import()`-ed, the module graph is evaluated synchronously — so `keys.js` is required by the module under test, and it calls `G.typeOf` before `seeder.js` has assigned `globalThis.typeOf`.

Fix: ensure `typeOf` is seeded **before** any utility that calls it at init time. The current seeder order loads `typeOf` second, but it's loaded with `await` — the issue is the utilities that *import keys.js* (etc.) as side effects of importing the module under test. The shim resolves all imports to absolute paths, so `keys.js` is always the real `utils/src/keys.js` which calls `G.typeOf`. The fix is to either:

**Option A:** Load `typeOf` synchronously before any async seeding (it has no dependencies):
```js
// seeder.js — seed synchronously before any async work
const { default: typeOf } = await import('./utils/typeOf.js')
globalThis.typeOf = typeOf
globalThis.G = new Proxy({}, { get: (_, k) => globalThis[k] })
// ... rest of seeder
```
This already works because `typeOf.js` has no imports — it resolves immediately.

**Option B (more robust):** Make `G.typeOf` eagerly available by importing `typeOf` first and assigning to both `globalThis.typeOf` and ensuring G proxy is created after, since the proxy is live. This is what Option A does.

**Option C:** In `shimmer.js`, before injecting globals, inject `var { typeOf } = globalThis;` like the other globals. `typeOf` is already not in the safe list only if it's declared in the file — adding it to the shimmer's `globals` array would handle it.

Option C is the simplest one-line fix in `shimmer.js`:

```js
// shimmer.js line 17 — add typeOf to the globals list
const globals = ['test', 'expect', 'describe', 'it', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll', 'check', 'checkFail', 'typeOf']
```

This injects `var { typeOf } = globalThis;` at the top of every shim, so `G.typeOf` resolves at evaluation time to whatever `globalThis.typeOf` holds at that moment — which the seeder sets before running any test.

---

## Strengths of each, relevant to the consolidation target

### Keep from utils/utest.js
- mtime caching protocol (already adopted in utest/cacher.js) ✔
- Precise source-file finder (`getBasalPrecise` handles multi-dot names) — utest/cacher.js has a simpler version that may miss `foo.bar.t.js → foo.bar.js`
- `summaryFiltered()` — filtering by name terms in the rendered summary
- TUIT rendering phase support — not yet in utest

### Keep from lib/test-runner.js
- `getMt()` dependency-graph mtime — walks `import` statements recursively to find the max mtime across all transitive deps. utest/cacher.js only checks the direct source file. This is more correct for caching.
- 10s timeout via `Promise.race` per test
- `cleanup()` that restores all overridden globals after the run — utest/harness.js does not restore globals

### Already better in utest/
- `shimmer.js` — more complete than lib/test-runner.js inline shim: handles `__dirname/__filename`, prototype guard, `import.meta.url/dir`, proper line-number mapping
- `expect()` in harness.js — more complete than lib/test-runner.js version: `.not`, `.resolves`, `.rejects`, `toBeNaN`, `toBeTypeOf`, `toHaveBeenCalledTimes`, etc.
- `spyOn()` in harness.js — supports `accessType get/set`, full `mockRestore`, `calls.mostRecent/count/reset/all`
- `scanner.js` — explicit `SKIP_DIRS` set, underscore-skip convention, clean `analyze()` separation
- Modular layout — each concern testable in isolation

---

## Gaps remaining in utest/ to complete the consolidation

| Feature                                   | Status in utest/ | Source to adapt |
|-------------------------------------------|-----------------|-----------------|
| `G.typeOf` at shim init time              | Broken (fix above) | shimmer.js L17 |
| Transitive dep mtime in cache             | Not implemented | lib/test-runner.js `getMt()` |
| Global cleanup after run                  | Not implemented | lib/test-runner.js `cleanup()` |
| TUIT rendering phase                      | Not implemented | utils/utest.js  |
| `getBasalPrecise` for multi-dot names     | Simplified      | utils/utest.js  |
| `summaryFiltered` (name-term filtering)   | Not implemented | utils/utest.js  |
| Per-test timeout                          | Not implemented | lib/test-runner.js `Promise.race` |

The `G.typeOf` fix (Option C, one line) unblocks 5 failures immediately. The others are enhancements.

---

## Recommendation

`utest/` is the right consolidation target. The architecture is correct — modular, portable, self-seeded, shimmer-isolated. The `utest/utils/` copies are intentional and necessary for portability.

Priority fixes:
1. **shimmer.js line 17** — add `'typeOf'` to the globals list (fixes 5 failures)
2. **seeder.js** — ensure `typeOf` is the first `await load()` call (belt-and-suspenders)
3. **harness.js** — add `cleanup()` to restore overridden globals after `run()` (prevents state leak across repeated runs)

Lower priority but worth tracking:
4. Adopt `getMt()` transitive mtime from lib/test-runner.js into cacher.js
5. Port `getBasalPrecise` into cacher.js `findSourceFile`
6. Add TUIT phase support (can stay as a stub until needed)
