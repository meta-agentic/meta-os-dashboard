// Vault-native backlog for deployed (GitHub) mode — IOS-838.
//
// The derived <space>.backlog.json files are gitignored in the instance repo, so a
// deployed server can never read them; the old external backlog mirror is retired. This
// reads the vault itself — per-item markdown under <space>/{raw,wiki,output}/<ID>.md
// and sprint files under <space>/sprints/<SPRINT-ID>.md (ADR-MOS-01/04/06) — which
// also removes the staleness window the derived cache had: an item added after the
// last `backlog.py export` was simply invisible.
//
// Cost is kept sane by reading the tree once (one request, already cached) and then
// pulling file contents in GraphQL batches via readManyText — not one REST call per
// item, which at 1000+ items would exhaust the rate limit on a single poll.
import path from 'node:path'
import matter from 'gray-matter'
import { backlogFromVault } from './backlog-schema.mjs'

const TIERS = new Set(['raw', 'wiki', 'output'])

function frontMatter(text) {
  if (typeof text !== 'string') return null
  try {
    return matter(text).data ?? null
  } catch {
    return null // malformed front-matter is skipped, exactly as vaultlib does
  }
}

export async function vaultBacklog(repo, space) {
  const tree = await repo.ensureTree()
  const prefix = `${space}/`
  const itemPaths = []
  const sprintPaths = []
  for (const p of tree.keys()) {
    if (!p.startsWith(prefix) || !p.endsWith('.md')) continue
    const parts = p.split('/')
    if (parts.length !== 3 || parts[2] === '_index.md') continue
    if (TIERS.has(parts[1])) itemPaths.push(p)
    else if (parts[1] === 'sprints') sprintPaths.push(p)
  }
  const texts = await repo.readManyText([...itemPaths, ...sprintPaths])
  const items = itemPaths
    .map((p) => ({ fm: frontMatter(texts.get(p)) }))
    .filter((x) => x.fm)
  const sprintDocs = sprintPaths
    .map((p) => ({ fm: frontMatter(texts.get(p)), stem: path.posix.basename(p, '.md') }))
    .filter((x) => x.fm)
  return backlogFromVault({ items, sprintDocs })
}
