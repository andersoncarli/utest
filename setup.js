import { plugin } from "bun"
import fs from "fs"
import path from "path"
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, withTempDir, spyOn, jest, vi, mock, test } from "./shims.js"
import is        from "../utils/src/is.js"
import toSource  from "../utils/src/toSource.js"
import callstack from "../utils/src/callstack.js"
import normalize from "../utils/src/normalize.js"
import cl        from "../utils/src/cl.js"
import hash53    from "../utils/src/hash53.js"
import forEach   from "../utils/src/forEach.js"
import dotfill   from "../utils/src/dotfill.js"

// Globals required by utils/src/callstack.js (used inside function bodies, not at import time)
globalThis.fs   = fs
globalThis.path = path

// Intercept test file loads: shadow Bun's built-in test/describe/it with our shims
const shimsPath = new URL('./shims.js', import.meta.url).pathname
plugin({
  name: "test-file-rewriter",
  setup(build) {
    build.onLoad({ filter: /\.(t|test|tuit|it)\.(js|ts)$/ }, async (args) => {
      let code = await fs.promises.readFile(args.path, 'utf8')
      // Comment out any explicit bun:test imports
      if (code.includes('bun:test')) {
        code = code.replace(/import\s+[\s\S]*?from\s+["']bun:test["'];?/g, m =>
          m.split('\n').map(l => '// [utest-shim] ' + l).join('\n'))
      }
      // Prepend our shims import (ESM only) to shadow Bun's module-scoped test/describe/it/expect
      const isCjs = /\bmodule\.exports\b|\brequire\s*\(/.test(code)
      if (!isCjs) {
        const header = `import { test, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, check } from ${JSON.stringify(shimsPath)};\n`
        code = header + code
      }
      return { contents: code, loader: args.path.endsWith('.ts') ? 'ts' : 'js' }
    })
  }
})

globalThis.utest = true

const globals = { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, withTempDir, spyOn, jest, vi, mock, test,
                  is, toSource, callstack, normalize, cl, hash53, forEach, dotfill }
for (const [k, v] of Object.entries(globals)) {
  try {
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true, enumerable: true })
  } catch {
    globalThis[k] = v
  }
}
// Ensure test.main is synced after any override
globalThis.test.main = test.main
