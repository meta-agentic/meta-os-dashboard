import React, { useEffect, useRef, useState } from 'react'
import GridLayout, { WidthProvider } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import Lanes from './widgets/Lanes.jsx'
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

const FEEDS = ['meta', 'ontology', 'registry', 'automations', 'memory', 'events', 'lanes', 'lint', 'outputs', 'usage', 'report']

const WIDGETS = [
  { i: 'lanes', title: 'Sprint Lanes', render: (d) => <Lanes data={d.lanes} /> },
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
  { i: 'report', title: 'Scrum Report', render: (d) => <Report data={d.report} /> },
]

const DEFAULT_LAYOUT = [
  { i: 'lanes', x: 0, y: 0, w: 7, h: 11, minW: 4, minH: 6 },
  { i: 'graph', x: 7, y: 0, w: 5, h: 11, minW: 3, minH: 6 },
  { i: 'memory', x: 0, y: 11, w: 4, h: 8, minW: 3, minH: 5 },
  { i: 'memory-flux', x: 4, y: 11, w: 4, h: 9, minW: 3, minH: 7 },
  { i: 'outputs', x: 8, y: 11, w: 4, h: 8, minW: 3, minH: 5 },
  { i: 'automations', x: 0, y: 20, w: 4, h: 8, minW: 3, minH: 5 },
  { i: 'usage', x: 0, y: 19, w: 6, h: 8, minW: 3, minH: 5 },
  { i: 'registry', x: 6, y: 19, w: 3, h: 8, minW: 3, minH: 5 },
  { i: 'lint', x: 9, y: 19, w: 3, h: 8, minW: 3, minH: 5 },
  { i: 'activity', x: 0, y: 27, w: 8, h: 7, minW: 4, minH: 5 },
  { i: 'distribution', x: 8, y: 27, w: 4, h: 9, minW: 3, minH: 7 },
  { i: 'files', x: 0, y: 36, w: 6, h: 11, minW: 3, minH: 7 },
  { i: 'gantt', x: 6, y: 36, w: 6, h: 11, minW: 4, minH: 7 },
  { i: 'report', x: 0, y: 47, w: 12, h: 12, minW: 5, minH: 9 },
  { i: 'graph-table', x: 0, y: 59, w: 6, h: 8, minW: 3, minH: 5 },
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
      { i: 'lanes', x: 0, y: 0, w: 7, h: 11 },
      { i: 'usage', x: 7, y: 0, w: 5, h: 11 },
      { i: 'memory', x: 0, y: 11, w: 4, h: 8 },
      { i: 'outputs', x: 4, y: 11, w: 4, h: 8 },
      { i: 'activity', x: 8, y: 11, w: 4, h: 8 },
    ],
  },
  {
    id: 'knowledge', name: 'Knowledge',
    layout: [
      { i: 'graph', x: 0, y: 0, w: 8, h: 11 },
      { i: 'graph-table', x: 8, y: 0, w: 4, h: 11 },
      { i: 'memory', x: 0, y: 11, w: 4, h: 8 },
      { i: 'memory-flux', x: 4, y: 11, w: 4, h: 9 },
      { i: 'files', x: 8, y: 11, w: 4, h: 11 },
    ],
  },
  {
    id: 'delivery', name: 'Delivery',
    layout: [
      { i: 'lanes', x: 0, y: 0, w: 7, h: 11 },
      { i: 'distribution', x: 7, y: 0, w: 5, h: 11 },
      { i: 'gantt', x: 0, y: 11, w: 12, h: 11 },
      { i: 'report', x: 0, y: 22, w: 12, h: 12 },
    ],
  },
  {
    id: 'operations', name: 'Operations',
    layout: [
      { i: 'usage', x: 0, y: 0, w: 6, h: 9 },
      { i: 'automations', x: 6, y: 0, w: 6, h: 9 },
      { i: 'activity', x: 0, y: 9, w: 8, h: 7 },
      { i: 'lint', x: 8, y: 9, w: 4, h: 7 },
      { i: 'registry', x: 0, y: 16, w: 12, h: 8 },
    ],
  },
]

const BOARDS_KEY = 'meta-os.boards.v1'
const LEGACY_LAYOUT_KEY = 'meta-os.layout.v1'
const PREFS_KEY = 'meta-os.prefs.v1'
const DEFAULT_PREFS = { theme: 'system', density: 'comfortable', refreshSec: 30 }
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
const Grid = WidthProvider(GridLayout)
const newId = (p = 'b') => p + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36)
const normBoard = (b) => ({ groups: [], membership: {}, ...b, layout: withFloors(b.layout) })

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
  const [editingId, setEditingId] = useState(null)
  const [prefs, setPrefs] = useState(loadPrefs)
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
    if (prefs.theme === 'system') delete el.dataset.theme
    else el.dataset.theme = prefs.theme
  }, [prefs.theme])

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      /* storage disabled */
    }
  }, [prefs])

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
      let membership = b.membership
      if (rm) {
        layout = layout.filter((l) => l.i !== rm)
        membership = { ...b.membership }
        delete membership[rm]
      }
      return { ...b, layout, membership }
    })

  const titleOf = (id) => WIDGETS.find((w) => w.i === id)?.title ?? id
  const removeWidget = (id) => {
    if (!window.confirm(`Remove "${titleOf(id)}" from this board?`)) return
    patchActive((b) => {
      const membership = { ...b.membership }
      delete membership[id]
      return { ...b, layout: b.layout.filter((l) => l.i !== id), membership }
    })
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
    patchActive((b) => ({ ...b, layout: withFloors(preset?.layout ?? DEFAULT_LAYOUT), groups: [], membership: {} }))
  }
  const addWidget = (id) => {
    if (!id) return
    const def = DEFAULT_LAYOUT.find((d) => d.i === id) || { w: 6, h: 8, minW: 3, minH: 5 }
    const y = active.layout.reduce((m, l) => Math.max(m, l.y + l.h), 0)
    patchActive((b) => ({ ...b, layout: withFloors([...b.layout, { ...def, i: id, x: 0, y }]) }))
  }

  // groups
  const assignGroup = (widgetId, value) => {
    if (value === '__new') {
      const name = window.prompt('New group name', 'Group')
      if (!name) return
      const gid = newId('g')
      patchActive((b) => ({
        ...b,
        groups: [...b.groups, { id: gid, name: name.trim() || 'Group', collapsed: false }],
        membership: { ...b.membership, [widgetId]: gid },
      }))
      return
    }
    patchActive((b) => {
      const membership = { ...b.membership }
      if (value) membership[widgetId] = value
      else delete membership[widgetId]
      return { ...b, membership }
    })
  }
  const toggleGroup = (gid) =>
    patchActive((b) => ({ ...b, groups: b.groups.map((g) => (g.id === gid ? { ...g, collapsed: !g.collapsed } : g)) }))
  const ungroup = (gid) =>
    patchActive((b) => {
      const membership = Object.fromEntries(Object.entries(b.membership).filter(([, v]) => v !== gid))
      return { ...b, groups: b.groups.filter((g) => g.id !== gid), membership }
    })

  if (error) return <div className="degraded">API unreachable: {error}</div>
  if (!data.meta) return <div className="degraded">loading…</div>

  const collapsed = new Set(active.groups.filter((g) => g.collapsed).map((g) => g.id))
  const inLayout = new Set(active.layout.map((l) => l.i))
  const visible = WIDGETS.filter(
    (w) => inLayout.has(w.i) && !collapsed.has(active.membership[w.i]),
  )
  const visibleIds = new Set(visible.map((w) => w.i))
  const gridLayout = active.layout.filter((l) => visibleIds.has(l.i))
  const countIn = (gid) => Object.values(active.membership).filter((v) => v === gid).length
  const missing = WIDGETS.filter((w) => !inLayout.has(w.i))

  const dens = DENSITY[prefs.density] || DENSITY.comfortable

  return (
    <>
      <Nav open={navOpen} onClose={() => setNavOpen(false)} prefs={prefs} setPrefs={setPrefs} meta={data.meta} auth={auth} />
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
        <button className="ghostbtn" onClick={resetActive} title="Restore the default layout & clear groups on this board">
          Reset layout
        </button>
      </header>

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

      {active.groups.length > 0 && (
        <div className="groupbar">
          {active.groups.map((g) => (
            <span key={g.id} className={'gchip' + (g.collapsed ? ' collapsed' : '')}>
              <button className="gchip-toggle" onClick={() => toggleGroup(g.id)} title={g.collapsed ? 'Expand group' : 'Collapse group'}>
                <span className="chev">{g.collapsed ? '▸' : '▾'}</span> {g.name} <span className="gcount">{countIn(g.id)}</span>
              </button>
              <button className="gchip-x" onClick={() => ungroup(g.id)} title="Ungroup" aria-label={`Ungroup ${g.name}`}>×</button>
            </span>
          ))}
        </div>
      )}

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
              <select
                className="wgt-group"
                title="Assign to a group"
                value={active.membership[w.i] || ''}
                onChange={(e) => assignGroup(w.i, e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <option value="">— no group —</option>
                {active.groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
                <option value="__new">＋ New group…</option>
              </select>
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
            <div className="wgt-body">{w.render(data)}</div>
          </div>
        ))}
      </Grid>
    </>
  )
}
