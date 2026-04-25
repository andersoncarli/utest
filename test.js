/**
 * test.js - Minimal Test Collector
 *
 * Fundamental dependency for defining tests.
 * Decoupled from execution and visualization.
 */
import { TEST_DIR, ROOT, SRC_DIR } from './paths.js'

export function test(name, fn = () => { }, op = {}) {
  // Capture raw stack for postponed extraction
  const stack = new Error().stack

  // The test instance is a container for metadata and execution state
  const t = {
    name,
    fn,
    op: typeof op === 'boolean' ? { run: op } : op,
    stack,
    checks: [],
    tests: [],
    output: [],
    state: 'pending',
    parent: null,
    oncheck: (chk) => t.checks.push(chk)
  }

  // Nesting logic: 'this' will be the parent test instance when called via context
  // Context-bound tests will have 'this' set to the parent test object
  const parent = (this && this.tests) ? this : test.main
  if (parent && parent !== t) {
    t.parent = parent
    parent.tests.push(t)
    if (parent === test.main && test._loadingFile) {
      t.address = test._loadingFile
    }
  }

  return t
}

// Global registry - Unified across module instances
test.main = globalThis.test?.main || {
  name: 'Main',
  tests: [],
  checks: [],
  state: 'pending'
}

if (!globalThis.test) {
  globalThis.test = test
}
globalThis.test.main = test.main

// Shared loading state for address capture - Unified via shared test.main object
Object.defineProperty(test, '_loadingFile', {
  get: () => test.main._loadingFile,
  set: (v) => { test.main._loadingFile = v },
  configurable: true
})



test.ROOT = ROOT
test.TEST_DIR = TEST_DIR
test.SRC_DIR = SRC_DIR

test.context = {} // For core.js injection

test.todo = (name, fn) => test(name, fn, { todo: true })
test.skip = (name, fn) => test(name, fn, { skip: true })
test.it = test

export default test
