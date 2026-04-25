# utest — Master Plan

Three-phase architecture: scanner → runner → viewer. Each phase is a clean module with a
documented input and output contract. No logic leaks between phases.

---

## Phase 1 — Scan (`scanner.js`)

**Input:** target paths, options (`{ filter, force, phase }`)
**Output:** Manifest POJO

**Responsibilities:**
- Walk target directories for source files and test files
- Match test files to their source (or mark source as self-validating)
- Check mtime cache protocol to determine if a test file is fresh
- Return a flat manifest keyed by relative path

**Dependencies:** `fs`, `path` — zero G deps.

### Manifest Format

```js
{
  _TARGET:  '/abs/path',
  _FILTER:  'substring',
  _SUMMARY: { files, test, check, expect },

  // Covered source file — has paired test(s)
  'src/foo.js': { tests: { 'foo.t.js': { cache?: N } } },

  // Self-validating — test file IS the source
  'src/bar.t.js': { cache?: N },

  // Uncovered — source file with no tests
  'src/baz.js': {},

  // Test file that has no matched source (orphan test)
  'src/misc.t.js': { tests: { 'misc.t.js': { cache?: N } } }
}
```

`cache: N` is present when the mtime protocol confirms the file passed with `N` checks.
When absent or `force: true`, the test file must be (re-)executed.

### Cache Protocol (mtime-offset encoding)

No external cache file — encoded in the test file's own mtime:

```
testFile.mtime (minute) == sourceFile.mtime (minute)
  → same minute = passed
  → different minute = stale

testFile.mtime.ms  →  check count  (0–999)
```

`scanner.js` calls `cacheCount(testPath, srcPath)` which returns the check count if fresh,
or `null` if stale/missing.

---

## Phase 2 — Run (`runner.js`)

**Input:** Manifest POJO + options (`{ force, stopOnException }`)
**Output:** Report POJO

**Responsibilities:**
- Load test files that aren't cached (via dynamic `import()`)
- Execute each test's `fn(context)` where context = `{ check, test, log, debug, … }`
- Collect check results, output, errors, duration per test node
- Assemble coverage stats from manifest metadata
- Transform raw execution tree into a flat, viewer-ready Report

**Dependencies:** `G` must be booted before calling `runManifest()`.
Specifically needs: `G.check`, `G.callstack`.

### Key Exports

```js
runManifest(manifest, options)  // Phase 2 entry — returns Report POJO
run(tree, options)              // Execute a test.main tree — returns raw serialized tree
runTest(t, ctx, op)             // Execute a single test node
summary(t)                      // Recursive pass/fail/exception count
prepareReport(rawTree)          // Convert raw tree → Report POJO
```

### `prepareReport(rawTree)` → Report

Converts the raw serialized tree from `run()` into a flat Report POJO. Pre-computes all
summaries and flattens failures so the viewer is pure formatting.

```js
export function prepareReport(rawTree) {
  // builds stats from rawTree._coverage
  // maps rawTree.tests → suites via _buildSuite()
  return { state, duration, stats, suites }
}
```

### `_buildSuite(root)` (internal)

Walks a serialized test node (depth-first via `walk(t, depth)`), accumulating:
- `s.passed`, `s.cached`, `s.failed`, `s.exception` — check-level counts
- `s.failures[]` — pre-flattened `{ kind, check|error }` for v1/v2 rendering
- `s.nodes[]` — flat depth-annotated list for v3 rendering
- `s._tc` — test count (deleted before returning)
- `s._hogs` — count of tests exceeding HOG_MS (100ms, deleted before returning)

Auto-counting rule: leaf nodes with no checks and state `'passed'` count as 1 pass.
This keeps the cache timestamp encoding non-zero for tests that pass without explicit checks.

---

## Phase 3 — View (`viewer.js`)

**Input:** Report POJO
**Output:** formatted string (or `''` for silent mode)

**Responsibilities:**
- Pure data-to-string rendering. No logic, no aggregation.
- Load rendering deps lazily via `getDeps()` (uses G if available, falls back to stubs)
- Dispatch to v1/v2 (compact) or v3 (full tree) rendering

**Dependencies:** `G.cl`, `G.dotfill`, `G.checkView`, `G.errorView` — loaded lazily.
Falls back to stub implementations when `globalThis.G` is absent.

### Key Exports

```js
render(report, options)  // async — main entry point
glyphs                   // { file, test, hog, exception, passed, cached, failed, covered, uncovered }
```

### Verbosity Dispatch

| Level | What renders |
|-------|-------------|
| `v:1` | If all passed and no filter: single summary line. Otherwise: header + failures only. |
| `v:2` | All suites shown inline (compact). Failing suites get header + failure detail lines. |
| `v:3` | Full node tree via `suiteNodeLines()`. All checks, output, errors. |

### Internal Renderers

```js
renderFooter(stats, duration, width)    // bottom stats bar
suiteInline(s)                           // "foo.t.js ✔13"
suiteHeader(s, deps)                     // "G ✔40✘2 (264ms)  G.t.js"
suiteFailureLines(s, deps, width)        // failure detail for v1/v2
suiteNodeLines(s, deps, width)           // full depth-annotated tree for v3
```

---

## Phase 4 — Cache Writeback (in `utest.js`)

After a successful run, `utest.js` writes mtime offsets back to test files:

```js
for (const suite of results.suites) {
  if (!suite.fromCache && suite.state === 'passed' && suite.file) {
    const abs = path.resolve(suite.file)
    fileCache.set(abs, (fileCache.get(abs) || 0) + suite.passed)
  }
}
for (const [abs, checks] of fileCache) {
  const src = findSourceFile(abs)
  const T = Math.floor(fs.statSync(src).mtimeMs / 60000) * 60000
  const td = new Date(T + Math.min(checks, 999))
  fs.utimesSync(abs, td, td)
}
```

`suite.passed` is the check count already computed by `_buildSuite`. The writeback sets
`testFile.mtime = floor(srcMtime / 60s) * 60s + checkCount` (in ms).

---

## Data Flow Diagram

```
utest.js (CLI orchestrator)
  │
  ├─ scanner.js                    Phase 1: zero deps
  │   walk files, check mtimes         ↓
  │                               Manifest POJO (file-keyed, cache info)
  │                                    │
  ├─ [G boot: globals.d.js]        G atmosphere
  │                                    │
  ├─ runner.js                     Phase 2: G-dependent
  │   import() uncached files          ↓ raw tree
  │   execute fn(context)          prepareReport()
  │   collect checks/errors            ↓
  │                               Report POJO (flat, pre-aggregated)
  │                                    │
  ├─ viewer.js                     Phase 3: rendering only
  │   render(report, options)          ↓
  │                               formatted string → stdout
  │
  └─ cache writeback               Phase 4: utest.js
      set test mtime = src mtime + checkCount
```

---

## File Reference

| File | Role | Phase |
|------|------|-------|
| `utest/utest.js` | CLI orchestrator, argument parsing, cache writeback | 0 / 4 |
| `utest/scanner.js` | File discovery, manifest building, mtime cache check | 1 |
| `utest/runner.js` | Test execution, `prepareReport`, `_buildSuite` | 2 |
| `utest/viewer.js` | Pure formatter, verbosity dispatch | 3 |
| `utest/test.js` | Test collector stub, `test.main` registry | shared |
| `utest/paths.js` | Path constants: `ROOT`, `TEST_DIR`, `SRC_DIR` | shared |
