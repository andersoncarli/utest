/**
 * setup.js - Runtime Environment Initializer
 *
 * Installs our custom globals and mocks built-in modules
 * to ensure hybrid tests can run outside of 'bun test' mode.
 */
import { plugin } from "bun";
import path from "path";
import fs from "fs";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, withTempDir, spyOn, jest, vi, mock } from "./shims.js";

// Intercept 'bun:test' imports and redirect them to our shims
const shimsPath = path.join(import.meta.dir, "shims.js");

// Intercept and rewrite test files to bypass 'bun:test' built-ins
plugin({
  name: "test-file-rewriter",
  setup(build) {
    build.onLoad({ filter: /\.(t|test|tuit|it)\.(js|ts)$/ }, async (args) => {
      let code = await fs.promises.readFile(args.path, 'utf8');
      if (code.includes('bun:test')) {
        // Comment out bun:test imports so they fall back to our global shims
        // Support multi-line imports
        code = code.replace(/import\s+[\s\S]*?from\s+["']bun:test["'];?/g, (m) => {
          return m.split('\n').map(l => '// [utest-shim] ' + l).join('\n');
        });
      }
      return {
        contents: code,
        loader: args.path.endsWith('.ts') ? 'ts' : 'js',
      };
    });
  },
});

globalThis.utest = true;
const globals = {
  describe, it, expect,
  beforeAll, afterAll, beforeEach, afterEach,
  withTempDir, spyOn, jest, vi, mock
};

for (const [k, v] of Object.entries(globals)) {
  try {
    Object.defineProperty(globalThis, k, {
      value: v,
      configurable: true,
      writable: true,
      enumerable: true
    });
  } catch (e) {
    globalThis[k] = v;
  }
}

// console.warn("Unified runner shims installed.");
