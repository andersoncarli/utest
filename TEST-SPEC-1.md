# utest — Specification

Canonical spec for the `utest/` test runner. Describes the data contracts, conventions,
and rendering rules. See `TEST-MASTER-PLAN.md` for architecture.

---

## CLI Contract

```
./utest.js [targets...] [options]
```

| Argument | Default | Meaning |
|----------|---------|---------|
| `targets` | `.` | Paths or directories to scan |
| `-v:1` | default | Compact: failures only + footer |
| `-v:2` | — | Compact: all suites inline + failures |
| `-v:3` | — | Full tree: all nodes, checks, output |
| `--force` | — | Bypass cache, re-run everything |
| `--hogs` | — | Show only suites exceeding 100ms |
| `--phase=P` | `all` | One of `unit`, `rendering`, `integration` |
| `--title=T` | targets | Display title in header |

---

## Manifest POJO (scanner → runner)

Keyed by relative path from `_TARGET`. `_`-prefixed keys are metadata, not file entries.

```ts
interface Manifest {
  _TARGET:  string       // absolute base path
  _FILTER:  string       // active name filter
  _SUMMARY: { files: number, test: number, check: number, expect: number }

  [relPath: string]: ManifestEntry
}

type ManifestEntry =
  | { tests: Record<string, { cache?: number }> }  // covered source file
  | { cache?: number }                              // self-validating test file
  | {}                                              // uncovered — no tests
```

`cache: N` means the test passed with N checks in the last run (mtime fresh).

---

## Report POJO (runner → viewer)

The single output of `runManifest()` and `prepareReport()`.

```ts
interface Report {
  state:    'passed' | 'failed' | 'exception'
  duration: number    // ms, total wall time

  stats: {
    files:     number   // total source files scanned
    covered:   number   // source files with at least one test (inc. self-validating)
    uncovered: number   // source files with no tests
    tests:     number   // total test nodes executed
    passed:    number   // check-level pass count
    cached:    number   // check-level cached count
    failed:    number   // check-level fail count
    exception: number   // test nodes that threw
    hogs:      number   // test nodes exceeding HOG_MS (100ms)
  }

  suites: Suite[]
}
```

---

## Suite

One Suite per root test node (top-level `test()` call in a file).

```ts
interface Suite {
  name:      string    // root test name
  file:      string    // absolute path to test file
  state:     'passed' | 'failed' | 'exception'
  duration:  number    // ms, rounded
  fromCache: boolean   // true if entire suite was cached

  passed:    number    // check-level counts
  cached:    number
  failed:    number
  exception: number

  failures: Failure[]  // pre-flattened, for v1/v2 rendering
  nodes:    Node[]     // flat depth-annotated tree, for v3 rendering
}
```

---

## Failure

Pre-flattened failure record. `failures[]` contains one entry per failed check or
per test node that threw an exception.

```ts
type Failure =
  | { kind: 'check';     check: SerializedCheck }
  | { kind: 'exception'; name: string; error: SerializedError }
```

---

## Node

Flat, depth-annotated test node for v3 rendering. `nodes[]` is a pre-order traversal of
the test tree with `depth` attached — no recursion needed in the viewer.

```ts
interface Node {
  depth:      number
  name:       string
  state:      'passed' | 'failed' | 'exception' | 'pending'
  duration:   number     // ms, rounded

  cached:     boolean
  checkCount: number | undefined  // only set when cached === true

  checks:  SerializedCheck[]
  output:  [type: string, args: unknown[]][]
  error:   SerializedError | undefined
}
```

---

## SerializedCheck

```ts
interface SerializedCheck {
  state:    'passed' | 'failed' | 'exception'
  a:        string | undefined   // received value (stringified)
  b:        string | undefined   // expected value (stringified)
  message:  string | undefined
  address:  string | undefined   // "file:line"
  lineCode: string | undefined   // source line text
  error:    SerializedError | undefined
  op: {
    skip:    boolean | undefined
    message: string | undefined
    error:   SerializedError | undefined
  }
}
```

---

## SerializedError

```ts
interface SerializedError {
  message: string
  stack:   string
}
```

---

## Glyphs

```js
glyphs = {
  file:      '📄',
  test:      '🧪',
  hog:       '⏳',
  exception: '💥',
  passed:    '\x1b[32;1m✔\x1b[39;22m',   // green bold
  cached:    '\x1b[33;1m✔\x1b[39;22m',   // yellow bold
  failed:    '\x1b[31;1m✘\x1b[39;22m',   // red bold
  covered:   '\x1b[32m●\x1b[39m',         // green
  uncovered: '\x1b[31m○\x1b[39m',         // red
}
```

---

## File Naming Conventions

| Pattern | Phase | Description |
|---------|-------|-------------|
| `*.t.js` | unit | Standard unit test |
| `*.test.js` | unit | Jest-style name |
| `*.rendering.t.js` | rendering | Visual/ANSI output test |
| `*.tuit` | rendering | TUIT scenario |
| `*.integration.t.js` | integration | Requires live services |
| `*.live.t.js` | integration | Same |
| `foo_.t.js` | skipped | Disabled (any segment ending in `_`) |
| `_foo.t.js` | skipped | Disabled (any segment starting with `_`) |

---

## Cache Protocol

Cache is encoded in the test file's own mtime — no external file.

```
testFile.mtime_minutes == sourceFile.mtime_minutes
  → same minute = cache hit
  → different minute = stale, must re-run

testFile.mtime_ms  →  check count (0–999)
```

Writer (phase 4 in `utest.js`):
```js
const T = Math.floor(srcStat.mtimeMs / 60000) * 60000
const td = new Date(T + Math.min(checks, 999))
fs.utimesSync(testFile, td, td)
```

Reader (`scanner.js`, `cacheCount()`):
```js
const srcMin  = Math.floor(srcStat.mtimeMs  / 60000)
const testMin = Math.floor(testStat.mtimeMs / 60000)
if (srcMin !== testMin) return null       // stale
return testStat.mtimeMs % 1000           // check count
```

---

## Verbosity Rules

### `v:1` (default)

- If all tests passed, no filter active, no hogs: single line `"title: ✔ N (Xms)"`
- Otherwise: header bar, failing suites with failure detail, footer

### `v:2`

- Header bar
- Passing suites: compact inline list `"foo.t.js ✔13  bar.t.js ✔5 …"` (gray)
- Failing suites: separator + `suiteHeader` + `suiteFailureLines`
- Footer

### `v:3`

- Header bar
- All suites (failing first, then passing): full `suiteNodeLines` tree
- Footer

### `--hogs`

Forces verbosity ≥ 2. Passing suite list filtered to only show suites with `duration > 100ms`.

### Name filter (`nameTerms`)

If filter terms are present, only suites whose `name` or `file` contain all terms are shown.
Footer stats still reflect the full run.

---

## Coverage Stat Computation

`stats.covered = manifest._coverage.covered + manifest._coverage.self`

- `covered`: source files that have a paired test file (with `entry.tests`)
- `self`: source files that are self-validating (test IS the source, with `entry.cache`)

`stats.covered` includes both so that a `.t.js` file that validates itself counts toward
coverage even though it has no separate source file.

`covPct = Math.round(covered / files * 100)` — displayed in footer as `●N(P%)`.

---

## HOG Threshold

`HOG_MS = 100` — test nodes with `duration > 100ms` are counted as hogs.

Hog count appears in footer as `⏳N`. Use `--hogs` to filter the display to only show
slow suites.
