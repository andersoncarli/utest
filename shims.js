/**
 * shims.js - Bun/Jest Global Compatibility Layer
 *
 * Provides mocks for describe(), it(), expect(), and lifecycle hooks
 * to allow hybrid Bun tests to run in our unified runner.
 */
import test from './test.js'
import check from './check.js'
import { withTempDir } from '../utils/src/withTempDir.js'

export { withTempDir, test, check }

export function describe(name, fn) {
  const t = test(name, fn)
  t._describe = true
  t._beforeAll = []
  t._afterAll  = []
  t._beforeEach = []
  t._afterEach  = []

  // Global lifecycle hooks attach to the innermost describe via a stack
  _describeStack.push(t)
  const context = {
    test:       (n, f, o) => { let r; test.scope(t, () => { r = test.call(t, n, f, o) }); return r },
    describe:   (n, f) => describe.call(t, n, f),
    it:         (n, f, o) => { let r; test.scope(t, () => { r = test.call(t, n, f, o) }); return r },
    beforeAll:  (f) => t._beforeAll.push(f),
    afterAll:   (f) => t._afterAll.push(f),
    beforeEach: (f) => t._beforeEach.push(f),
    afterEach:  (f) => t._afterEach.push(f),
    expect:     (a) => expect(a, t),
    withTempDir
  }
  // Use test.scope so inner test() calls (even in arrow functions) go into t
  try { test.scope(t, () => fn.call(t, context)) } catch (e) { t.state = 'exception'; t.error = e }
  _describeStack.pop()
}

// Stack so globalThis.beforeAll/afterAll know which describe they're inside
const _describeStack = []
export const beforeAll  = (f) => { const t = _describeStack.at(-1); if (t) t._beforeAll.push(f); else f() }
export const afterAll   = (f) => { const t = _describeStack.at(-1); if (t) t._afterAll.push(f) }
export const beforeEach = (f) => {
  const t = _describeStack.at(-1) ?? test.current
  if (t) { if (!t._beforeEach) t._beforeEach = []; t._beforeEach.push(f) }
}
export const afterEach  = (f) => {
  const t = _describeStack.at(-1) ?? test.current
  if (t) { if (!t._afterEach) t._afterEach = []; t._afterEach.push(f) }
}

export function it(name, fn) {
  return test(name, fn)
}
it.todo = (name, fn) => test(name, fn, { todo: true })
it.skip = (name, fn) => test(name, fn, { skip: true })
test.todo = it.todo
test.skip = it.skip

export function expect(a) {
  const partialMatch = (actual, expected) => {
    if (expected && expected.__utestObjectContaining) expected = expected.value
    if (expected === actual) return true
    if (expected instanceof RegExp) return expected.test(actual)
    if (!expected || typeof expected !== 'object') return Object.is(actual, expected)
    if (!actual || typeof actual !== 'object') return false
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || actual.length < expected.length) return false
      return expected.every((v, i) => partialMatch(actual[i], v))
    }
    return Object.entries(expected).every(([k, v]) => partialMatch(actual[k], v))
  }

  const matchers = (val) => ({
    toBe: (b) => check(val, b),
    toEqual: (b) => check(val, b),
    toStrictEqual: (b) => check(val, b),
    toBeTrue: () => check(val === true),
    toBeFalse: () => check(val === false),
    toBeGreaterThan: (b) => check(val > b),
    toBeGreaterThanOrEqual: (b) => check(val >= b),
    toBeLessThan: (b) => check(val < b),
    toBeLessThanOrEqual: (b) => check(val <= b),
    toContain: (b) => check(val?.includes?.(b)),
    toBeTruthy: () => check(!!val),
    toBeFalsy: () => check(!val),
    toBeDefined: () => check(val !== undefined),
    toBeUndefined: () => check(val === undefined),
    toBeNull: () => check(val === null),
    toBeInstanceOf: (C) => check(val instanceof C),
    toMatch: (re) => check(re.test(val)),
    toHaveBeenCalled: () => check(val?.calls?.length > 0),
    toHaveBeenCalledWith: (...args) => check(val?.calls?.some(c => JSON.stringify(c) === JSON.stringify(args))),
    toHaveLength: (l) => check(val?.length === l),
    toHaveProperty: (p, v) => check(v !== undefined ? val?.[p] === v : p in (val || {})),
    toBeTypeOf: (t) => check(typeof val === t),
    toBeCloseTo: (b, precision = 2) => check(Math.abs(Number(val) - Number(b)) < Math.pow(10, -precision) / 2),
    toMatchObject: (b) => check(partialMatch(val, b)),
    toThrow: (msg) => {
       try {
         const fn = typeof val === 'function' ? val : () => { throw val }
         fn(); check(false)
       }
       catch(e) {
         if (!msg) return check(true)
         if (msg instanceof RegExp) return check(msg.test(e.message || String(e)))
         if (typeof msg === 'function') return check(e instanceof msg)
         return check((e.message || String(e)).includes(msg))
       }
    },
    not: {
      toBe: (b) => check(val !== b),
      toEqual: (b) => check(val !== b),
      toStrictEqual: (b) => check(val !== b),
      toContain: (b) => check(!val?.includes?.(b)),
      toBeTruthy: () => check(!val),
      toBeFalsy: () => check(!!val),
      toBeNull: () => check(val !== null),
      toBeDefined: () => check(val === undefined),
      toBeUndefined: () => check(val !== undefined),
      toThrow: (msg) => {
        try {
          const fn = typeof val === 'function' ? val : () => { throw val }
          fn(); check(true)
        }
        catch(e) { check(false) }
      }
    }
  });

  const base = matchers(a);
  base.resolves = {
    get not() { return matchers(a.then(v => v)).not },
    toBe:          async (b) => check(await a, b),
    toEqual:       async (b) => check(await a, b),
    toStrictEqual: async (b) => check(await a, b),
    toBeTruthy:    async ()  => check(!!(await a)),
    toBeFalsy:     async ()  => check(!(await a)),
    toBeNull:      async ()  => check(await a, null),
    toBeUndefined: async ()  => check((await a) === undefined),
    toBeDefined:   async ()  => check((await a) !== undefined),
    toContain:     async (b) => check((await a)?.includes?.(b)),
    toHaveLength:  async (b) => check((await a)?.length, b),
  };
  base.rejects = {
    get not() { return matchers(a.catch(e => e)).not },
    toThrow: async (msg) => {
      try { await a; check(false) }
      catch(e) { check(msg ? (e.message || String(e)).includes(msg) : true) }
    },
    toBe:          async (b) => { try { await a; check(false) } catch(e) { check(e, b) } },
    toEqual:       async (b) => { try { await a; check(false) } catch(e) { check(e, b) } },
    toBeDefined:   async ()  => { try { await a; check(false) } catch { check(true) } },
  };

  return base;
}

expect.objectContaining = (value) => ({ __utestObjectContaining: true, value })

export function spyOn(obj, method) {
  const original = obj[method]
  const spy = (...args) => {
    spy.calls.push(args)
    if (spy.i) return spy.i(...args)
    if (spy.v !== undefined) return spy.v
    return original.apply(obj, args)
  }
  spy.calls = []
  spy.i = null
  spy.v = undefined
  spy.mockImplementation = (fn) => { spy.i = fn; return spy }
  spy.mockReturnValue = (v) => { spy.v = v; return spy }
  spy.mockRestore = () => { obj[method] = original }
  obj[method] = spy
  return spy
}

export const jest = { spyOn, fn: (impl) => { const s = spyOn({ f: impl || (() => {}) }, 'f'); s.mockImplementation = impl; return s } }
export const vi = jest
export const mock = jest


export function installShims() {
  Object.assign(globalThis, {
    describe, it, expect,
    beforeAll, afterAll, beforeEach, afterEach,
    withTempDir, spyOn, jest, vi, mock
  })
}
