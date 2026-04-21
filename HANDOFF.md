# Utest Stability Handoff

This document summarizes the learnings and state of the `utest` registry and runner system as of 2026-04-22.

## Key Achievements

### 1. Mtime-based Metadata Encoding
We evolved the caching system to support two metrics instead of one. The file Mtime (offset from the start of the minute) now encodes:
- **Checks (✔)**: `ms % 1000` (up to 999 checks)
- **Test Calls (🧪)**: `Math.floor(ms / 1000)` (up to 59 test calls per minute)

Modified `utest/scanner.js` and `utest/runner.js` to pack/unpack this metadata.

### 2. Global Registry Unification
- Fixed a regression where `utest.js` was importing a mock `test` object from `scanner.js` instead of the real collector in `test.js`.
- Ensured `globalThis.test` is the source of truth for all test registrations across dynamic imports.

### 3. G Registry & Globalization
- **Lazy Loading**: Most modules in `globals.d.js` were moved from `eager` to lazy loading to improve boot speed and reduce initialization conflicts.
- **Globalization Sync**: Identified that accessing `G.<module>` before the `globalizer` plugin is installed triggers the `Explicit globalizer not loaded` stub. The boot sequence now waits for plugin installation before proceeding to globalize.
- **ESM Default Unwrap**: Updated `G.js` to correctly unwrap ESM `default` exports even when the module has other exports, ensuring `finalModule` is the intended function/object.

## Current State

- **Baseline Stability**: The system is currently stable on the staged branch.
- **Reporting Parity**: The `utest` runner now shows 🧪 (test calls) and ✔ (checks) in the footer, matching legacy expectations.
- **Scanner Accuracy**: Increased Mtime offset threshold from 1s to 60s to capture files modified earlier in the minute (fixes "histogram.js not counted" issue).

## Open Issues / Next Steps

1. **Explicit Globalizer Stub**: Intermittent "Explicit globalizer not loaded" errors still occur if a module is requested during the very early boot phase. Ensure all core dependencies used by `G` itself (like `fs`, `path`) are handled safely.
2. **Submodule Management**: The `utils/` directory is a submodule. Any changes there must be committed/staged separately from the root repository.
3. **Registry Pruning**: The `global` list in `globals.d.js` should continue to be pruned in favor of lazy `G.name` access to minimize global namespace pollution.

## Diagnostics
Use the following command for deep-dive logs:
```bash
DEBUG=G ./utest.js utils --force -v:2
```
