// Open decisions — the questions only the PO can answer, read from the vault's decision
// register (<space>/raw/decisions.json: a record sits in raw/ exactly while it is open).
// Read-only. Spaces come from `backlogs`; an entry whose path is a pre-built .json
// document has no register to read and is skipped.
//
// Order: oldest raised first (the panel's rule). Ties keep a stable order by space and
// numeric id, so the same register always renders the same list.
import fs from 'node:fs/promises'
import path from 'node:path'

const DAY = 86_400_000
const isDocument = (b) => typeof b.path === 'string' && b.path.endsWith('.json')
const num = (id) => Number(String(id).split('-')[1]) || 0

export function shape(space, d, now = Date.now()) {
  const raised = typeof d.raised === 'string' ? d.raised : ''
  const t = Date.parse(raised)
  const blocks = Array.isArray(d.blocks) ? d.blocks.map(String) : []
  return {
    space,
    id: String(d.id),
    question: String(d.question ?? ''),
    raised,
    ageDays: Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / DAY)),
    blocks,
    options: Array.isArray(d.options) ? d.options.map(String) : [],
    recommendation: d.recommendation?.text ? String(d.recommendation.text) : (d.default ? String(d.default) : ''),
    recommendationBy: d.recommendation?.text ? (d.recommendation.by ?? null) : null,
    owner: d.owner ?? null,
  }
}

// Oldest first; a record with no readable date sorts last, never first.
export function oldestFirst(rows) {
  const key = (r) => (r.raised && !Number.isNaN(Date.parse(r.raised)) ? Date.parse(r.raised) : Infinity)
  return [...rows].sort((a, b) =>
    key(a) - key(b) || a.space.localeCompare(b.space) || num(a.id) - num(b.id))
}

async function openIn(entry, now) {
  let doc
  try {
    doc = JSON.parse(await fs.readFile(path.join(entry.path, 'raw', 'decisions.json'), 'utf8'))
  } catch {
    return [] // no register, or an unreadable one, is a zero, never a throw
  }
  return (doc.decisions ?? []).filter((d) => d.state === 'open' && d.id).map((d) => shape(entry.space, d, now))
}

export async function openDecisions(backlogs, now = Date.now()) {
  const entries = (backlogs ?? []).filter((b) => b.space && b.path && !isDocument(b))
  const rows = (await Promise.all(entries.map((e) => openIn(e, now)))).flat()
  return { available: true, decisions: oldestFirst(rows) }
}
