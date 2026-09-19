import React, { useEffect, useRef, useState } from 'react'
import GridLayout, { WidthProvider } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import Lanes from './widgets/Lanes.jsx'
import SprintSummary from './widgets/SprintSummary.jsx'
import Burndown from './widgets/Burndown.jsx'
import Velocity from './widgets/Velocity.jsx'
import Packs from './widgets/Packs.jsx'
import Skills from './widgets/Skills.jsx'
import Memory from './widgets/Memory.jsx'
import MemoryFlux from './widgets/MemoryFlux.jsx'
import Automations from './widgets/Automations.jsx'
import Registry from './widgets/Registry.jsx'
import Activity from './widgets/Activity.jsx'
import GraphView from './widgets/graph/GraphView.jsx'
import GraphTable from './widgets/graph/GraphTable.jsx'
import Lint from './widgets/Lint.jsx'
import Outputs from './widgets/Outputs.jsx'
import Usage from './widgets/Usage.jsx'
import Nav from './Nav.jsx'
import Distribution from './widgets/Distribution.jsx'
import FilePreview from './widgets/FilePreview.jsx'
import Gantt from './widgets/Gantt.jsx'
import Report from './widgets/Report.jsx'
import { apiFetch, isStatic } from './api.js'
import { useAuth } from './auth/AuthProvider.jsx'
import Onboarding from './Onboarding.jsx'
import { deriveOnboarding } from './onboarding.js'

const FEEDS = ['meta', 'ontology', 'registry', 'automations', 'memory', 'events', 'lanes', 'lint', 'outputs', 'usage', 'report', 'packs']

const WIDGETS = [
  { i: 'lanes', title: 'Sprint Lanes', render: (d) => <Lanes data={d.lanes} /> },
  { i: 'sprint-summary', title: 'Sprint Summary', render: (d) => <SprintSummary data={d.lanes} /> },
  { i: 'graph', title: 'Knowledge Graph', render: (d) => <GraphView ontology={d.ontology} /> },
  { i: 'graph-table', title: 'Graph Hubs', render: (d) => <GraphTable ontology={d.ontology} /> },
  { i: 'memory', title: 'Memory', render: (d) => <Memory data={d.memory} ontology={d.ontology} /> },
  { i: 'memory-flux', title: 'Memory Flux', render: (d) => <MemoryFlux memory={d.memory} events={d.events} ontology={d.ontology} /> },
  { i: 'outputs', title: 'Outputs', render: (d) => <Outputs data={d.outputs} /> },
  { i: 'automations', title: 'Automations', render: (d) => <Automations data={d.automations} /> },
  { i: 'usage', title: 'Usage', render: (d) => <Usage data={d.usage} /> },
  { i: 'registry', title: 'Registry', render: (d) => <Registry data={d.registry} /> },
  { i: 'lint', title: 'Lint', render: (d) => <Lint data={d.lint} /> },
  { i: 'activity', title: 'Activity', render: (d) => <Activity data={d.events} /> },
  { i: 'distribution', title: 'Distribution', render: (d) => <Distribution data={d.lanes} /> },
  { i: 'files', title: 'File Preview', render: (d) => <FilePreview roots={d.meta?.roots} /> },
  { i: 'gantt', title: 'Roadmap', render: (d) => <Gantt data={d.report} /> },
  { i: 'burndown', title: 'Burndown', render: (d) => <Burndown data={d.report} /> },
  { i: 'velocity', title: 'Velocity', render: (d) => <Velocity data={d.report} /> },
  { i: 'packs', title: 'Packs mounted', render: (d) => <Packs data={d.packs} /> },
  { i: 'skills', title: 'Skills by discipline', render: (d) => <Skills data={d.packs} /> },
  { i: 'report', title: 'Scrum Report', render: (d) => <Report data={d.report} /> },
]

const DEFAULT_LAYOUT = [
  { i: 'sprint-summary', x: 0, y: 0, w: 12, h: 9, minW: 4, minH: 5 },
  { i: 'lanes', x: 0, y: 9, w: 7, h: 11, minW: 4, minH: 6 },
  { i: 'graph', x: 7, y: 9, w: 5, h: 11, minW: 3, minH: 6 },
  { i: 'memory', x: 0, y: 20, w: 4, h: 8, minW: 3, minH: 5 },
  { i: 'memory-flux', x: 4, y: 20, w: 4, h: 9, minW: 3, minH: 7 },
  { i: 'outputs', x: 8, y: 20, w: 4, h: 8, minW: 3, minH: 5 },
  { i: 'automations', x: 0, y: 29, w: 4, h: 8, minW: 3, minH: 5 },
  { i: 'usage', x: 0, y: 28, w: 6, h: 8, minW: 3, minH: 5 },
  { i: 'registry', x: 6, y: 28, w: 3, h: 8, minW: 3, minH: 5 },
  { i: 'lint', x: 9, y: 28, w: 3, h: 8, minW: 3, minH: 5 },
  { i: 'activity', x: 0, y: 36, w: 8, h: 7, minW: 4, minH: 5 },
  { i: 'distribution', x: 8, y: 36, w: 4, h: 9, minW: 3, minH: 7 },
  { i: 'files', x: 0, y: 45, w: 6, h: 11, minW: 3, minH: 7 },
  { i: 'gantt', x: 6, y: 45, w: 6, h: 11, minW: 4, minH: 7 },
  { i: 'burndown', x: 0, y: 56, w: 6, h: 9, minW: 4, minH: 6 },
  { i: 'velocity', x: 6, y: 56, w: 6, h: 9, minW: 4, minH: 6 },
  { i: 'packs', x: 0, y: 65, w: 6, h: 9, minW: 4, minH: 6 },
  { i: 'skills', x: 6, y: 65, w: 6, h: 9, minW: 4, minH: 6 },
  { i: 'report', x: 0, y: 65, w: 12, h: 12, minW: 5, minH: 9 },
  { i: 'graph-table', x: 0, y: 77, w: 6, h: 8, minW: 3, minH: 5 },
]
// DEFAULT_LAYOUT above is the widget catalogue: the source of per-widget size floors
// and the template for a freshly-added board. FLOORS is derived from it, so every id
// used on any preset board below must exist in it (withFloors drops unknown ids).
const FLOORS = Object.fromEntries(DEFAULT_LAYOUT.map((d) => [d.i, { minW: d.minW, minH: d.minH }]))
const withFloors = (layout) => (layout || []).filter((l) => FLOORS[l.i]).map((l) => ({ ...l, ...FLOORS[l.i] }))

// Preset tabs — a fresh instance opens organised by question, not as one wall of
// widgets. Each board groups the widgets that answer one question; a widget may
// appear on more than one board (e.g. Sprint Lanes on both Overview and Delivery).
// Sizes here are overridden by FLOORS at load, so they only set the arrangement.
const DEFAULT_BOARDS = [
  {
    id: 'overview', name: 'Overview',
    layout: [
      { i: 'sprint-summary', x: 0, y: 0, w: 12, h: 9 },
      { i: 'lanes', x: 0, y: 9, w: 7, h: 11 },
      { i: 'usage', x: 7, y: 9, w: 5, h: 11 },
      { i: 'memory', x: 0, y: 20, w: 4, h: 8 },
      { i: 'outputs', x: 4, y: 20, w: 4, h: 8 },
      { i: 'activity', x: 8, y: 20, w: 4, h: 8 },
    ],
  },
  {
    id: 'knowledge', name: 'Knowledge',
    layout: [
      { i: 'graph', x: 0, y: 0, w: 8, h: 11 },
      { i: 'graph-table', x: 8, y: 0, w: 4, h: 11 },
      { i: 'memory', x: 0, y: 15, w: 4, h: 8 },
      { i: 'memory-flux', x: 4, y: 15, w: 4, h: 9 },
      { i: 'files', x: 8, y: 15, w: 4, h: 11 },
    ],
  },
  {
    id: 'delivery', name: 'Delivery',
    layout: [
      { i: 'sprint-summary', x: 0, y: 0, w: 12, h: 9 },
      { i: 'lanes', x: 0, y: 9, w: 7, h: 11 },
      { i: 'distribution', x: 7, y: 9, w: 5, h: 11 },
      { i: 'gantt', x: 0, y: 20, w: 12, h: 11 },
      { i: 'burndown', x: 0, y: 31, w: 6, h: 9 },
      { i: 'velocity', x: 6, y: 31, w: 6, h: 9 },
      { i: 'report', x: 0, y: 40, w: 12, h: 12 },
    ],
  },
  {
    id: 'operations', name: 'Operations',
    layout: [
      { i: 'usage', x: 0, y: 0, w: 6, h: 9 },
      { i: 'automations', x: 6, y: 0, w: 6, h: 9 },
      { i: 'activity', x: 0, y: 13, w: 8, h: 7 },
      { i: 'lint', x: 8, y: 13, w: 4, h: 7 },
      { i: 'registry', x: 0, y: 20, w: 12, h: 8 },
      { i: 'packs', x: 0, y: 28, w: 6, h: 9 },
      { i: 'skills', x: 6, y: 28, w: 6, h: 9 },
    ],
  },
]

const BOARDS_KEY = 'meta-os.boards.v1'
const LEGACY_LAYOUT_KEY = 'meta-os.layout.v1'
const PREFS_KEY = 'meta-os.prefs.v1'
const DEFAULT_PREFS = { theme: 'system', palette: 'graphite', density: 'comfortable', refreshSec: 30 }
const DENSITY = {
  comfortable: { margin: [14, 14], rowHeight: 30 },
  compact: { margin: [8, 8], rowHeight: 24 },
}
function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || 'null') || {}) }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}
// Widgets whose data is keyed by backlog SPACE (ios, iam, vec, ...) — the only ones
// the global project filter can act on. Registry uses a different, unlinked project
// vocabulary (repo entries, no `space` field), and most other widgets (Graph, Packs,
// Files, Usage, ...) have no project axis at all, so the filter leaves them alone.
const SPACE_SCOPED = new Set(['lanes', 'sprint-summary', 'distribution', 'activity'])

// Every backlog space currently known to the lanes feed — the option list for the
// project filter bar. Derived live so a newly-onboarded space shows up without a
// code change.
const projectOptions = (data) =>
  [...new Set((data?.lanes?.spaces ?? []).filter((s) => s.available !== false).map((s) => s.space))].sort()

// Narrows the shared feed data down to the selected projects, for one space-scoped
// widget. An empty selection means no filter. `lanes`/`sprint-summary`/
// `distribution` all read `d.lanes.spaces`; `activity` reads `d.events.events`,
// whose rows carry the space as `actor`.
function scopeToProject(data, widgetId, selected) {
  if (!selected.size || !SPACE_SCOPED.has(widgetId)) return data
  if (widgetId === 'activity') {
    return {
      ...data,
      events: data.events && { ...data.events, events: (data.events.events ?? []).filter((e) => selected.has(e.actor)) },
    }
  }
  return {
    ...data,
    lanes: data.lanes && { ...data.lanes, spaces: (data.lanes.spaces ?? []).filter((s) => selected.has(s.space)) },
  }
}

// Project filter is GLOBAL and persisted, like the group filter it replaces:
// zero or more selected projects, applying to every space-scoped widget on every
// board — not a per-board layout concern, so it's stored apart from the boards doc.
// Empty selection = no filter (show every project), same as the old "no groups
// hidden" state.
const PROJECTFILTER_KEY = 'meta-os.projectfilter.v1'
function loadProjectFilter() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROJECTFILTER_KEY) || 'null')
    if (Array.isArray(raw?.selected)) return new Set(raw.selected)
  } catch { /* private mode */ }
  return new Set()
}

const ONBOARDING_KEY = 'meta-os.onboarding.v1'
function loadOnboarding() {
  try {
    return { dismissed: false, ...(JSON.parse(localStorage.getItem(ONBOARDING_KEY) || 'null') || {}) }
  } catch {
    return { dismissed: false }
  }
}
const Grid = WidthProvider(GridLayout)
const newId = (p = 'b') => p + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36)
const normBoard = (b) => ({ ...b, layout: withFloors(b.layout) })

function loadBoards() {
  try {
    const saved = JSON.parse(localStorage.getItem(BOARDS_KEY) || 'null')
    if (saved && Array.isArray(saved.boards) && saved.boards.length) {
      const boards = saved.boards.map(normBoard)
      const activeId = boards.some((b) => b.id === saved.activeId) ? saved.activeId : boards[0].id
      return { boards, activeId }
    }
  } catch {
    /* migrate */
  }
  const boards = DEFAULT_BOARDS.map((b) => ({ ...b, layout: b.layout.map((l) => ({ ...l })) }))
  try {
    // Legacy single-layout users keep their arrangement on the Overview tab.
    const legacy = JSON.parse(localStorage.getItem(LEGACY_LAYOUT_KEY) || 'null')
    if (Array.isArray(legacy) && legacy.length) boards[0] = { ...boards[0], layout: legacy }
  } catch {
    /* ignore */
  }
  return { boards: boards.map(normBoard), activeId: 'overview' }
}

export default function App() {
  const [data, setData] = useState({})
  const [error, setError] = useState(null)
  const [{ boards, activeId }, setState] = useState(loadBoards)
  const [selectedProjects, setSelectedProjects] = useState(loadProjectFilter)
  const [editingId, setEditingId] = useState(null)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [onboarding, setOnboarding] = useState(loadOnboarding)
  const [showGridAnyway, setShowGridAnyway] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const auth = useAuth()
  const userKey = auth?.user?.sub || auth?.user?.email || 'local'
  const serverReady = useRef(false)

  const refresh = () =>
    Promise.all(FEEDS.map((f) => apiFetch(`/api/${f}`).then((r) => r.json()).then((d) => [f, d])))
      .then((pairs) => setData(Object.fromEntries(pairs)))
      .catch((e) => setError(String(e)))

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, prefs.refreshSec * 1000)
    return () => clearInterval(t)
  }, [prefs.refreshSec])

  useEffect(() => {
    const el = document.documentElement
    // `theme` is the light/dark axis, `palette` the colour scheme — orthogonal, so
    // every theme keeps working under System/Dark/Light.
    if (prefs.theme === 'system') delete el.dataset.theme
    else el.dataset.theme = prefs.theme
    el.dataset.palette = prefs.palette ?? 'graphite'
  }, [prefs.theme, prefs.palette])

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      /* storage disabled */
    }
  }, [prefs])

  useEffect(() => {
    try {
      localStorage.setItem(ONBOARDING_KEY, JSON.stringify(onboarding))
    } catch {
      /* storage disabled */
    }
  }, [onboarding])

  // Load this user's boards from the server (source of truth when reachable). Falls
  // back to the localStorage-seeded state on empty/unreachable. Re-runs per user.
  useEffect(() => {
    let cancelled = false
    serverReady.current = false
    apiFetch(`/api/boards?user=${encodeURIComponent(userKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (cancelled) return
        const doc = res?.doc
        if (doc && Array.isArray(doc.boards) && doc.boards.length) {
          const bs = doc.boards.map(normBoard)
          const activeId = bs.some((b) => b.id === doc.activeId) ? doc.activeId : bs[0].id
          setState({ boards: bs, activeId })
        }
        serverReady.current = true
      })
      .catch(() => { serverReady.current = true })
    return () => { cancelled = true }
  }, [userKey])

  // Persist: localStorage always (offline cache), server debounced once it's ready.
  useEffect(() => {
    try {
      localStorage.setItem(BOARDS_KEY, JSON.stringify({ boards, activeId }))
    } catch {
      /* storage disabled */
    }
    if (!serverReady.current || isStatic) return
    const t = setTimeout(() => {
      fetch(`/api/boards?user=${encodeURIComponent(userKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boards, activeId }),
      }).catch(() => {})
    }, 600)
    return () => clearTimeout(t)
  }, [boards, activeId, userKey])

  const active = boards.find((b) => b.id === activeId) || boards[0]
  const patchBoards = (fn) => setState((s) => ({ ...s, boards: fn(s.boards) }))
  const patchActive = (fn) => patchBoards((bs) => bs.map((b) => (b.id === active.id ? fn(b) : b)))

  const pendingRemove = useRef(null)
  const onLayoutChange = (next) =>
    patchActive((b) => {
      const rm = pendingRemove.current
      pendingRemove.current = null
      let layout = withFloors(next)
      if (rm) layout = layout.filter((l) => l.i !== rm)
      return { ...b, layout }
    })

  const titleOf = (id) => WIDGETS.find((w) => w.i === id)?.title ?? id
  const removeWidget = (id) => {
    if (!window.confirm(`Remove "${titleOf(id)}" from this board?`)) return
    patchActive((b) => ({ ...b, layout: b.layout.filter((l) => l.i !== id) }))
  }
  // Drag a widget clear out of the grid to remove it (confirmed). onDragStop fires
  // before onLayoutChange, which then drops the flagged item from the layout.
  const onDragStop = (layout, oldItem, newItem, ph, e, element) => {
    const grid = element?.closest('.react-grid-layout')
    const r = grid?.getBoundingClientRect()
    if (!r || !e) return
    const out = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
    if (out && window.confirm(`Remove "${titleOf(newItem.i)}" from this board?`)) pendingRemove.current = newItem.i
  }

  // boards
  const addBoard = () => {
    const id = newId()
    setState((s) => ({
      boards: [...s.boards, normBoard({ id, name: `Board ${s.boards.length + 1}`, layout: DEFAULT_LAYOUT })],
      activeId: id,
    }))
    setEditingId(id)
  }
  const closeBoard = (id) => {
    if (boards.length <= 1) return
    const b = boards.find((x) => x.id === id)
    if (!window.confirm(`Delete board "${b?.name ?? id}"? This can't be undone.`)) return
    setState((s) => {
      if (s.boards.length <= 1) return s
      const bs = s.boards.filter((x) => x.id !== id)
      return { boards: bs, activeId: s.activeId === id ? bs[0].id : s.activeId }
    })
  }
  const renameBoard = (id, name) => patchBoards((bs) => bs.map((b) => (b.id === id ? { ...b, name: name.trim() || b.name } : b)))
  const resetActive = () => {
    const preset = DEFAULT_BOARDS.find((p) => p.id === active.id)
    patchActive((b) => ({ ...b, layout: withFloors(preset?.layout ?? DEFAULT_LAYOUT) }))
  }
  const addWidget = (id) => {
    if (!id) return
    const def = DEFAULT_LAYOUT.find((d) => d.i === id) || { w: 6, h: 8, minW: 3, minH: 5 }
    const y = active.layout.reduce((m, l) => Math.max(m, l.y + l.h), 0)
    patchActive((b) => ({ ...b, layout: withFloors([...b.layout, { ...def, i: id, x: 0, y }]) }))
  }

  // project filter
  const toggleProject = (name) => setSelectedProjects((prev) => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    try { localStorage.setItem(PROJECTFILTER_KEY, JSON.stringify({ selected: [...next] })) } catch { /* private mode */ }
    return next
  })
  const clearProjects = () => {
    setSelectedProjects(new Set())
    try { localStorage.removeItem(PROJECTFILTER_KEY) } catch { /* private mode */ }
  }

  if (error) return <div className="degraded">API unreachable: {error}</div>
  if (!data.meta) return <div className="degraded">loading…</div>

  // First-run onboarding (MOS-19): derived live from feed availability. Auto-hides
  // once nothing is unavailable (complete) or once the user dismisses it (persisted).
  const onb = deriveOnboarding(data)
  const showOnboarding = onb.steps.length > 0 && !onboarding.dismissed
  const suppressGrid = onb.fresh && !onboarding.dismissed && !showGridAnyway

  const inLayout = new Set(active.layout.map((l) => l.i))
  const visible = WIDGETS.filter((w) => inLayout.has(w.i))
  const visibleIds = new Set(visible.map((w) => w.i))
  const gridLayout = active.layout.filter((l) => visibleIds.has(l.i))
  const missing = WIDGETS.filter((w) => !inLayout.has(w.i))
  const projects = projectOptions(data)

  const dens = DENSITY[prefs.density] || DENSITY.comfortable

  return (
    <>
      <Nav open={navOpen} onClose={() => setNavOpen(false)} prefs={prefs} setPrefs={setPrefs} meta={data.meta} auth={auth} packs={data.packs} />
      <header>
        <button className="nav-toggle" onClick={() => setNavOpen(true)} title="Settings & navigation" aria-label="Open settings">☰</button>
        <h1>
          meta-os <span className="dim">/</span> {data.meta.instance}
        </h1>
        <span className="dim mono">{data.meta.instanceRoot}</span>
        {isStatic && <span className="static-badge" title="Read-only snapshot — rebuild CI to refresh">static snapshot</span>}
        {!isStatic && data.meta?.source === 'github' && (
          <span className="static-badge" title="Live reads via hosted API + GITHUB_TOKEN">github live</span>
        )}
        <span className="spacer" />
        <span className="dim hint">drag the header · resize from the edges</span>
        {missing.length > 0 && (
          <select
            className="ghostbtn addwgt"
            value=""
            onChange={(e) => { addWidget(e.target.value); e.target.value = '' }}
            title="Add a widget to this board"
          >
            <option value="">＋ Add widget</option>
            {missing.map((w) => (
              <option key={w.i} value={w.i}>{w.title}</option>
            ))}
          </select>
        )}
        <button className="ghostbtn" onClick={resetActive} title="Restore the default layout on this board">
          Reset layout
        </button>
      </header>

      {projects.length > 0 && (
        <div className="projectbar" role="group" aria-label="Project filter">
          <span className="dim small">projects</span>
          {projects.map((p) => {
            const on = selectedProjects.has(p)
            return (
              <button
                key={p}
                className={'pchip' + (on ? ' on' : '')}
                onClick={() => toggleProject(p)}
                aria-pressed={on}
                title={(on ? 'Remove ' : 'Filter to ') + p.toUpperCase()
                  + ' \u2014 narrows Sprint Lanes, Sprint Summary, Distribution & Activity'}
              >
                {p.toUpperCase()}
              </button>
            )
          })}
          {selectedProjects.size > 0 && (
            <button className="ghostbtn" onClick={clearProjects} title="Clear the project filter">show all</button>
          )}
        </div>
      )}
      <nav className="tabbar" role="tablist">
        {boards.map((b) => (
          <div key={b.id} className={'tab' + (b.id === active.id ? ' active' : '')}>
            {editingId === b.id ? (
              <input
                className="tab-edit"
                autoFocus
                defaultValue={b.name}
                onBlur={(e) => {
                  renameBoard(b.id, e.target.value)
                  setEditingId(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.target.blur()
                  if (e.key === 'Escape') setEditingId(null)
                }}
              />
            ) : (
              <button
                className="tab-name"
                role="tab"
                aria-selected={b.id === active.id}
                onClick={() => setState((s) => ({ ...s, activeId: b.id }))}
                onDoubleClick={() => setEditingId(b.id)}
                title="Click to switch · double-click to rename"
              >
                {b.name}
              </button>
            )}
            {boards.length > 1 && (
              <button className="tab-x" onClick={() => closeBoard(b.id)} title="Close board" aria-label={`Close ${b.name}`}>
                ×
              </button>
            )}
          </div>
        ))}
        <button className="tab-add" onClick={addBoard} title="New board" aria-label="New board">
          +
        </button>
      </nav>


      {showOnboarding && (
        <div className="ob-wrap">
          <Onboarding model={onb} meta={data.meta} onDismiss={() => setOnboarding((o) => ({ ...o, dismissed: true }))} />
          {suppressGrid && (
            <button className="ghostbtn ob-reveal" onClick={() => setShowGridAnyway(true)}>
              Show dashboard anyway
            </button>
          )}
        </div>
      )}

      {!suppressGrid && (
      <Grid
        key={active.id}
        className="wgrid"
        layout={gridLayout}
        cols={12}
        rowHeight={dens.rowHeight}
        margin={dens.margin}
        containerPadding={[20, 18]}
        draggableHandle=".wgt-head"
        resizeHandles={['se', 'e', 's']}
        onLayoutChange={onLayoutChange}
        onDragStop={onDragStop}
        compactType="vertical"
      >
        {visible.map((w) => (
          <div key={w.i} className="wgt">
            <div className="wgt-head">
              <span className="wgt-grip" aria-hidden="true">⠿</span>
              <span className="wgt-title">{w.title}</span>
              <span className="spacer" />
              <button
                className="wgt-x"
                title="Remove from board"
                aria-label={`Remove ${w.title}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => removeWidget(w.i)}
              >
                ×
              </button>
            </div>
            <div className="wgt-body">{w.render(scopeToProject(data, w.i, selectedProjects))}</div>
          </div>
        ))}
      </Grid>
      )}
    </>
  )
}
