import React, { useState } from 'react'
import { LineChart, PieChart } from '../charts/Charts.jsx'

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

// Honest burndown: the mirror has no daily history, so we draw the ideal
// committed→0 line and a single actual marker at (elapsed, remaining).
function Burndown({ b }) {
  if (!b || !b.committed) return null
  const W = 300, H = 90, pad = 18
  const x = (f) => pad + f * (W - pad * 2)
  const y = (v) => H - pad - (v / b.committed) * (H - pad * 2)
  const e = b.elapsed ?? 0
  const behind = b.remaining > b.committed * (1 - e)
  return (
    <div className="burn">
      <div className="burn-head">
        <span className="dim small">Burndown · {b.sprint}</span>
        <span className={'chip ' + (behind ? 'down' : 'ok')}>{b.remaining} / {b.committed} pts left</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="burn-svg" role="img" aria-label="burndown">
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} className="axis" />
        <line x1={x(0)} y1={y(b.committed)} x2={x(1)} y2={y(0)} className="burn-ideal" />
        {b.elapsed != null && <line x1={x(e)} y1={pad} x2={x(e)} y2={H - pad} className="burn-now" />}
        <line x1={x(0)} y1={y(b.committed)} x2={x(e)} y2={y(b.remaining)} className="burn-actual" />
        <circle cx={x(e)} cy={y(b.remaining)} r={3.5} className="burn-dot" />
      </svg>
      <div className="dim small">ideal line vs one actual point — the mirror carries no daily history.</div>
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

      <Burndown b={s.burndown} />

      <div className="report-charts">
        <div className="rc">
          <h3 className="rc-h">Velocity — delivered pts / closed sprint</h3>
          {s.velocity.length >= 2 ? <LineChart data={s.velocity} /> : <div className="dim small">not enough closed sprints</div>}
        </div>
        <div className="rc">
          <h3 className="rc-h">Status mix</h3>
          <PieChart data={s.statusMix.map((m) => ({ label: m.label, value: m.value }))} onSelect={() => {}} />
        </div>
      </div>
    </div>
  )
}
