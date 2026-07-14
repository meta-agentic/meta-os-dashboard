import React, { useEffect, useState } from 'react'
import GridLayout, { WidthProvider } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import Lanes from './widgets/Lanes.jsx'
import Memory from './widgets/Memory.jsx'
import Automations from './widgets/Automations.jsx'
import Registry from './widgets/Registry.jsx'
import Activity from './widgets/Activity.jsx'
import Graph from './widgets/Graph.jsx'
import Lint from './widgets/Lint.jsx'
import Outputs from './widgets/Outputs.jsx'
import Usage from './widgets/Usage.jsx'

const FEEDS = ['meta', 'ontology', 'registry', 'automations', 'memory', 'events', 'lanes', 'lint', 'outputs', 'usage']

const WIDGETS = [
  { i: 'lanes', title: 'Sprint Lanes', render: (d) => <Lanes data={d.lanes} /> },
  { i: 'graph', title: 'Knowledge Graph', render: (d) => <Graph ontology={d.ontology} /> },
  { i: 'memory', title: 'Memory', render: (d) => <Memory data={d.memory} ontology={d.ontology} /> },
  { i: 'outputs', title: 'Outputs', render: (d) => <Outputs data={d.outputs} /> },
  { i: 'automations', title: 'Automations', render: (d) => <Automations data={d.automations} /> },
  { i: 'usage', title: 'Usage', render: (d) => <Usage data={d.usage} /> },
  { i: 'registry', title: 'Registry', render: (d) => <Registry data={d.registry} /> },
  { i: 'lint', title: 'Lint', render: (d) => <Lint data={d.lint} /> },
  { i: 'activity', title: 'Activity', render: (d) => <Activity data={d.events} /> },
]

const DEFAULT_LAYOUT = [
  { i: 'lanes', x: 0, y: 0, w: 7, h: 11, minW: 4, minH: 6 },
  { i: 'graph', x: 7, y: 0, w: 5, h: 11, minW: 3, minH: 6 },
  { i: 'memory', x: 0, y: 11, w: 4, h: 8, minW: 3, minH: 5 },
  { i: 'outputs', x: 4, y: 11, w: 4, h: 8, minW: 3, minH: 5 },
  { i: 'automations', x: 8, y: 11, w: 4, h: 8, minW: 3, minH: 5 },
  { i: 'usage', x: 0, y: 19, w: 6, h: 8, minW: 3, minH: 5 },
  { i: 'registry', x: 6, y: 19, w: 3, h: 8, minW: 3, minH: 5 },
  { i: 'lint', x: 9, y: 19, w: 3, h: 8, minW: 3, minH: 5 },
  { i: 'activity', x: 0, y: 27, w: 12, h: 7, minW: 4, minH: 5 },
]
const FLOORS = Object.fromEntries(DEFAULT_LAYOUT.map((d) => [d.i, { minW: d.minW, minH: d.minH }]))
const withFloors = (layout) => (layout || []).filter((l) => FLOORS[l.i]).map((l) => ({ ...l, ...FLOORS[l.i] }))

const BOARDS_KEY = 'meta-os.boards.v1'
const LEGACY_LAYOUT_KEY = 'meta-os.layout.v1'
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
  let layout = DEFAULT_LAYOUT
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_LAYOUT_KEY) || 'null')
    if (Array.isArray(legacy) && legacy.length) layout = legacy
  } catch {
    /* ignore */
  }
  return { boards: [normBoard({ id: 'overview', name: 'Overview', layout })], activeId: 'overview' }
}

export default function App() {
  const [data, setData] = useState({})
  const [error, setError] = useState(null)
  const [{ boards, activeId }, setState] = useState(loadBoards)
  const [editingId, setEditingId] = useState(null)

  const refresh = () =>
    Promise.all(FEEDS.map((f) => fetch(`/api/${f}`).then((r) => r.json()).then((d) => [f, d])))
      .then((pairs) => setData(Object.fromEntries(pairs)))
      .catch((e) => setError(String(e)))

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(BOARDS_KEY, JSON.stringify({ boards, activeId }))
    } catch {
      /* storage disabled */
    }
  }, [boards, activeId])

  const active = boards.find((b) => b.id === activeId) || boards[0]
  const patchBoards = (fn) => setState((s) => ({ ...s, boards: fn(s.boards) }))
  const patchActive = (fn) => patchBoards((bs) => bs.map((b) => (b.id === active.id ? fn(b) : b)))

  const onLayoutChange = (next) => patchActive((b) => ({ ...b, layout: withFloors(next) }))

  // boards
  const addBoard = () => {
    const id = newId()
    setState((s) => ({
      boards: [...s.boards, normBoard({ id, name: `Board ${s.boards.length + 1}`, layout: DEFAULT_LAYOUT })],
      activeId: id,
    }))
    setEditingId(id)
  }
  const closeBoard = (id) =>
    setState((s) => {
      if (s.boards.length <= 1) return s
      const bs = s.boards.filter((b) => b.id !== id)
      return { boards: bs, activeId: s.activeId === id ? bs[0].id : s.activeId }
    })
  const renameBoard = (id, name) => patchBoards((bs) => bs.map((b) => (b.id === id ? { ...b, name: name.trim() || b.name } : b)))
  const resetActive = () => patchActive((b) => ({ ...b, layout: withFloors(DEFAULT_LAYOUT), groups: [], membership: {} }))

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

  return (
    <>
      <header>
        <h1>
          meta-os <span className="dim">/</span> {data.meta.instance}
        </h1>
        <span className="dim mono">{data.meta.instanceRoot}</span>
        <span className="spacer" />
        <span className="dim hint">drag the header · resize from the edges</span>
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
        rowHeight={30}
        margin={[14, 14]}
        containerPadding={[20, 18]}
        draggableHandle=".wgt-head"
        resizeHandles={['se', 'e', 's']}
        onLayoutChange={onLayoutChange}
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
            </div>
            <div className="wgt-body">{w.render(data)}</div>
          </div>
        ))}
      </Grid>
    </>
  )
}
