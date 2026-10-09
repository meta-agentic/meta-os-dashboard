// ADR register over the local filesystem: every ADR in every configured vault space,
// and one ADR with its decisions. Read-only — this module only ever reads files.
//
// Spaces come from `backlogs` (the same list Work Items reads); an entry whose path is
// a pre-built .json document has no files to scan and is reported as such. The detail
// lookup resolves an id only among the ADRs the scan found, so no request value is
// ever joined into a filesystem path.
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseAdr, isExcluded, namedAdr, declaresAdr, register, validId } from './adr-parse.mjs'

const unavailable = (reason) => ({ available: false, reason })
const isDocument = (b) => typeof b.path === 'string' && b.path.endsWith('.json')

// Space-relative .md paths, walking past excluded directories without entering them.
// Symlinked directories are not followed (a Dirent for one is not isDirectory()).
async function mdFiles(dir, rel = '') {
  let entries
  try {
    entries = await fs.readdir(path.join(dir, rel), { withFileTypes: true })
  } catch {
    return [] // a missing space directory is a zero, never a throw
  }
  const out = []
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) {
      if (!isExcluded(`${r}/x.md`)) out.push(...(await mdFiles(dir, r)))
    } else if (e.isFile() && !isExcluded(r)) {
      out.push(r)
    }
  }
  return out
}

export async function scanSpace(entry) {
  const records = []
  for (const rel of await mdFiles(entry.path)) {
    const text = await fs.readFile(path.join(entry.path, rel), 'utf8').catch(() => null)
    if (text == null || (!namedAdr(rel) && !declaresAdr(text))) continue
    const r = parseAdr(text, { space: entry.space, rel })
    if (r) records.push(r)
  }
  return records
}

const vaultSpaces = (backlogs) => (backlogs ?? []).filter((b) => b.space && b.path)

export async function adrs(backlogs) {
  const spaces = vaultSpaces(backlogs)
  if (!spaces.length) return unavailable('no backlog spaces configured — add one under `backlogs`')
  const records = []
  const failed = []
  for (const b of spaces) {
    if (isDocument(b)) {
      failed.push({ space: b.space, reason: 'backlog is a pre-built JSON document — no vault files to scan' })
      continue
    }
    try {
      records.push(...(await scanSpace(b)))
    } catch (e) {
      failed.push({ space: b.space, reason: e.message })
    }
  }
  return register(records, failed)
}

// Which browsable file root (fileRoots in index.mjs) holds this file, so the panel can
// open it in File Preview. The most specific root wins; none is a stated absence.
async function previewTarget(fileRoots, abs) {
  const real = await fs.realpath(abs).catch(() => abs)
  let best = null
  for (const [label, root] of Object.entries(fileRoots ?? {})) {
    for (const base of new Set([path.resolve(root), await fs.realpath(root).catch(() => null)])) {
      if (!base) continue
      const file = base === path.resolve(root) ? abs : real
      if (!file.startsWith(base + path.sep)) continue
      if (!best || base.length > best.len) best = { root: label, path: path.relative(base, file).split(path.sep).join('/'), len: base.length }
    }
  }
  return best ? { root: best.root, path: best.path } : null
}

export async function adrDetail(backlogs, fileRoots, space, id) {
  const b = vaultSpaces(backlogs).find((x) => x.space === space)
  if (!b) return unavailable(space ? `no backlog configured for space "${space}"` : 'no space selected')
  if (!validId(id)) return unavailable('no valid ADR id given')
  if (isDocument(b)) return unavailable('backlog is a pre-built JSON document — no vault files to scan')
  try {
    const adr = (await scanSpace(b)).find((r) => r.id === id)
    if (!adr) return unavailable(`no ADR ${id} in ${space}`)
    const preview = await previewTarget(fileRoots, path.resolve(b.path, adr.path))
    return {
      available: true, space, adr, preview,
      previewReason: preview ? null : 'no browsable file root contains this vault — add it under memory.roots to open it in File Preview',
    }
  } catch (e) {
    return unavailable(`ADR unreadable: ${e.message}`)
  }
}
