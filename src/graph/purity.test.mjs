// MOS-321 AC1: the drawing component and the layout strategies import nothing
// graphify-specific. A node type, a colour, a confidence word or a widget import in
// src/graph/ fails this test, so the generic part cannot quietly grow a dependency on
// one source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

function sources(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...sources(p))
    else if (/\.(jsx?|mjs)$/.test(e.name) && !/\.test\.mjs$/.test(e.name)) out.push(p)
  }
  return out
}

const FORBIDDEN = [
  [/graphify/i, 'the name of a source'],
  [/file_type|source_file|\bcommunit(y|ies)\b/, 'a graphify attribute'],
  [/TYPE_COLOR|CONF_OPACITY|typeLabel/, 'graphify\'s style tables'],
  [/\b(EXTRACTED|INFERRED|AMBIGUOUS)\b|confidenceLabel/, 'graphify\'s confidence vocabulary'],
  [/#(58a6ff|3fb950|d29922|bc8cff|f85149|30363d)\b/i, 'a graphify colour'],
  [/from\s+['"][^'"]*widgets\//, 'an import from a widget'],
  [/\b(code|document|paper|concept|rationale|image)\s*:/, 'a graphify node type used as a key'],
]

test('src/graph knows no source: no graphify names, attributes, colours or widget imports', () => {
  const files = sources(here)
  assert.ok(files.length >= 6, `expected the graph component's files, found ${files.length}`)
  const faults = []
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8')
    for (const [re, why] of FORBIDDEN) {
      const m = text.match(re)
      if (m) faults.push(`${path.relative(here, f)}: ${JSON.stringify(m[0])} (${why})`)
    }
  }
  assert.deepEqual(faults, [])
})

test('the canonical model is one definition shared with the server, not a copy', () => {
  const text = fs.readFileSync(path.join(here, 'model.js'), 'utf8')
  assert.match(text, /from '\.\.\/\.\.\/server\/graph\/model\.mjs'/)
})
