/**
 * shims.js - Bun/Jest Global Compatibility Layer
 *
 * Provides mocks for describe(), it(), expect(), and lifecycle hooks
 * to allow hybrid Bun tests to run in our unified runner.
 */
import test from './test.js'
import check from './check.js'
import { withTempDir } from '../lib/withTempDir.js'

export { withTempDir, test, check }

export function describe(name, fn) {
  const t = test(name, fn)
  t._describe = true
  t._beforeAll = []
  t._afterAll  = []

  // Global lifecycle hooks attach to the innermost describe via a stack
  _describeStack.push(t)
  const context = {
    test:       test.bind(t),
    describe:   describe.bind(t),
    it:         it.bind(t),
    beforeAll:  (f) => t._beforeAll.push(f),
    afterAll:   (f) => t._afterAll.push(f),
    beforeEach: (f) => {},
    afterEach:  (f) => {},
    expect:     (a) => expect(a, t),
    withTempDir
  }
  try { fn.call(t, context) } catch (e) { t.state = 'exception'; t.error = e }
  _describeStack.pop()
}

// Stack so globalThis.beforeAll/afterAll know which describe they're inside
const _describeStack = []
export const beforeAll  = (f) => { const t = _describeStack.at(-1); if (t) t._beforeAll.push(f); else f() }
export const afterAll   = (f) => { const t = _describeStack.at(-1); if (t) t._afterAll.push(f) }
export const beforeEach = (f) => {}
export const afterEach  = (f) => {}

export function it(name, fn) {
  return test(name, fn)
}
it.todo = (name, fn) => test(name, fn, { todo: true })
it.skip = (name, fn) => test(name, fn, { skip: true })
test.todo = it.todo
test.skip = it.skip

export function expect(a) {
  const matchers = (val) => ({
    toBe: (b) => check(val, b),
    toEqual: (b) => check(val, b),
    toStrictEqual: (b) => check(val, b),
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
    toThrow: (msg) => {
       try {
         const fn = typeof val === 'function' ? val : () => { throw val }
         fn(); check(false)
       }
       catch(e) { check(msg ? (e.message || String(e)).includes(msg) : true) }
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
    toBe: async (b) => check(await a, b),
    toEqual: async (b) => check(await a, b),
    toBeTruthy: async () => check(!!(await a)),
    toBeFalsy: async () => check(!(await a)),
    toContain: async (b) => check((await a)?.includes?.(b)),
  };
  base.rejects = {
    get not() { return matchers(a.catch(e => e)).not },
    toThrow: async (msg) => {
      try { await a; check(false) }
      catch(e) { check(msg ? (e.message || String(e)).includes(msg) : true) }
    },
    toBe: async (b) => { try { await a; check(false) } catch(e) { check(e, b) } }
  };

  return base;
}

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
