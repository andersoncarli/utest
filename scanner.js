#!/usr/bin/env bun
// scanner.js — Coverage manifest. No file reads.
// Source files as keys; test files nested under "tests".
// cache:N on test entry = N checks passed last run (timestamp protocol).
// cache:N on source entry = self-validating file.
import fs from 'fs'
import path from 'path'
import YAML from 'yaml'
import test from './test.js'

const SKIP_DIRS    = new Set(['node_modules', '.git', 'archive', 'archived', 'dist', 'tmp', 'temp'])
const TEST_PATTERN = /\.(t|test|tuit|it)\.(js|ts)$/
const DEFAULT_INCLUDES = ['**/*.t.js', '**/*.test.js', '**/*.tuit.js']

const roundToMin = ms => Math.floor(ms / 60000) * 60000

function loadConfig(cwd) {
  const p = path.join(cwd, 'TEST.yaml')
  try { return { config: YAML.parse(fs.readFileSync(p, 'utf8')) || {}, configPath: p } }
  catch { return { config: {}, configPath: '' } }
}

function globToRegex(glob) {
  return new RegExp('^' + glob
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\*\\\*\//g, '(?:.*/)?')
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^/]*')
    .replace(/\\\?/g, '.') + '$')
}

const matches = (rel, pats) => pats.some(p => globToRegex(p).test(rel))

function findBase(abs) {
  const dir = path.dirname(abs), name = path.basename(abs)
  for (const v of [
    name.replace(/\.(integration|rendering)\.t\.(js|ts)$/, '.js'),
    name.replace(/\.t\.(js|ts)$/, '.js'),
    name.replace(/\.test\.(js|ts)$/, '.js'),
    name.replace(/\.it\.(js|ts)$/, '.js'),
  ]) {
    if (v === name) continue
    const full = path.join(dir, v)
    if (fs.existsSync(full)) return full
  }
  return null
}

function cacheCount(abs, baseAbs) {
  try {
    const testMs = fs.statSync(abs).mtimeMs
    const refMs  = baseAbs ? fs.statSync(baseAbs).mtimeMs : testMs
    const ms     = Math.round(testMs - roundToMin(refMs))
    if (ms > 0 && ms < 1000) return ms
  } catch {}
  return null
}

function collect(dir, opts, out = []) {
  const { includes, excludes, cwd } = opts
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    const rel  = path.relative(cwd, full)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !matches(rel, excludes)) collect(full, opts, out)
      continue
    }
    if (!entry.name.endsWith('.js') && !entry.name.endsWith('.ts')) continue
    if (entry.name.split('.').some(s => s.startsWith('_') || s.endsWith('_'))) continue
    if (matches(rel, includes) && !matches(rel, excludes)) out.push({ full, rel, name: entry.name })
  }
  return out
}

function buildManifest(files, cwd) {
  const m = {}
  for (const { full, rel, name } of files) {
    if (TEST_PATTERN.test(name)) {
      const baseAbs = findBase(full)
      const cache   = cacheCount(full, baseAbs)
      const rec     = cache !== null ? { cache } : {}
      if (baseAbs) {
        const br = path.relative(cwd, baseAbs)
        if (!m[br]) m[br] = {}
        if (!m[br].tests) m[br].tests = {}
        m[br].tests[name] = rec
      } else {
        m[rel] = rec
      }
    } else if (!m[rel]) {
      const cache = cacheCount(full, null)
      m[rel] = cache !== null ? { cache } : {}
    }
  }
  return m
}

export async function getManifest(targets = ['.'], options = {}) {
  const { phase = 'unit', cwd = process.cwd() } = options
  const { config, configPath } = loadConfig(cwd)
  const pConfig  = config[phase] || {}
  const includes = pConfig.include  || DEFAULT_INCLUDES
  const excludes = [...(config.exclude || []), ...(pConfig.exclude || [])]
  const opts     = { includes, excludes, cwd }
  const files    = []

  for (const target of targets) {
    const abs = path.resolve(cwd, target)
    if (!fs.existsSync(abs)) continue
    if (fs.statSync(abs).isDirectory()) collect(abs, opts, files)
    else files.push({ full: abs, rel: path.relative(cwd, abs), name: path.basename(abs) })
  }

  const manifest = buildManifest(files, cwd)
  const entries  = Object.entries(manifest).filter(([k]) => !k.startsWith('_'))
  const isTest   = n => TEST_PATTERN.test(path.basename(n))
  const filesCount = files.filter(f => !TEST_PATTERN.test(f.name)).length
  const coveredCount = entries.filter(([, v]) => v.tests || v.cache).length
  
  manifest._FILTER  = configPath ? path.relative(cwd, configPath) : ''
  manifest._SUMMARY = {
    files:     filesCount,
    covered:   coveredCount,
    uncovered: filesCount - coveredCount,
  }
  return manifest
}

export { test }
export default getManifest

if (import.meta.main) {
  const args    = process.argv.slice(2)
  const phase   = args.find(a => a.startsWith('--phase='))?.split('=')[1] || 'unit'
  let targets = args.filter(a => !a.startsWith('-'))
  if (!targets.length) targets=['.']

  const { _SUMMARY, _FILTER, ...files } = await getManifest(targets, { phase })
  const lines = Object.entries(files).sort(([a],[b]) => a.localeCompare(b))
    .map(([k, v]) => `"${k}": ${JSON.stringify(v)}`).join(',\n')
  console.log(`{"scanner-result":{\n"_TARGET":${JSON.stringify(process.cwd())},\n"_FILTER":${JSON.stringify(_FILTER)},\n${lines},\n"_SUMMARY":${JSON.stringify(_SUMMARY)}\n}}`)
}
