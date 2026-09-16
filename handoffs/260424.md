# utest Handoff — 2026-04-24 (Session 3)

## Current State (Parallelized & Streaming)

The `utest` runner has undergone a major architectural upgrade. It now supports high-concurrency parallel execution and real-time result streaming, achieving significantly faster feedback loops.

```bash
utest utils -v2 --force
```

**Performance (utils suite - 101 files):**
- **Sequential**: ~25-30 seconds.
- **Parallel (8 workers)**: ~6-7 seconds (including multiple 1s timeouts).
- **Feedback**: Immediate (real-time streaming).

---

## Architectural Upgrades

### 1. Parallel Orchestration (`orchestrator.js`)
- Transitioned from a sequential manifest loop to a **Worker Pool** architecture.
- Uses `Bun.spawn` to execute each test file in a dedicated [child-worker.js](file:///home/bittnkr/bot/utest/child-worker.js) process.
- **Why spawn instead of Bun.Worker?**: ACHIEVES 100% ISOLATION. This resolved persistent ESM circular dependency issues (like `Cannot access 'default' before initialization`) by providing a fresh process environment for every test file.

### 2. Real-Time Streaming UI (`utest.js` + `viewer.js`)
- Implemented an `onResult` callback in the orchestrator that notifies the CLI immediately upon suite completion.
- **Last-Inline Layout**: 
  - **Passing suites** render on a single line (e.g., `is.t.js ✔25`) to conserve space.
  - **Failing suites** break to a new line and render full multi-line diagnostics.
- This provides "live" feedback, making it immediately obvious where hangs or failures occur.

### 3. Hardened Isolation
- **Global Reset**: Each `child-worker` starts with a clean `test.main` registry.
- **Strict Timeouts**: Reduced per-file safety timeout to **1s**. This forces the identification of asynchronous "hogs" and prevents a single bad test from stalling the pipeline.

---

## Error Categorization (Current Run)

### 1. Timeouts (⏳) — "Hogs"
- Interactive TUI tests and some heavy `G` plugin tests (like `discovery.t.js`, `debug.t.js`) hit the 1s limit.
- These need to be investigated for either genuine slowness or hung promises.

### 2. Logic Failures (✘)
- Several tests in `utils/src` (like `split.js`, `toSource.t.js`) are failing due to logic mismatches in the unified environment.

---

## Next Priority Tasks

1. **Stabilize `utils` failures**: Now that the runner is fast and reliable, systematically fix the functional regressions in the core utility tests.
2. **Resource Contention**: Ensure parallel tests don't collide on shared resources (like the `DB` or temporary directories).
3. **Dynamic Worker Count**: Auto-detect `os.cpus()` instead of hard-coding `workers: 8`.
4. **Mock `process.stdin`**: Continue hardening the shim layer for TUI tests that depend on interactive input.

---

## Standard Commands

```bash
utest utils -v2 --force         # High-speed parallel run with live feedback
utest <file> -v3                # Deep-dive into specific file (full tree)
DEBUG=utest utest <file>        # See internal orchestration logs
```
