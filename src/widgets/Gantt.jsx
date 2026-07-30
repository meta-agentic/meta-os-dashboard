import React, { useState } from 'react'

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
  const all = data?.roadmap ?? []
  // Toggleable project tags. Every space starts ON, so the default view is the
  // whole estate and the filter is opt-in. Deselecting all would leave an empty
  // chart with no way back, so the last active tag cannot be turned off.
  const tags = [...new Set(all.map((b) => b.space))].sort()
  const [off, setOff] = useState(() => new Set())
  const shown = tags.filter((s) => !off.has(s))
  const toggle = (s) => setOff((prev) => {
    const next = new Set(prev)
    if (next.has(s)) next.delete(s)
    else if (shown.length > 1) next.add(s)
    return next
  })

  if (!all.length) return <div className="degraded">no dated sprints to plot</div>
  const bars = all.filter((b) => !off.has(b.space))

  const TagBar = (
    <div className="chips">
      {tags.map((s) => {
        const on = !off.has(s)
        const n = all.filter((b) => b.space === s).length
        return (
          <button key={s} className={'chip' + (on ? ' on' : '')}
                  title={on
                    ? `${s.toUpperCase()}: ${n} sprint${n === 1 ? '' : 's'} — click to hide`
                    : `${s.toUpperCase()} hidden — click to show`}
                  onClick={() => toggle(s)}>
            {s.toUpperCase()} <span className="dim">{n}</span>
          </button>
        )
      })}
      {off.size > 0 && (
        <button className="chip" onClick={() => setOff(new Set())} title="show every project">reset</button>
      )}
    </div>
  )

  if (!bars.length) return <>{TagBar}<div className="degraded">every project hidden</div></>

  // Window is recomputed from the VISIBLE bars, so filtering to one project zooms
  // the axis to that project rather than leaving it stretched across the estate.
  const min = Math.min(...bars.map((b) => +new Date(b.start)))
  const max = Math.max(...bars.map((b) => +new Date(b.end) + day)) // include the end day
  const span = Math.max(max - min, 1)
  const pct = (t) => ((t - min) / span) * 100
  const now = Date.now()
  const todayPct = now >= min && now <= max ? pct(now) : null
  const ticks = monthTicks(min, max)

  return (
    <div className="gantt">
      {TagBar}
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
