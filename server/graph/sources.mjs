// Sources (ADR-MOS-18, part 1): where a graph's bytes come from. A source returns text
// and a version (an mtime or a commit time); the model is parsed once per version and
// cached, so a poll that brings no change costs a stat and nothing else.
import fs from 'node:fs/promises'
import path from 'node:path'
import { detectReader } from './readers/index.mjs'
import { degrees, validateModel } from './model.mjs'

/** Refuse a file above this before parsing it (the instance's knowledge graph is 33 MB). */
export const MAX_BYTES = 128 * 1024 * 1024

/** A file under a configured root; a path that escapes the root is refused. */
export function localFile(root, relative, { format } = {}) {
  const base = path.resolve(root)
  const file = path.resolve(base, relative)
  if (file !== base && !file.startsWith(base + path.sep)) throw new Error(`graph source: ${relative} is outside its root`)
  return {
    kind: 'local', key: `local:${file}`, file, format,
    async stat() { const st = await fs.stat(file); return { bytes: st.size, version: st.mtimeMs } },
    // One open handle for the size check and the read, so the file checked is the file
    // read: a stat followed by a separate readFile would let the file change in between.
    async read() {
      const fh = await fs.open(file, 'r')
      try {
        const st = await fh.stat()
        if (st.size > MAX_BYTES) throw new Error(`graph source: ${path.basename(file)} is ${st.size} bytes, over the ${MAX_BYTES} cap`)
        return { text: await fh.readFile({ encoding: 'utf8' }), version: st.mtimeMs }
      } finally {
        await fh.close()
      }
    },
  }
}

/** A file in a GitHub repository, through the dashboard's repository reader. */
export function githubFile(repo, filePath, { format } = {}) {
  return {
    kind: 'github', key: `github:${repo.label()}:${filePath}`, file: filePath, format,
    async read() {
      const version = await repo.lastCommitMs(filePath)
      const text = await repo.readText(filePath)
      if (text.length > MAX_BYTES) throw new Error(`graph source: ${filePath} is over the ${MAX_BYTES} cap`)
      return { text, version }
    },
  }
}

const cache = new Map()

/** The canonical model of a source, parsed once per version. Returns { model, version, degree }. */
export async function loadModel(source, { id } = {}) {
  const { text, version } = await source.read()
  const hit = cache.get(source.key)
  if (hit?.version === version) return hit
  const reader = detectReader(text, source.format)
  const model = validateModel(reader.parse(text, { id: id ?? path.basename(source.file, path.extname(source.file)), version }))
  const entry = { model, version, degree: degrees(model) }
  cache.set(source.key, entry)
  return entry
}

export const clearModelCache = () => cache.clear()
