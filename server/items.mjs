// Backlog-wide work-item views: the whole space as a flat list, and one item in full.
// Sprint Lanes answers "what is in flight"; this answers "what exists". The list is
// the bulk call, so it carries front-matter only; the body is read on demand.
//
// The shape builders are pure so the local and GitHub readers share them — each mode
// only supplies its own loadBacklog / loadItem.
import { STATE } from './readers.mjs'
import { loadBacklog, loadItem } from './vault-backlog.mjs'
import { normalizeStory } from './backlog-schema.mjs'

const unavailable = (reason) => ({ available: false, reason })

// Natural order for ids like IOS-9 < IOS-10 < IOS-S2-01.
const idKey = (id) => String(id ?? '').replace(/\d+/g, (n) => n.padStart(8, '0'))

function index(d) {
  const all = [...d.epics, ...d.stories]
  const byId = new Map(all.map((s) => [s.id, s]))
  // Blocked is DERIVED, same rule as lanes(): an unfinished dependency the space
  // knows about. Unknown ids are not blockers — no guessing.
  const blockedBy = (s) =>
    s.status === 'DONE' ? [] : s.dependencies.filter((id) => byId.has(id) && byId.get(id).status !== 'DONE')
  return { all, byId, blockedBy }
}

const row = (s, blockers) => ({
  id: s.id, title: s.title, status: s.status, flowState: STATE[s.status] ?? null,
  kind: s.kind, storyPoints: s.storyPoints, priority: s.priority, epic: s.epic, project: s.project,
  sprint: s.sprint, labels: s.labels, blockedBy: blockers.length ? blockers : null,
})

export function itemRows(d) {
  const { all, blockedBy } = index(d)
  return all.map((s) => row(s, blockedBy(s))).sort((a, b) => idKey(a.id).localeCompare(idKey(b.id)))
}

// Links resolve to { id, title, status, flowState } when the space knows the target,
// so a chip can colour itself; an unknown id stays a bare { id } the client renders inert.
export function itemDetailRow(d, file) {
  const { all, byId, blockedBy } = index(d)
  const item = normalizeStory({ ...file.fm, kind: file.fm.kind ?? file.fm.type ?? null })
  const link = (id) => {
    const t = byId.get(id)
    return t ? { id, title: t.title, status: t.status, flowState: STATE[t.status] ?? null } : { id }
  }
  // Parent chain (this item's epic, that epic's own epic, and so on), furthest
  // ancestor first. Full row shape — same fields as the item itself — so the client
  // can render one ancestor exactly like it renders the item it belongs to. A cycle
  // (malformed data) or an unknown id just ends the walk rather than looping or
  // guessing further.
  const parentLink = (id) => {
    const t = byId.get(id)
    return t ? row(t, []) : { id }
  }
  const parents = []
  const seen = new Set([item.id])
  for (let cur = item.epic; cur && !seen.has(cur); ) {
    seen.add(cur)
    const p = parentLink(cur)
    parents.push(p)
    cur = byId.get(cur)?.epic ?? null
  }
  parents.reverse()
  const links = (ids) => [...new Set(ids.map(String))].map(link)
  const backlinks = (pick) =>
    all.filter((s) => s.id !== item.id && pick(s)).map((s) => link(s.id)).sort((a, b) => idKey(a.id).localeCompare(idKey(b.id)))
  return {
    ...row(item, blockedBy(item)),
    parents,
    dependencies: links(item.dependencies),
    relates: links(item.relates),
    dependents: backlinks((s) => s.dependencies.includes(item.id)),
    relatedBy: backlinks((s) => s.relates.includes(item.id) && !item.relates.includes(s.id)),
    children: item.kind === 'epic' ? backlinks((s) => s.epic === item.id) : [],
    body: typeof file.body === 'string' ? file.body.trim() : null,
    path: file.path ?? null,
  }
}

const find = (backlogs, space) => (backlogs ?? []).find((b) => b.space === space)

export async function items(backlogs, space) {
  const b = find(backlogs, space)
  if (!b) return unavailable(space ? `no backlog configured for space "${space}"` : 'no space selected')
  try {
    return { available: true, space, items: itemRows(await loadBacklog(b)) }
  } catch (e) {
    return unavailable(`backlog unreadable: ${e.message}`)
  }
}

export async function itemDetail(backlogs, space, id) {
  const b = find(backlogs, space)
  if (!b) return unavailable(space ? `no backlog configured for space "${space}"` : 'no space selected')
  if (!id) return unavailable('no item id given')
  try {
    const d = await loadBacklog(b)
    const { file, reason } = await loadItem(b, id)
    if (file) return { available: true, space, item: itemDetailRow(d, file) }
    // No source file (JSON export) but the item is known: answer from the list data,
    // body-less, and say why — the page still opens, it just cannot show prose.
    const known = [...d.epics, ...d.stories].find((s) => s.id === id)
    if (!known) return unavailable(reason)
    return { available: true, space, item: itemDetailRow(d, { fm: known, body: null, path: null }), reason }
  } catch (e) {
    return unavailable(`item unreadable: ${e.message}`)
  }
}
