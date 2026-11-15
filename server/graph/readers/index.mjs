// The reader registry (ADR-MOS-18, part 2). A reader is { name, detect(text, hint), parse(text, opts) }.
// New formats register here; the conformance fixture of the ADR's refinement section
// is where each new one proves it produces the same canonical model.
import { networkx } from './networkx.mjs'

const readers = [networkx]

export function registerReader(reader) {
  if (!reader?.name || typeof reader.detect !== 'function' || typeof reader.parse !== 'function') {
    throw new Error('a reader needs a name, detect(text, hint) and parse(text, opts)')
  }
  if (!readers.some((r) => r.name === reader.name)) readers.push(reader)
  return reader
}

export const readerNames = () => readers.map((r) => r.name)
export const getReader = (name) => readers.find((r) => r.name === name)

/** The first reader that recognises the text; the hint (a format name from the source) wins. */
export function detectReader(text, hint) {
  const byName = hint && getReader(hint)
  if (byName) return byName
  const r = readers.find((r) => r.detect(text, hint))
  if (!r) throw new Error('no reader recognises this graph format')
  return r
}
