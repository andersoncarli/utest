import { readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"
import { parse } from "yaml"
import { minimatch } from "minimatch";

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
  const s = statSync(path)
  return { path, size: s.size, modified: s.mtimeMs }
}

// ─── Pipeline ─────────────────────────────────────────────────
function run(root, configPath) {
  const config = parse(readFileSync(configPath, "utf8"))
  const { unit, exclude:ignore  } = config
  const includePaths = unit.include.map(d => join(root, d))
  const toEntry = f => ({ [f]: metadata(f) });
  const print = obj => console.log(JSON.stringify(obj));

  const tree = walk(root, included(includePaths, ignore))
  tree.map(toEntry)
    .forEach(print);
}

run(".", "TEST.yaml")