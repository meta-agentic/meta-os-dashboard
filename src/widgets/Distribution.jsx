import React, { useState } from 'react'
import { BarChart, PieChart, LineChart } from '../charts/Charts.jsx'

// Build a 3-level hierarchy from the lanes feed: space → lane → status, valued
// by item count or story points. This is the drill-down data model — each node
// may carry `children`, and the chart drills when a node with children is picked.
function buildRoots(lanes, metric) {
  const spaces = (lanes?.spaces ?? []).filter((s) => s.lanes && s.lanes.length)
  const laneTotal = (l) =>
    metric === 'points'
      ? (l.points?.todo ?? 0) + (l.points?.wip ?? 0) + (l.points?.done ?? 0)
      : l.depth + l.wip + l.done
  return spaces.map((s) => ({
    label: s.space.toUpperCase(),
    value: s.lanes.reduce((a, l) => a + laneTotal(l), 0),
    children: s.lanes
      .map((l) => ({
        label: l.lane,
        value: laneTotal(l),
        children: [
          { label: 'To do', value: metric === 'points' ? l.points?.todo ?? 0 : l.depth },
          { label: 'In progress', value: metric === 'points' ? l.points?.wip ?? 0 : l.wip },
          { label: 'Done', value: metric === 'points' ? l.points?.done ?? 0 : l.done },
        ].filter((c) => c.value > 0),
      }))
      .filter((l) => l.value > 0),
  }))
}

const TYPES = [
  { v: 'pie', label: 'Pie' },
  { v: 'bar', label: 'Bar' },
  { v: 'line', label: 'x-y' },
]
const METRICS = [
  { v: 'items', label: 'Items' },
  { v: 'points', label: 'Points' },
]

export default function Distribution({ data }) {
  const [type, setType] = useState('pie')
  const [metric, setMetric] = useState('items')
  const [path, setPath] = useState([]) // indices from root down

  const roots = buildRoots(data, metric)
  // Walk the drill path; if a stale index falls off (data changed), clamp.
  let node = { label: 'All spaces', children: roots }
  const crumbs = [{ label: 'All', node }]
  for (const idx of path) {
    const next = node.children?.[idx]
    if (!next) break
    node = next
    crumbs.push({ label: next.label, node: next })
  }
  const current = node.children ?? []

  const select = (i) => setPath((p) => [...p.slice(0, crumbs.length - 1), i])
  const goto = (depth) => setPath((p) => p.slice(0, depth))

  if (!roots.length) return <div className="degraded">no active-sprint data to chart</div>

  return (
    <div className="dist">
      <div className="dist-ctl">
        <div className="seg">
          {TYPES.map((t) => (
            <button key={t.v} className={'seg-b' + (type === t.v ? ' on' : '')} onClick={() => setType(t.v)}>{t.label}</button>
          ))}
        </div>
        <div className="seg">
          {METRICS.map((m) => (
            <button key={m.v} className={'seg-b' + (metric === m.v ? ' on' : '')} onClick={() => setMetric(m.v)}>{m.label}</button>
          ))}
        </div>
      </div>
      <nav className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i}>
            {i > 0 && <span className="crumb-sep">›</span>}
            {i < crumbs.length - 1 ? (
              <button className="crumb" onClick={() => goto(i)}>{c.label}</button>
            ) : (
              <span className="crumb cur">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="dist-chart">
        {type === 'pie' && <PieChart data={current} onSelect={select} />}
        {type === 'bar' && <BarChart data={current} onSelect={select} />}
        {type === 'line' && <LineChart data={current} />}
      </div>
      {type === 'line' && current.some((c) => c.children?.length) && (
        <p className="dim small">x-y plots values in order — switch to Pie or Bar to drill in.</p>
      )}
    </div>
  )
}
