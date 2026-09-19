// The one backlog shape every reader consumes (IOS-838 / ADR-MOS-06 / ADR-MOS-07).
//
// Three vocabularies collided here and silently produced empty widgets:
//   · the vault (authority)  — item `id`, sprint `state: active|closed`, `start`/`end`
//   · backlog.py export      — `id`, but sprint `status: IN PROGRESS|DONE`
//   · the dashboard readers  — `jiraId`, `startDate`/`endDate`, sprint `status: CLOSED`
// No pair of those agrees, and because every reader degrades to "no data" rather
// than throwing, the mismatch showed up as blank Velocity/Burndown panels and lane
// cards with undefined ids instead of as an error. Normalising at the boundary is
// what keeps that from happening again: readers speak ONE schema, and each source
// is translated on the way in.
//
// Canonical story/epic: { id, title, status, storyPoints, priority, epic, project,
//                         sprint, dependencies[], relates[], labels[], kind }
// Canonical sprint:     { id, name, status: 'IN PROGRESS'|'CLOSED'|'PLANNED',
//                         start, end, goal, issues[], deliveredSP, deliveredItems }
// Item `status` stays the vault's own vocabulary (TO DO / IN PROGRESS / DONE / …) —
// that one never diverged, so there is nothing to translate.

const arr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])

// Sprint membership is a string, a list, or absent — normalise before comparing.
export const sprintMembers = (story) => arr(story?.sprint).map(String)

// active → running, closed/DONE → CLOSED. `DONE` is backlog.py export's spelling of
// "not active"; the vault itself says `closed`, and the readers say `CLOSED`, so the
// readers' word wins and the other two translate into it.
function sprintStatus(raw) {
  const s = String(raw ?? '').toUpperCase()
  if (s === 'ACTIVE' || s === 'IN PROGRESS') return 'IN PROGRESS'
  if (s === 'CLOSED' || s === 'DONE' || s === 'COMPLETE' || s === 'COMPLETED') return 'CLOSED'
  return 'PLANNED'
}

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

export function normalizeStory(s) {
  return {
    // `jiraId` is the pre-ADR-MOS-07 spelling; accepted on the way in, never emitted.
    id: s.id ?? s.jiraId ?? s.key ?? null,
    title: s.title ?? '',
    status: String(s.status ?? '').toUpperCase(),
    storyPoints: num(s.storyPoints),
    priority: s.priority ?? null,
    epic: s.epic ?? null,
    project: s.project ?? null,
    sprint: s.sprint ?? null,
    dependencies: arr(s.dependencies),
    relates: arr(s.relates),
    labels: arr(s.labels),
    kind: (s.kind ?? s.type ?? null) || null,
  }
}

export function normalizeSprint(s) {
  const start = s.start ?? s.startDate ?? null
  const end = s.end ?? s.endDate ?? null
  return {
    id: s.id ?? s.sprintId ?? null,
    // Sprints carry a goal, not a name. Falling back to the id keeps every label
    // non-empty without inventing a title the vault never wrote.
    name: s.name ?? s.goal ?? s.id ?? s.sprintId ?? null,
    status: sprintStatus(s.state ?? s.status),
    start,
    end,
    goal: s.goal ?? null,
    issues: arr(s.issues ?? s.committed),
    deliveredSP: num(s.deliveredSP),
    deliveredItems: num(s.deliveredItems),
  }
}

// Any backlog document — a backlog.py export, a legacy Jira-shaped backlog.json, or
// the vault-native builder's output — into the canonical shape.
export function normalizeBacklog(doc) {
  return {
    stories: (doc?.stories ?? []).map(normalizeStory),
    epics: (doc?.epics ?? []).map(normalizeStory),
    sprints: (doc?.sprints ?? []).map(normalizeSprint),
  }
}

const EXCLUDED_KINDS = new Set(['adr'])

// Vault front-matter → canonical backlog, the JS port of backlog.py's `export`.
// `items` are parsed { fm } for every <space>/{raw,wiki,output}/*.md; `sprintDocs`
// are parsed { fm, stem } for every <space>/sprints/*.md.
//
// An item is a file that declares a `kind` — discovering by front-matter rather than
// by filename shape is what lets a space name its files its own way (vaultlib.py says
// the same; a space whose ids look like FAM-SPIKE-S0-01 is invisible to a
// <PREFIX>-<n> filename rule).
export function backlogFromVault({ items = [], sprintDocs = [] } = {}) {
  const stories = []
  const epics = []
  const membership = new Map() // sprint id → [item id]

  for (const { fm } of items) {
    if (!fm) continue
    const kind = String(fm.kind ?? '').trim()
    if (!kind || EXCLUDED_KINDS.has(kind.toLowerCase())) continue // prose docs are not items
    const row = normalizeStory({ ...fm, kind })
    if (!row.id) continue
    for (const sid of sprintMembers(fm)) {
      if (!membership.has(sid)) membership.set(sid, [])
      membership.get(sid).push(row.id)
    }
    ;(kind.toLowerCase() === 'epic' ? epics : stories).push(row)
  }

  const sprints = sprintDocs
    .filter((d) => d?.fm)
    .map(({ fm, stem }) => {
      const s = normalizeSprint({ ...fm, id: fm.sprintId ?? stem })
      // The sprint file holds the committed plan snapshot; live membership lives in
      // each item's `sprint` field. The roster is the union, so an item pulled in
      // mid-sprint still counts and a dropped commitment still shows.
      s.issues = [...new Set([...s.issues.map(String), ...(membership.get(s.id) ?? [])])].sort()
      return s
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))

  return { stories, epics, sprints }
}
