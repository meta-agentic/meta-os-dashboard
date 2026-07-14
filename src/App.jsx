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

// Widget registry — id must match the layout `i`. Each renders from the shared data map.
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
const WIDGET_BY_ID = Object.fromEntries(WIDGETS.map((w) => [w.i, w]))

// Default disposition on a 12-column grid; minW/minH are the per-widget floors.
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
// re-assert per-widget floors and drop items for widgets that no longer exist
const withFloors = (layout) =>
  (layout || []).filter((l) => FLOORS[l.i]).map((l) => ({ ...l, ...FLOORS[l.i] }))

const BOARDS_KEY = 'meta-os.boards.v1'
const LEGACY_LAYOUT_KEY = 'meta-os.layout.v1'
const Grid = WidthProvider(GridLayout)
const newId = () => 'b' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36)

function loadBoards() {
  try {
    const saved = JSON.parse(localStorage.getItem(BOARDS_KEY) || 'null')
    if (saved && Array.isArray(saved.boards) && saved.boards.length) {
      const boards = saved.boards.map((b) => ({ ...b, layout: withFloors(b.layout) }))
      const activeId = boards.some((b) => b.id === saved.activeId) ? saved.activeId : boards[0].id
      return { boards, activeId }
    }
  } catch {
    /* fall through to migration */
  }
  let layout = DEFAULT_LAYOUT
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_LAYOUT_KEY) || 'null')
    if (Array.isArray(legacy) && legacy.length) layout = legacy
  } catch {
    /* ignore */
  }
  return { boards: [{ id: 'overview', name: 'Overview', layout: withFloors(layout) }], activeId: 'overview' }
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

  // persist boards + active tab
  useEffect(() => {
    try {
      localStorage.setItem(BOARDS_KEY, JSON.stringify({ boards, activeId }))
    } catch {
      /* storage disabled */
    }
  }, [boards, activeId])

  const active = boards.find((b) => b.id === activeId) || boards[0]

  const patchBoards = (fn) => setState((s) => ({ ...s, boards: fn(s.boards) }))
  const onLayoutChange = (next) =>
    patchBoards((bs) => bs.map((b) => (b.id === active.id ? { ...b, layout: withFloors(next) } : b)))

  const addBoard = () => {
    const id = newId()
    // start a new tab from the default disposition so it has widgets to arrange
    setState((s) => ({
      boards: [...s.boards, { id, name: `Board ${s.boards.length + 1}`, layout: withFloors(DEFAULT_LAYOUT) }],
      activeId: id,
    }))
    setEditingId(id)
  }
  const closeBoard = (id) =>
    setState((s) => {
      if (s.boards.length <= 1) return s
      const boards = s.boards.filter((b) => b.id !== id)
      const activeId = s.activeId === id ? boards[0].id : s.activeId
      return { boards, activeId }
    })
  const renameBoard = (id, name) =>
    patchBoards((bs) => bs.map((b) => (b.id === id ? { ...b, name: name.trim() || b.name } : b)))
  const resetActive = () => onLayoutChange(withFloors(DEFAULT_LAYOUT))

  if (error) return <div className="degraded">API unreachable: {error}</div>
  if (!data.meta) return <div className="degraded">loading…</div>

  const shown = WIDGETS.filter((w) => active.layout.some((l) => l.i === w.i))

  return (
    <>
      <header>
        <h1>
          meta-os <span className="dim">/</span> {data.meta.instance}
        </h1>
        <span className="dim mono">{data.meta.instanceRoot}</span>
        <span className="spacer" />
        <span className="dim hint">drag the header · resize from the edges</span>
        <button className="ghostbtn" onClick={resetActive} title="Restore the default widget layout on this board">
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

      <Grid
        key={active.id}
        className="wgrid"
        layout={active.layout}
        cols={12}
        rowHeight={30}
        margin={[14, 14]}
        containerPadding={[20, 18]}
        draggableHandle=".wgt-head"
        resizeHandles={['se', 'e', 's']}
        onLayoutChange={onLayoutChange}
        compactType="vertical"
      >
        {shown.map((w) => (
          <div key={w.i} className="wgt">
            <div className="wgt-head">
              <span className="wgt-grip" aria-hidden="true">⠿</span>
              <span className="wgt-title">{w.title}</span>
            </div>
            <div className="wgt-body">{w.render(data)}</div>
          </div>
        ))}
      </Grid>
    </>
  )
}
