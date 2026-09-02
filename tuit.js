// utest/tuit.js — parser + executor para `.tuit`: JSON parcial + arte ASCII esperada,
// intercalados. `kinds.js` já reconhecia o sufixo (scanner + shim), mas nada executava o
// arquivo — `utest.js` faz `await import(entry.path)` em todo entry, e um `.tuit` não é um
// módulo ESM chamando `test()`.
//
// Blocos ACUMULAM: cada `{ ... }` é aplicado por cima do nó do bloco anterior (POJF
// transforma em lugar — `node(props)`), não uma árvore nova. `scl/filelist.tuit` depende
// disso: bloco 1 declara `{ 'f filelist': {...} }`, bloco 2 é só `{ files: [...] }`.
//
// Depende de `pixel`/`soml` globais já bootados (`TEST.boot.js` roda `bootstrap()` antes do
// scan) — nenhum import daqui, mesma convenção de `baseCtx` em `utest.js`.

const readBalancedObject = (lines, start) => {
  let i = start, depth = 0, inString = false, quote = '', escaped = false, collected = ''
  for (; i < lines.length; i++) {
    const line = lines[i]
    collected += (collected ? '\n' : '') + line
    for (const ch of line) {
      if (escaped) { escaped = false; continue }
      if (inString) {
        if (ch === '\\') escaped = true
        else if (ch === quote) { inString = false; quote = '' }
        continue
      }
      if (ch === "'" || ch === '"') { inString = true; quote = ch; continue }
      if (ch === '{') depth += 1
      else if (ch === '}') depth -= 1
    }
    if (depth === 0) return { objectText: collected, nextIndex: i + 1 }
  }
  throw new Error(`.tuit: objeto não fechado perto da linha ${start + 1}`)
}

const parseObjectLiteral = (src) => Function(`"use strict"; return (${src});`)()

// `·` marca célula vazia — é CONTEÚDO, não espaço de preenchimento; só espaço/tab de verdade
// no fim de linha é aparado. Uma linha toda `·` some se o trim tratar `·` como whitespace (o
// runner arquivado tinha esse bug: `[·\s]+$` zerava linhas de canvas vazio inteiras).
const normalizeFrame = (text) => {
  const lines = String(text ?? '').split('\n').map(l => l.replace(/[ \t]+$/g, ''))
  while (lines.length && lines[0] === '') lines.shift()
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n')
}

export function parseTuitText(text) {
  const lines = String(text ?? '').split('\n')
  const blocks = []
  let i = 0, pendingComment = null

  if (lines[0]?.trim() === '---') {
    i = 1
    while (i < lines.length && lines[i].trim() !== '---') i++
    i++
  }

  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) { i++; continue }
    if (line.startsWith('//')) { pendingComment = line.slice(2).trim() || null; i++; continue }
    if (!line.startsWith('{')) { i++; continue }

    const objectLine = i + 1
    const { objectText, nextIndex } = readBalancedObject(lines, i)
    const input = parseObjectLiteral(objectText)
    i = nextIndex

    const expectedLines = []
    for (; i < lines.length; i++) {
      const next = lines[i].trim()
      if (next.startsWith('{') || next.startsWith('//')) break
      expectedLines.push(lines[i])
    }

    blocks.push({
      name: pendingComment || `block-${String(blocks.length + 1).padStart(2, '0')}`,
      input, objectLine,
      expected: normalizeFrame(expectedLines.join('\n')),
    })
    pendingComment = null
  }

  return blocks
}

// Um bloco de UMA chave só `'id Type ...'` (o segundo token resolve por `pixel()`) é uma
// declaração de raiz NOVA — troca o nó de trabalho inteiro, o caso de `scl/panel.tuit` (cada
// bloco redeclara `'p Panel'` do zero). Qualquer outra forma é atualização PARCIAL sobre o
// nó atual — `_assign` (CLAUDE.md §primitivas: "sobrepõe o que nomeia, nunca remove"), o
// caso de `scl/filelist.tuit` (bloco 2 é só `{ files: [...] }`).
const isFreshRoot = (input) => {
  const keys = Object.keys(input)
  if (keys.length !== 1) return false
  const type = keys[0].trim().split(/\s+/)[1]
  return !!type && !!pixel(type)
}

// Roda um `.tuit` já parseado, relayoutando e re-renderizando a cada bloco — mesmo contrato
// de `node.box` não-destrutivo que qualquer app usa.
export function runTuitBlocks(blocks) {
  let node = null
  return blocks.map((block) => {
    node = (!node || isFreshRoot(block.input)) ? soml(block.input) : node._assign(block.input)
    const w = node.w ?? 80, h = node.h ?? 24
    pixel.layout(node, w, h)
    const actual = normalizeFrame(pixel.to('ascii', node, w, h, { fillChar: '·' }))
    return { ...block, actual, ok: actual === block.expected }
  })
}

export function runTuitText(text) {
  return runTuitBlocks(parseTuitText(text))
}

export default { parseTuitText, runTuitBlocks, runTuitText }
