import { existsSync, readFileSync } from 'fs'
import { join, dirname, resolve } from 'path'

/**
 * Shims a test file for safe, idempotent execution in a shared process.
 * rewrites imports, injects globals, and adds guards for prototype modification.
 */
export function shim(content, file) {
  let shimmed = content;
  // Strip hashbang if present
  shimmed = shimmed.replace(/^#!.*\n/, '\n')
  
  // Eliminate bun:test imports first so they don't block `safe` global evaluation!
  shimmed = shimmed.replace(/^import\s+[\s\S]*?\s+from\s+["']bun:test["'];?\s*/mg, (m) => '\n'.repeat(m.split('\n').length - 1))
  shimmed = shimmed.replace(/const\s+[\s\S]*?\s+=\s+require\(["']bun:test["']\);?/mg, (m) => '\n'.repeat(m.split('\n').length - 1))

  const globals = ['test', 'expect', 'describe', 'it', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll', 'check', 'checkFail']
  const safe = globals.filter(g => {
    // Check against the string AFTER removing bun:test imports
    if (new RegExp(`\\b(?:function|const|let|var|async)\\s+${g}\\b`).test(shimmed)) return false
    if (new RegExp(`\\bimport\\s+${g}\\b|\\bimport\\s*\\{[^}]*\\b${g}\\b`).test(shimmed)) return false
    return true
  })
  const globalsLine = safe.length > 0 ? `var { ${safe.join(', ')} } = globalThis;\n` : ''
  // Inject __dirname/__filename if used but not defined
  const usesDirname = /\b(__dirname|__filename)\b/.test(shimmed)
  const definesDirname = /\bconst\s+(__dirname|__filename)\b/.test(shimmed)
  const dirnameOverride = `import { fileURLToPath as __utestFUTP } from 'url'; import { dirname as __utestDirname } from 'path'; const __filename = ${JSON.stringify(file)}; const __dirname = __utestDirname(__filename);\n`
  
  const prototypeGuard = `
    const __origODP = Object.defineProperty;
    Object.defineProperty = function(obj, prop, desc) {
      try { return __origODP.apply(Object, arguments); }
      catch (e) {
        if (e.message.includes('unconfigurable')) {
          if (desc.get || desc.set) {
            // If it has a getter/setter, we can't easily merge, but we can usually skip if it's already there
            return obj;
          }
          try { obj[prop] = desc.value; return obj; } catch(err) {}
        }
        throw e;
      }
    };
  `;
  const injectedTop = (usesDirname && !definesDirname ? dirnameOverride : '') + prototypeGuard + globalsLine;
  const injectedLines = injectedTop.split('\n').length - 1;

  shimmed = shimmed.replace(/(import|from|import\(|require\()\s*(["'])(\.\.?\/[^"']+)\2/g, (m, t, q, p) => {
    let abs = resolve(dirname(file), p)
    if (!abs.endsWith('.js') && !abs.endsWith('.ts') && !abs.endsWith('.mjs')) {
      if (existsSync(abs + '.js')) abs += '.js'
      else if (existsSync(abs + '.ts')) abs += '.ts'
      else if (existsSync(abs + '.mjs')) abs += '.mjs'
    }
    return `${t} ${q}${abs}${q}`
  })
  
  shimmed = shimmed.replace(/\bimport\.meta\.url\b/g, JSON.stringify(`file://${file}`))
  shimmed = shimmed.replace(/\bimport\.meta\.dir\b/g, JSON.stringify(dirname(file)))

  // Construct final safe string by prepending the injected globals upfront
  const finalOutput = injectedTop + shimmed;
  
  return {
    content: finalOutput,
    map: (line) => {
      // Maps V8 error lines back to authored numbers
      return Math.max(1, line - injectedLines);
    }
  }
}
