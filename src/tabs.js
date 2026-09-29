// Tabs are derived, not curated. Every widget declares the group it belongs to
// (App.jsx WIDGETS[].group); each group with at least one widget becomes a tab, and
// a tab shows every widget of its group. What is persisted is only the arrangement
// the user dragged or resized inside each tab — so a widget added to a group later
// appears in its tab on its own, and one removed from the code drops out.

// Tab order. A group missing here still gets a tab, after these.
export const GROUPS = [
  { id: 'flow', name: 'Flow' },
  { id: 'sprint', name: 'Sprint' },
  { id: 'backlog', name: 'Backlog' },
  { id: 'memory', name: 'Memory' },
  { id: 'knowledge', name: 'Knowledge' },
  { id: 'usage', name: 'Usage' },
  { id: 'skills', name: 'Skills' },
  { id: 'operations', name: 'Operations' },
]

export function tabsFor(widgets) {
  const present = [...new Set(widgets.map((w) => w.group))]
  const known = GROUPS.filter((g) => present.includes(g.id))
  const extra = present.filter((id) => !GROUPS.some((g) => g.id === id)).map((id) => ({ id, name: id }))
  return [...known, ...extra].map((g) => ({ ...g, ids: widgets.filter((w) => w.group === g.id).map((w) => w.i) }))
}

const COLS = 12
const FALLBACK = { w: 6, h: 8, minW: 3, minH: 5 }

// Size floors from the catalogue always win over a saved size.
export const withFloors = (layout, sizes) =>
  layout.map((l) => {
    const s = sizes[l.i] ?? FALLBACK
    return { ...l, minW: s.minW, minH: s.minH, w: Math.max(l.w, s.minW), h: Math.max(l.h, s.minH) }
  })

// Flow widgets left to right at their catalogue size, wrapping at 12 columns, then
// widen each row's widgets so the row spans the full width — a tab fills the space
// instead of leaving a ragged right edge. Vertical compaction closes any gaps.
export function autoLayout(ids, sizes, startY = 0) {
  const rows = []
  let row = []
  let used = 0
  for (const i of ids) {
    const s = sizes[i] ?? FALLBACK
    const w = Math.min(s.w, COLS)
    if (used + w > COLS && row.length) { rows.push(row); row = []; used = 0 }
    row.push({ i, w, h: s.h })
    used += w
  }
  if (row.length) rows.push(row)

  const out = []
  let y = startY
  for (const r of rows) {
    // Hand the spare columns out one at a time, left to right.
    let spare = COLS - r.reduce((n, it) => n + it.w, 0)
    for (let k = 0; spare > 0; k = (k + 1) % r.length, spare--) r[k].w += 1
    let x = 0
    for (const it of r) { out.push({ i: it.i, x, y, w: it.w, h: it.h }); x += it.w }
    y += Math.max(...r.map((it) => it.h))
  }
  return out
}

// A tab's saved arrangement, reconciled with the widgets it must show now: saved
// positions are kept, stale ids dropped, new widgets flowed in below.
export function reconcile(saved, ids, sizes) {
  const keep = (saved ?? []).filter((l) => ids.includes(l.i))
  const have = new Set(keep.map((l) => l.i))
  const bottom = keep.reduce((m, l) => Math.max(m, l.y + l.h), 0)
  return withFloors([...keep, ...autoLayout(ids.filter((i) => !have.has(i)), sizes, bottom)], sizes)
}

// Persistence. localStorage is the offline cache; the server copy (/api/boards) is
// the source of truth when reachable and keeps its { boards: [...] } envelope, one
// entry per tab, marked `kind: 'tabs'` so a pre-tabs board document is ignored.
const TABS_KEY = 'meta-os.tabs.v1'

export function loadTabs() {
  try {
    const saved = JSON.parse(localStorage.getItem(TABS_KEY) || 'null')
    if (saved && typeof saved.layouts === 'object') return { layouts: saved.layouts, activeId: saved.activeId ?? null }
  } catch { /* private mode */ }
  return { layouts: {}, activeId: null }
}

export function storeTabs(state) {
  try { localStorage.setItem(TABS_KEY, JSON.stringify(state)) } catch { /* private mode */ }
}

export const toServerDoc = ({ layouts, activeId }) => ({
  kind: 'tabs',
  activeId,
  boards: Object.entries(layouts).map(([id, layout]) => ({ id, layout })),
})

export const fromServerDoc = (doc) =>
  doc?.kind === 'tabs' && Array.isArray(doc.boards)
    ? { layouts: Object.fromEntries(doc.boards.map((b) => [b.id, b.layout])), activeId: doc.activeId ?? null }
    : null
