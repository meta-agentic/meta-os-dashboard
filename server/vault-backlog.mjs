// Vault-native backlog over the local filesystem — the disk twin of
// github-vault-backlog.mjs, sharing its parser via backlog-schema.backlogFromVault.
//
// Reading the vault directly is what removes the staleness window: the derived
// <space>.backlog.json files are only as current as the last `backlog.py export`, and
// an item written after it is simply invisible to the dashboard (MOS-76 was, at the
// time this landed). The vault is the authority per ADR-MOS-06, so read the authority.
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import { backlogFromVault, normalizeBacklog } from './backlog-schema.mjs'

const TIERS = ['raw', 'wiki', 'output']

async function mdIn(dir) {
  try {
    return (await fs.readdir(dir))
      .filter((f) => f.endsWith('.md') && f !== '_index.md')
      .sort()
      .map((f) => path.join(dir, f))
  } catch {
    return [] // a missing tier is a zero, never a throw
  }
}

async function frontMatter(file) {
  try {
    return matter(await fs.readFile(file, 'utf8')).data ?? null
  } catch {
    return null // unreadable or malformed front-matter is skipped, as vaultlib does
  }
}

export async function vaultBacklog(spaceDir) {
  const itemFiles = (await Promise.all(TIERS.map((t) => mdIn(path.join(spaceDir, t))))).flat()
  const sprintFiles = await mdIn(path.join(spaceDir, 'sprints'))
  const items = (await Promise.all(itemFiles.map(async (f) => ({ fm: await frontMatter(f) }))))
    .filter((x) => x.fm)
  const sprintDocs = (await Promise.all(sprintFiles.map(async (f) => ({
    fm: await frontMatter(f), stem: path.basename(f, '.md'),
  })))).filter((x) => x.fm)
  return backlogFromVault({ items, sprintDocs })
}

// One item's source file, front-matter AND body. Items are named <ID>.md on disk
// (github-vault-backlog relies on the same), so the fast path is a direct read per
// tier; the scan fallback exists for a space that names its files its own way —
// the listing above deliberately discovers by front-matter, so this must too.
export async function loadItem(entry, id) {
  if (typeof entry.path === 'string' && entry.path.endsWith('.json')) {
    return { file: null, reason: 'backlog is a pre-built JSON export — no source file to read' }
  }
  const safe = /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) ? id : null
  const parse = async (file) => {
    try {
      const doc = matter(await fs.readFile(file, 'utf8'))
      return doc.data ? { fm: doc.data, body: doc.content, path: path.relative(entry.path, file) } : null
    } catch {
      return null
    }
  }
  if (safe) {
    for (const t of TIERS) {
      const hit = await parse(path.join(entry.path, t, `${safe}.md`))
      if (hit && String(hit.fm.id ?? '') === id) return { file: hit }
    }
  }
  const files = (await Promise.all(TIERS.map((t) => mdIn(path.join(entry.path, t))))).flat()
  for (const f of files) {
    const hit = await parse(f)
    if (hit && String(hit.fm.id ?? '') === id) return { file: hit }
  }
  return { file: null, reason: `no item ${id} in this space` }
}

// One backlog entry → the canonical shape. `path` ending in .json is a pre-built
// backlog document (the derived export, or any legacy mirror); anything else is a
// vault space directory. Same rule as the GitHub context, so both modes read the
// same config shape.
export async function loadBacklog(entry) {
  if (typeof entry.path === 'string' && entry.path.endsWith('.json')) {
    return normalizeBacklog(JSON.parse(await fs.readFile(entry.path, 'utf8')))
  }
  return vaultBacklog(entry.path)
}
