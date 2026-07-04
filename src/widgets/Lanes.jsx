import React from 'react'
import Card from './Card.jsx'

// 2px time-progress line: the elapsed share of the sprint window in dark yellow,
// the remainder dark gray.
function SprintProgress({ start, end }) {
  const t0 = new Date(start), t1 = new Date(end)
  if (isNaN(t0) || isNaN(t1) || t1 <= t0) return null
  const spent = Math.min(Math.max((Date.now() - t0) / (t1 - t0), 0), 1)
  return (
    <div className="sprintbar" title={`${Math.round(spent * 100)}% of sprint window elapsed`}>
      <i style={{ width: `${spent * 100}%` }} />
    </div>
  )
}

// Story-point sum for a queue, shown under the count; hidden when the stories
// carry no estimates (0 would misread as "estimated at zero").
function Points({ n }) {
  return n > 0 ? <div className="dim small">{n}pt</div> : null
}

// One slot per story, done → wip → todo (progress reads left to right), filling the
// whole rectangle.
function QueueBar({ queues }) {
  const slots = [
    ...queues.done.map(() => 'done'),
    ...queues['in-progress'].map(() => 'wip'),
    ...queues.todo.map(() => 'todo'),
  ]
  if (!slots.length) return null
  const title = `${queues.todo.length} todo · ${queues['in-progress'].length} wip · ${queues.done.length} done`
  return (
    <div className="queueslots" title={title}>
      {slots.map((s, i) => <span key={i} className={`slot ${s}`} />)}
    </div>
  )
}

export default function Lanes({ data }) {
  // Spaces with no active sprint collapse into one summary line instead of an
  // empty section each — they carry no flow to show.
  const idle = (data?.spaces ?? []).filter((s) => s.available !== false && s.lanes.length === 0)
  const active = (data?.spaces ?? []).filter((s) => s.available === false || s.lanes.length > 0)
  return (
    <Card title="Lanes — active sprint flow" data={data} span={2}>
      {active.map((s) =>
        s.available === false ? (
          <div key={s.space} className="degraded">{s.space}: {s.reason}</div>
        ) : (
          <div key={s.space} className="space">
            <div className="spacehead">
              <strong>{s.space.toUpperCase()}</strong>
              {s.sprint.map((sp) => (
                <span key={sp.id} className="dim">
                  {sp.name} · {sp.start} → {sp.end}
                </span>
              ))}
              <span className="spacer" />
              {s.forecast.throughputPerWeek != null && (
                <span className="chip">throughput {s.forecast.throughputPerWeek}/wk</span>
              )}
              {s.forecast.acceleration && (
                <span
                  className={`chip ${s.forecast.acceleration.pct > 0 ? 'ok' : s.forecast.acceleration.pct < 0 ? 'down' : ''}`}
                  title={`${s.forecast.acceleration.last.id}: ${s.forecast.acceleration.last.velocity}/wk vs median(${s.forecast.acceleration.baseline.sprints.join(', ')}): ${s.forecast.acceleration.baseline.velocity}/wk`}
                >
                  {s.forecast.acceleration.pct > 0 ? '▲' : s.forecast.acceleration.pct < 0 ? '▼' : '►'}{' '}
                  {s.forecast.acceleration.pct > 0 ? '+' : ''}{s.forecast.acceleration.pct}%
                </span>
              )}
              {s.forecast.etaWeeks != null && <span className="chip eta">ETA ~{s.forecast.etaWeeks} wk</span>}
            </div>
            {s.sprint.map((sp) => (
              <SprintProgress key={sp.id} start={sp.start} end={sp.end} />
            ))}
            <table>
              <thead>
                <tr><th>lane</th><th>queue</th><th className="num">todo</th><th className="num">wip</th><th className="num">done</th></tr>
              </thead>
              <tbody>
                {s.lanes.map((l) => (
                  <tr key={l.lane}>
                    <td className="mono">{l.lane}</td>
                    <td><QueueBar queues={l.queues} /></td>
                    <td className="num">{l.depth}<Points n={l.points?.todo} /></td>
                    <td className="num">{l.wip}<Points n={l.points?.wip} /></td>
                    <td className="num">{l.done}<Points n={l.points?.done} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="dim small">
              forecast: {s.forecast.basis} · cycle-time n/a — {s.forecast.cycleTimeReason}
            </div>
          </div>
        ),
      )}
      {idle.length > 0 && (
        <div className="dim small">
          no active sprint: {idle.map((s) => s.space.toUpperCase()).join(' · ')}
        </div>
      )}
    </Card>
  )
}
