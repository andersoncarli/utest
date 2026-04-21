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

export function expect(a, t) {
  const chk = (cond, expected) => check.call(t, cond, expected)

  const matchers = (val) => ({
    toBe: (b) => chk(val, b),
    toEqual: (b) => chk(val, b),
    toStrictEqual: (b) => chk(val, b),
    toBeGreaterThan: (b) => chk(val > b, true),
    toBeLessThan: (b) => chk(val < b, true),
    toContain: (b) => chk(val?.includes?.(b), true),
    toBeTruthy: () => chk(!!val, true),
    toBeFalsy: () => chk(!val, true),
    toBeDefined: () => chk(val !== undefined, true),
    toBeUndefined: () => chk(val === undefined, true),
    toBeNull: () => chk(val === null, true),
    toBeInstanceOf: (C) => chk(val instanceof C, true),
    toMatch: (re) => chk(re.test(val), true),
    toThrow: (msg) => {
       try { 
         const fn = typeof val === 'function' ? val : () => { throw val }
         fn(); chk(false, true) 
       } 
       catch(e) { chk(msg ? (e.message || String(e)).includes(msg) : true, true) }
    },
    not: Object.keys({
      toBe: 1, toEqual: 1, toContain: 1, toBeNull: 1, toBeTruthy: 1, toBeFalsy: 1, toThrow: 1
    }).reduce((acc, k) => {
      acc[k] = (...args) => {
        const savedChk = check.call;
        let passed = false;
        // Mock check to invert it
        const mockT = { ...t, checks: { push: () => {} } }; 
        // This is tricky. Let's just do it manually.
        if (k === 'toBe') chk(val !== args[0], true);
        if (k === 'toEqual') chk(val !== args[0], true);
        if (k === 'toContain') chk(!val?.includes?.(args[0]), true);
        if (k === 'toBeNull') chk(val !== null, true);
        if (k === 'toBeTruthy') chk(!val, true);
        if (k === 'toBeFalsy') chk(!!val, true);
        if (k === 'toThrow') {
           try { val(); chk(true, true) } catch(e) { chk(false, true) }
        }
        return acc;
      };
      return acc;
    }, {})
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
    return spy.impl ? spy.impl(...args) : original.apply(obj, args)
  }
  spy.calls = []
  spy.mockImplementation = (fn) => { spy.impl = fn; return spy }
  spy.mockReturnValue = (val) => { spy.impl = () => val; return spy }
  spy.mockRestore = () => { obj[method] = original }
  obj[method] = spy
  return spy
}

export const beforeAll = (fn) => fn() 
export const afterAll = (fn) => {}
export const beforeEach = (fn) => {}
export const afterEach = (fn) => {}

export function installShims() {
  Object.assign(globalThis, {
    describe, it, expect, 
    beforeAll, afterAll, beforeEach, afterEach,
    withTempDir, spyOn
  })
}
