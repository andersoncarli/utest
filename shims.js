/**
 * shims.js - Bun/Jest Global Compatibility Layer
 *
 * Provides mocks for describe(), it(), expect(), and lifecycle hooks
 * to allow hybrid Bun tests to run in our unified runner.
 */
import test from './test.js'
import check from '../utils/src/check.js'
import { withTempDir } from '../lib/withTempDir.js'

export { withTempDir, test }

export function describe(name, fn) {
  const t = test(name, fn)
  // Auto-execute the block to register inner tests immediately
  const context = {
    test: test.bind(t),
    describe: describe.bind(t),
    it: it.bind(t),
    beforeAll: (f) => f(),
    afterAll: (f) => {},
    beforeEach: (f) => {},
    afterEach: (f) => {},
    expect: (a) => expect(a, t),
    withTempDir
  }
  // In describe blocks, we execute synchronously to collect children
  try {
    fn.call(t, context)
  } catch (e) {
    t.state = 'exception'
    t.error = e
  }
}

export function it(name, fn) {
  return test(name, fn)
}
it.todo = (name, fn) => test(name, fn, { todo: true })
it.skip = (name, fn) => test(name, fn, { skip: true })
test.todo = it.todo
test.skip = it.skip

export function expect(a) {
  const chk = (cond, expected) => check(cond, expected)

  const matchers = (val) => ({
    toBe: (b) => chk(val, b),
    toEqual: (b) => chk(val, b),
    toStrictEqual: (b) => chk(val, b),
    toBeGreaterThan: (b) => chk(val > b, true),
    toBeGreaterThanOrEqual: (b) => chk(val >= b, true),
    toBeLessThan: (b) => chk(val < b, true),
    toBeLessThanOrEqual: (b) => chk(val <= b, true),
    toContain: (b) => chk(val?.includes?.(b), true),
    toBeTruthy: () => chk(!!val, true),
    toBeFalsy: () => chk(!val, true),
    toBeDefined: () => chk(val !== undefined, true),
    toBeUndefined: () => chk(val === undefined, true),
    toBeNull: () => chk(val === null, true),
    toBeInstanceOf: (C) => chk(val instanceof C, true),
    toMatch: (re) => chk(re.test(val), true),
    toHaveBeenCalled: () => chk(val?.calls?.length > 0, true),
    toHaveBeenCalledWith: (...args) => chk(val?.calls?.some(c => JSON.stringify(c) === JSON.stringify(args)), true),
    toHaveLength: (l) => chk(val?.length === l, true),
    toHaveProperty: (p, v) => chk(v !== undefined ? val?.[p] === v : p in (val || {}), true),
    toBeTypeOf: (t) => chk(typeof val === t, true),
    toThrow: (msg) => {
       try { 
         const fn = typeof val === 'function' ? val : () => { throw val }
         fn(); chk(false, true) 
       } 
       catch(e) { chk(msg ? (e.message || String(e)).includes(msg) : true, true) }
    },
    not: {
      toBe: (b) => chk(val !== b, true),
      toEqual: (b) => chk(val !== b, true),
      toStrictEqual: (b) => chk(val !== b, true),
      toContain: (b) => chk(!val?.includes?.(b), true),
      toBeTruthy: () => chk(!val, true),
      toBeFalsy: () => chk(!!val, true),
      toBeNull: () => chk(val !== null, true),
      toBeDefined: () => chk(val === undefined, true),
      toBeUndefined: () => chk(val !== undefined, true),
      toThrow: (msg) => {
        try { 
          const fn = typeof val === 'function' ? val : () => { throw val }
          fn(); chk(true, true) 
        } 
        catch(e) { chk(false, true) }
      }
    }
  });

  const base = matchers(a);
  base.resolves = {
    get not() { return matchers(a.then(v => v)).not },
    toBe: async (b) => chk(await a, b),
    toEqual: async (b) => chk(await a, b),
    toBeTruthy: async () => chk(!!(await a), true),
    toBeFalsy: async () => chk(!(await a), true),
    toContain: async (b) => chk((await a)?.includes?.(b), true),
  };
  base.rejects = {
    get not() { return matchers(a.catch(e => e)).not },
    toThrow: async (msg) => {
      try { await a; chk(false, true) }
      catch(e) { chk(msg ? (e.message || String(e)).includes(msg) : true, true) }
    },
    toBe: async (b) => { try { await a; chk(false, true) } catch(e) { chk(e, b) } }
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

export const beforeAll = (fn) => fn() 
export const afterAll = (fn) => {}
export const beforeEach = (fn) => {}
export const afterEach = (fn) => {}

export function installShims() {
  Object.assign(globalThis, {
    describe, it, expect, 
    beforeAll, afterAll, beforeEach, afterEach,
    withTempDir, spyOn, jest, vi, mock
  })
}
