import React from 'react'

const day = 864e5
const statusClass = (s) => (s === 'CLOSED' ? 'done' : s === 'IN PROGRESS' ? 'wip' : 'todo')
const shortDate = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

// Month-boundary ticks across the [min,max] window for the timeline grid.
function monthTicks(min, max) {
  const ticks = []
  const d = new Date(min)
  d.setDate(1)
  if (d.getTime() < min) d.setMonth(d.getMonth() + 1)
  let guard = 0
  while (d.getTime() <= max && guard++ < 120) {
    ticks.push({ t: d.getTime(), label: d.toLocaleDateString(undefined, { month: 'short' }) })
    d.setMonth(d.getMonth() + 1)
  }
  return ticks
}

export default function Gantt({ data }) {
  const bars = data?.roadmap ?? []
  if (!bars.length) return <div className="degraded">no dated sprints to plot</div>

  const min = Math.min(...bars.map((b) => +new Date(b.start)))
  const max = Math.max(...bars.map((b) => +new Date(b.end) + day)) // include the end day
  const span = Math.max(max - min, 1)
  const pct = (t) => ((t - min) / span) * 100
  const now = Date.now()
  const todayPct = now >= min && now <= max ? pct(now) : null
  const ticks = monthTicks(min, max)

  return (
    <div className="gantt">
      <div className="gantt-axis">
        {ticks.map((tk, i) => (
          <span key={i} className="gantt-tick" style={{ left: `${pct(tk.t)}%` }}>{tk.label}</span>
        ))}
      </div>
      <div className="gantt-rows">
        {todayPct != null && <div className="gantt-today" style={{ left: `${todayPct}%` }} title="today" />}
        {ticks.map((tk, i) => (
          <div key={i} className="gantt-grid" style={{ left: `${pct(tk.t)}%` }} />
        ))}
        {bars.map((b) => {
          const left = pct(+new Date(b.start))
          const width = Math.max(pct(+new Date(b.end) + day) - left, 1.5)
          return (
            <div className="gantt-row" key={b.space + b.id}>
              <span className="gantt-lbl" title={`${b.space} · ${b.name}`}>
                <span className="chip">{b.space}</span> {b.name}
              </span>
              <span className="gantt-track">
                <span
                  className={'gantt-bar ' + statusClass(b.status)}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${b.name}: ${shortDate(b.start)} → ${shortDate(b.end)} · ${b.donePct}% delivered`}
                >
                  <i className="gantt-fill" style={{ width: `${b.donePct}%` }} />
                  <span className="gantt-bar-lbl">{b.donePct}%</span>
                </span>
              </span>
            </div>
          )
        })}
      </div>
      <div className="gantt-foot dim small">
        <span>{shortDate(min)}</span>
        <span>{shortDate(max)}</span>
      </div>
    </div>
  )
}
