# utest — Unified Test Runner Specification

## What It Is

`utest` is the canonical test runner for this codebase — a synthesis of four prior runners
(`utils/test/test-runner.js`, `lib/test-runner.js`, `cmds/testio/testio.js`, and the earlier
`utest/` scaffold), keeping the best of each.

The structural foundation is `utest/` (modular, subprocess-isolated, bun-compatible).
The dependency-graph cache comes from `lib/test-runner.js`.
The phase config structure comes from `utils/test/test-runner.js`.
The async log capture comes from `testio.js`.

---

## Contract

```
utest <phase|'unit'> <path|.> [name-filter] [-v:1*|2|3] [--force]
```

| Argument | Default | Meaning |
|----------|---------|---------|
| `phase` | `unit` | One of `unit`, `rendering`, `integration`, `all` |
| `path` | `.` | Directory or file to scan |
| `name-filter` | — | Substring match on file path |
| `-v:0` | — | Silent mode. No output. Returns exit code. |
| `-v:1` | default | Errors, exceptions, and timehogs (>100ms) in real-time + summary |
| `-v:2` | — | File-level summary (`file.js ✔6 ✘1`). Debug logs only on failure. |
| `-v:3` | — | Full detailed test tree + all captured log/debug outputs |
| `--force` | — | Bypass cache, always re-run |

---

## Module Structure

```
utest/
├── index.js      CLI entry — args parsing, orchestration
├── config.js     TEST.yaml loader → { exclude[], unit, rendering, integration }
├── scanner.js    File discovery — all .js/.ts containing test(), _ exclusion, config excludes
├── cacher.js     mtime-offset cache — encoding + dependency graph for source
├── harness.js    Test API — test/it/describe/hooks/expect/spyOn + check wiring
├── seeder.js     Global setup — fs, path, utils/src/* (check, is, cl, ...)
├── runner.js     Execution — subprocess (Bun) or in-process (Node), verbosity output
├── executor.js   Subprocess entry — run one file, output JSON result with logs[]
├── loader.js     Node ESM hook — redirects bun:* imports to bun-mock.js
└── bun-mock.js   Bun API shims for Node.js environments
```

---

## File Discovery (`scanner.js`)

### What counts as a test file

Any `.js` or `.ts` file (not just `*.t.js`) that contains a `\btest\s*(` call.
Named test files (`*.t.js`, `*.test.js`) are always included without content inspection.

**Decision:** scanning all files means test helpers and inline tests don't need to be
renamed. The `test(` regex detects intent; false positives are rare and harmless.

### Phase assignment

| File pattern | Phase |
|-------------|-------|
| `*.tuit` | `rendering` |
| `*.rendering.t.js` | `rendering` |
| `*.integration.t.js`, `*.live.t.js` | `integration` |
| Everything else | `unit` |

### `_` exclusion

Files where any `.`-separated segment of the basename starts or ends with `_` are silently
skipped. This lets you disable a test by renaming `foo.t.js` → `foo_.t.js` without deleting
it — useful for prototypes or temporarily broken tests.

Examples of excluded filenames: `_foo.js`, `foo_.t.js`, `foo.js_`, `bar_.js`

### Config excludes (`TEST.yaml`)

Global and per-phase `exclude` patterns from `TEST.yaml` are applied as glob filters.
Pattern syntax: `*` = any non-separator chars, `**` = any path depth, `?` = single non-sep char.

---

## Caching (`cacher.js`)

### mtime-offset encoding

The cache is stored entirely in the test file's own modification time — no external file.

```
testMtime (seconds) == sourceMtime (seconds) + offset
```

| Offset | State |
|--------|-------|
| `0` | passed |
| `1–9999` | failed |
| `10000+` | exception |

Milliseconds of `testMtime` encode the check count (0–999).

**Decision:** This is zero-overhead — no cache file to write, sync, or clean up. Survives
git checkouts as long as file timestamps are preserved.

### Dependency graph

When checking freshness of the source file, `getMaxMtime(src)` recursively walks all
`import from './...'` statements and returns the maximum mtime across the whole dependency
tree. This catches changes to shared utilities that the test's source imports, even when the
source file itself is untouched.

**Decision:** Ported from `lib/test-runner.js`. The mtime diff approach from
`utils/test-runner.js` was correct in principle but only checked the direct source file.

---

## Test API (`harness.js` + `seeder.js`)

### Globals injected into every test file

```
test(name, fn)          Register test. fn receives (done) — both callback and API object.
it(name, fn)            Alias for test.
describe(name, fn)      Scope for hook isolation.
beforeAll/Each(fn)      Setup hooks.
afterAll/Each(fn)       Teardown hooks.
expect(val)             Jest-compatible assertions with .not negation.
spyOn(obj, prop)        Spy factory with mockImplementation/mockReturnValue/mockRestore.
check(a, b, opts)       FRM custom assertion — throws CheckError on failure.
checkFail(a, b, opts)   Inverted check — expects failure.
checkException(fn, opts) Expects function to throw.
is                      Deep equality / type predicates from utils/src/is.js.
cl                      Logger from utils/src/cl.js.
```

### `done` callback hybrid

`fn(done)` receives `done` as both a callback (called when async test finishes) and an object
with all check/expect/is utilities attached. This supports three calling conventions:

```js
test('sync', () => { expect(1).toBe(1) })
test('async', async () => { await something(); expect(x).toBe(y) })
test('callback', (done) => { setTimeout(() => { done.check(a, b); done() }, 100) })
```

### `check` wiring

`check`, `checkFail`, `checkException` are wrapped in `setupHarness` to increment
`state.active.checks` on each call. This keeps the cached check count accurate when tests use
the FRM check API rather than `expect()`.

---

## Verbosity (`runner.js`)

### `-v:0`

- Silent mode. No output. Returns exit code 1 if errors exist, 0 otherwise.

### `-v:1` (default)

- Only errors, exceptions, and timehogs (tests taking >100ms) are printed.
- Failures print immediately as they occur, ensuring real-time feedback.
- On completion: single summary line indicating pass/fail totals.
- Cached passes are silent.

### `-v:2`

- Every file gets one line printed as it finishes: e.g. `tui/widgets/progress.js ✔6 ✘1`.
- Cached (skipped): `● basename ✔N  (cached)` — **yellow**.
- Debug and log messages are ONLY shown for errors and exceptions.
- Summary at end.

### `-v:3`

- Full test tree layout expanded.
- All debug and log messages of the tests are shown regardless of pass/fail status.
- Subprocess passes `UTEST_VERBOSE=3` to executor so logs flow through.

---

## Subprocess Model (`runner.js` + `executor.js`)

Under Bun, each test file runs in a child `bun` process (full isolation, no module cache bleed).
Under Node.js, tests run in-process with content shimmed to absolute import paths.

The executor outputs a single JSON line to stdout:
```json
{ "success": true, "results": { "passed": N, "failed": 0, "checks": N }, "logs": [...] }
```

`logs` is an array of `[type, args]` tuples captured from `console.log`/`console.debug`
when `UTEST_VERBOSE < 3` (at v:3 they pass through directly).

---

## Config (`TEST.yaml`)

`TEST.yaml` at the scan root is optional. When absent, defaults apply.

```yaml
exclude:           # Global patterns applied before phase filtering
  - node_modules/**
  - archive/**

unit:
  include:
    - "**/*.t.js"
    - "**/*.test.js"
  exclude:
    - "**/*.integration.t.js"

rendering:
  include:
    - "**/*.tuit"

integration:
  include:
    - "**/*.integration.t.js"
    - "**/*.live.t.js"
```
