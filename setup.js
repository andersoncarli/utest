/**
 * setup.js - Runtime Environment Initializer
 *
 * Installs our custom globals and mocks built-in modules
 * to ensure hybrid tests can run outside of 'bun test' mode.
 */
import { plugin } from "bun";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "./shims.js";

// Intercept 'bun:test' imports and redirect them to our shims
plugin({
  name: "bun-test-mock",
  setup(build) {
    build.onResolve({ filter: /^bun:test$/ }, (args) => {
      return {
        path: import.meta.resolve("./shims.js"),
      };
    });
  },
});

// Install globals for files that don't import but rely on global scope
Object.assign(globalThis, {
  describe, it, expect,
  beforeAll, afterAll, beforeEach, afterEach
});

// console.warn("Unified runner shims installed.");
