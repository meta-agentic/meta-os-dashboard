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

const LS_KEY = 'meta-os.layout.v1'
const Grid = WidthProvider(GridLayout)

function loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    if (!Array.isArray(saved) || !saved.length) return DEFAULT_LAYOUT
    // merge: keep saved geometry, but re-assert min floors from the default (so old saves stay valid)
    const floors = Object.fromEntries(DEFAULT_LAYOUT.map((d) => [d.i, d]))
    return saved
      .filter((s) => floors[s.i])
      .map((s) => ({ ...s, minW: floors[s.i].minW, minH: floors[s.i].minH }))
  } catch {
    return DEFAULT_LAYOUT
  }
}

export default function App() {
  const [data, setData] = useState({})
  const [error, setError] = useState(null)
  const [layout, setLayout] = useState(loadLayout)

  const refresh = () =>
    Promise.all(FEEDS.map((f) => fetch(`/api/${f}`).then((r) => r.json()).then((d) => [f, d])))
      .then((pairs) => setData(Object.fromEntries(pairs)))
      .catch((e) => setError(String(e)))

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [])

  const onLayoutChange = (next) => {
    setLayout(next)
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next))
    } catch {
      /* storage disabled — layout stays in-memory only */
    }
  }

  const resetLayout = () => {
    try {
      localStorage.removeItem(LS_KEY)
    } catch {
      /* ignore */
    }
    setLayout(DEFAULT_LAYOUT.map((d) => ({ ...d })))
  }

  if (error) return <div className="degraded">API unreachable: {error}</div>
  if (!data.meta) return <div className="degraded">loading…</div>

  return (
    <>
      <header>
        <h1>
          meta-os <span className="dim">/</span> {data.meta.instance}
        </h1>
        <span className="dim mono">{data.meta.instanceRoot}</span>
        <span className="spacer" />
        <span className="dim hint">drag the header · resize from the edges</span>
        <button className="ghostbtn" onClick={resetLayout} title="Restore the default widget layout">
          Reset layout
        </button>
      </header>
      <Grid
        className="wgrid"
        layout={layout}
        cols={12}
        rowHeight={30}
        margin={[14, 14]}
        containerPadding={[20, 18]}
        draggableHandle=".wgt-head"
        resizeHandles={['se', 'e', 's']}
        onLayoutChange={onLayoutChange}
        compactType="vertical"
      >
        {WIDGETS.map((w) => (
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
