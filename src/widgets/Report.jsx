import React, { useState } from 'react'
import { PieChart } from '../charts/Charts.jsx'

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)

function Tile({ label, value, sub, tone }) {
  return (
    <div className={'tile' + (tone ? ' ' + tone : '')}>
      <div className="tile-v">{value}</div>
      <div className="tile-l">{label}</div>
      {sub != null && <div className="tile-s dim">{sub}</div>}
    </div>
  )
}

export default function Report({ data }) {
  const spaces = (data?.spaces ?? []).filter((s) => s.scorecard)
  const [sel, setSel] = useState(0)
  if (!spaces.length) return <div className="degraded">no backlog data to report</div>
  const idx = Math.min(sel, spaces.length - 1)
  const s = spaces[idx]
  const sc = s.scorecard

  return (
    <div className="report">
      {spaces.length > 1 && (
        <div className="seg">
          {spaces.map((sp, i) => (
            <button key={sp.space} className={'seg-b' + (i === idx ? ' on' : '')} onClick={() => setSel(i)}>
              {sp.space.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      <div className="tiles">
        <Tile label="Stories done" value={`${sc.done}/${sc.total}`} sub={`${pct(sc.done, sc.total)}%`} tone="ok" />
        <Tile label="Points done" value={`${sc.pointsDone}/${sc.pointsTotal}`} sub={`${pct(sc.pointsDone, sc.pointsTotal)}%`} />
        <Tile label="In progress" value={sc.wip} tone="wip" />
        <Tile label="Blocked" value={sc.blocked} tone={sc.blocked ? 'down' : undefined} />
        <Tile label="Velocity" value={sc.velocityPerWeek ?? '—'} sub="pts / week" />
        <Tile label="Active sprint" value={sc.activeSprint ? `${Math.round((sc.elapsed ?? 0) * 100)}%` : '—'} sub={sc.activeSprint ?? 'none'} />
      </div>

      <div className="report-charts">
        <div className="rc">
          <h3 className="rc-h">Status mix</h3>
          <PieChart data={s.statusMix.map((m) => ({ label: m.label, value: m.value }))} onSelect={() => {}} unit="stories" />
        </div>
      </div>
    </div>
  )
}
