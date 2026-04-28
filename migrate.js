#!/usr/bin/env bun
// migrate.js — convert bun:test expect() style to native check() calls
//
// Safe (deterministic) transforms only. Files with describe/beforeAll/
// beforeEach/afterAll/afterEach are skipped — those need manual work.
//
// Usage:
//   ./utest/migrate.js [--dry] [path]     # path defaults to .

import fs   from 'fs'
import path from 'path'

// ── Balanced-paren extractor ──────────────────────────────────────
// Returns { inner, end } where inner is content between parens and
// end is the index after the closing paren.
function extractBalanced(src, openIdx) {
  let depth = 0, i = openIdx
  while (i < src.length) {
    const c = src[i]
    if (c === '(' || c === '[' || c === '{') { depth++; i++; continue }
    if (c === ')' || c === ']' || c === '}') {
      depth--
      if (depth === 0) return { inner: src.slice(openIdx + 1, i).trim(), end: i + 1 }
      i++; continue
    }
    // Skip strings
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i++
        i++
      }
      i++; continue
    }
    i++
  }
  return null
}

// ── Matcher → check() replacement table ──────────────────────────
function replacement(subj, method, arg, isNot) {
  if (isNot) {
    switch (method) {
      case 'toBe':
      case 'toEqual':
      case 'toStrictEqual':  return `checkFail(${subj}, ${arg})`
      case 'toContain':      return `check(!((${subj})?.includes?.(${arg})))`
      case 'toBeTruthy':     return `check(!(${subj}))`
      case 'toBeFalsy':      return `check(!!(${subj}))`
      case 'toBeNull':       return `check((${subj}) !== null)`
      case 'toBeUndefined':  return `check((${subj}) !== undefined)`
      case 'toBeDefined':    return `check((${subj}) === undefined)`
      default: return null
    }
  }
  switch (method) {
    case 'toBe':
    case 'toEqual':
    case 'toStrictEqual':       return `check(${subj}, ${arg})`
    case 'toContain':           return `check((${subj})?.includes?.(${arg}))`
    case 'toMatch':             return `check((${arg}).test(${subj}))`
    case 'toHaveLength':        return `check((${subj})?.length, ${arg})`
    case 'toBeGreaterThan':     return `check((${subj}) > ${arg})`
    case 'toBeGreaterThanOrEqual': return `check((${subj}) >= ${arg})`
    case 'toBeLessThan':        return `check((${subj}) < ${arg})`
    case 'toBeLessThanOrEqual': return `check((${subj}) <= ${arg})`
    case 'toBeInstanceOf':      return `check((${subj}) instanceof ${arg})`
    case 'toBeTypeOf':          return `check(typeof (${subj}), ${arg})`
    case 'toBeTruthy':          return `check(${subj})`
    case 'toBeFalsy':           return `check(!(${subj}))`
    case 'toBeNull':            return `check(${subj}, null)`
    case 'toBeUndefined':       return `check(${subj}, undefined)`
    case 'toBeDefined':         return `check((${subj}) !== undefined)`
    case 'toHaveProperty': {
      // arg may be 'key' or 'key, value'
      const comma = arg.indexOf(',')
      if (comma >= 0) {
        const k = arg.slice(0, comma).trim()
        const v = arg.slice(comma + 1).trim()
        return `check((${subj})?.[${k}], ${v})`
      }
      return `check(${arg} in ((${subj}) || {}))`
    }
    case 'toHaveBeenCalled':     return `check((${subj})?.calls?.length > 0)`
    case 'toHaveBeenCalledWith':
      return `check((${subj})?.calls?.some(c => JSON.stringify(c) === JSON.stringify([${arg}])))`
    default: return null
  }
}

const KNOWN_METHODS = new Set([
  'toBe','toEqual','toStrictEqual','toContain','toMatch','toHaveLength',
  'toBeGreaterThan','toBeGreaterThanOrEqual','toBeLessThan','toBeLessThanOrEqual',
  'toBeInstanceOf','toBeTypeOf','toBeTruthy','toBeFalsy','toBeNull',
  'toBeUndefined','toBeDefined','toHaveProperty','toHaveBeenCalled','toHaveBeenCalledWith',
])

// ── Main transform ────────────────────────────────────────────────
function transform(src) {
  let out = ''
  let i = 0
  let changed = 0

  while (i < src.length) {
    // Match `expect(`
    const expectIdx = src.indexOf('expect(', i)
    if (expectIdx === -1) { out += src.slice(i); break }

    // Make sure it's not inside a string (simple check: skip if preceded by quote context)
    // For now, trust that most expect() calls are top-level statements
    out += src.slice(i, expectIdx)
    i = expectIdx + 'expect'.length  // i now at '('

    const subj = extractBalanced(src, i)
    if (!subj) { out += 'expect'; continue }

    // After subject: look for .not.method( or .method(
    const rest = src.slice(subj.end)
    let isNot = false
    let methodMatch

    if ((methodMatch = rest.match(/^\.not\.([A-Za-z]+)\s*\(/))) {
      isNot = true
    } else {
      methodMatch = rest.match(/^\.([A-Za-z]+)\s*\(/)
    }

    if (!methodMatch) { out += `expect(${subj.inner})`; i = subj.end; continue }

    const method = isNot ? methodMatch[1] : methodMatch[1]
    if (!KNOWN_METHODS.has(method)) { out += `expect(${subj.inner})`; i = subj.end; continue }

    const dotPrefix = isNot ? `.not.${method}` : `.${method}`
    const argOpenIdx = subj.end + dotPrefix.length
    // find the opening paren
    const parenPos = src.indexOf('(', argOpenIdx)
    if (parenPos === -1 || parenPos > argOpenIdx + 1) {
      out += `expect(${subj.inner})`; i = subj.end; continue
    }

    const arg = extractBalanced(src, parenPos)
    if (!arg) { out += `expect(${subj.inner})`; i = subj.end; continue }

    const repl = replacement(subj.inner, method, arg.inner, isNot)
    if (!repl) { out += `expect(${subj.inner})`; i = subj.end; continue }

    out += repl
    i = arg.end
    changed++
  }

  return { src: out, changed }
}

// ── Remove / strip bun:test imports ──────────────────────────────
function stripBunImport(src) {
  // Remove entire import line from 'bun:test'
  return src.replace(/^import\s+\{[^}]*\}\s+from\s+["']bun:test["'];?\n?/gm, '')
}

// ── it( → test( ───────────────────────────────────────────────────
function itToTest(src) {
  // Replace `it(` but not `it.todo(` or `it.skip(` — keep those as test.todo/test.skip
  // Also don't replace inside strings (best-effort)
  return src.replace(/\bit\(/g, 'test(')
}

// ── SKIP GUARD: files with lifecycle hooks ────────────────────────
const LIFECYCLE = /\b(describe|beforeAll|beforeEach|afterAll|afterEach)\s*\(/

// ── File processing ───────────────────────────────────────────────
function processFile(filePath, dry) {
  const original = fs.readFileSync(filePath, 'utf8')

  if (LIFECYCLE.test(original)) {
    return { skipped: true, reason: 'has describe/lifecycle' }
  }
  if (!original.includes('expect(') && !original.includes("from 'bun:test'") && !original.includes('from "bun:test"') && !/\bit\(/.test(original)) {
    return { skipped: true, reason: 'nothing to do' }
  }

  let src = original
  src = stripBunImport(src)
  src = itToTest(src)
  const { src: transformed, changed } = transform(src)

  if (transformed === original) return { skipped: true, reason: 'no change' }

  if (!dry) fs.writeFileSync(filePath, transformed)
  return { changed, lines: transformed.split('\n').length }
}

// ── CLI ───────────────────────────────────────────────────────────
const args    = process.argv.slice(2)
const dry     = args.includes('--dry')
const target  = args.find(a => !a.startsWith('-')) || '.'
const rootAbs = path.resolve(target)

// Find test files
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) walk(abs, out)
    else if (/\.(t|test)\.(js|ts)$/.test(e.name)) out.push(abs)
  }
  return out
}

const stat = fs.statSync(rootAbs, { throwIfNoEntry: false })
const files = stat?.isFile() ? [rootAbs] : walk(rootAbs)
let totalChanged = 0, totalSkipped = 0, totalFiles = 0

for (const f of files) {
  const rel = path.relative(rootAbs, f)
  const result = processFile(f, dry)
  if (result.skipped) { totalSkipped++; continue }
  totalFiles++
  totalChanged += result.changed
  console.log(`${dry ? '[dry] ' : ''}${rel}  +${result.changed} conversions`)
}

console.log(`\n${dry ? '[dry-run] ' : ''}${totalFiles} files converted, ${totalChanged} expect() calls replaced, ${totalSkipped} skipped`)
