import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { parse } from "bun:yaml";
import { minimatch } from "minimatch";

// ─── Parsing ──────────────────────────────────────────────────
function readConfig(path) {
  return parse(readFileSync(path, "utf8"));
}

// ─── File Walking ─────────────────────────────────────────────
function walk(dir, filter) {
  const entry = e => e.isDirectory()
    ? walk(join(dir, e.name), filter)
    : filter(join(dir, e.name)) ? [join(dir, e.name)] : [];

  return readdirSync(dir, { withFileTypes: true }).flatMap(entry);
}

// ─── Filtering ────────────────────────────────────────────────
function included(include, ignore) {
  const matches  = patterns => path => patterns.some(p => minimatch(path, p));
  const included = matches(include);
  const ignored  = matches(ignore);
  return path => included(path) && !ignored(path);
}

// ─── Metadata ─────────────────────────────────────────────────
function metadata(path) {
  const s = statSync(path);
  return { path, size: s.size, modified: s.mtimeMs };
}

// ─── Pipeline ─────────────────────────────────────────────────
function run(root, configPath) {
  const { include, ignore } = readConfig(configPath);
  const toEntry = f => ({ [f]: metadata(f) });
  const print   = obj => console.log(JSON.stringify(obj));

  walk(root, included(include, ignore))
    .map(toEntry)
    .forEach(print);
}

// run(".", "TEST.yaml");

// And the TEST.yaml now looks like:
// yamlignore:
//   - "**/node_modules/**"
//   - "**/dist/**"
//   - "**/.git/**"

// include:
//   - "**/*.js"
//   - "**/*.ts"
