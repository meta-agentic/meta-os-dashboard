import React from 'react'
import { PieChart } from '../charts/Charts.jsx'

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)

// A tile with onClick is a count Work Items can reproduce: it renders as a button.
function Tile({ label, value, sub, tone, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={'tile' + (tone ? ' ' + tone : '') + (onClick ? ' tile-btn' : '')} onClick={onClick}
         title={onClick ? `Show these in Work Items` : undefined}>
      <div className="tile-v">{value}</div>
      <div className="tile-l">{label}</div>
      {sub != null && <div className="tile-s dim">{sub}</div>}
    </Tag>
  )
}

// The spaces come already narrowed by the header's project filter, so the report
// has no picker of its own: one space in scope shows that space, several are
// summed. Counts and points add up; velocity adds as combined throughput; the
// active sprint is only meaningful per space, so several show how many are running.
function combine(spaces) {
  if (spaces.length === 1) return { sc: spaces[0].scorecard, statusMix: spaces[0].statusMix }
  const add = (k) => spaces.reduce((n, s) => n + (s.scorecard[k] ?? 0), 0)
  const rates = spaces.map((s) => s.scorecard.velocityPerWeek).filter((v) => v != null)
  const mix = new Map()
  for (const m of spaces.flatMap((s) => s.statusMix ?? [])) {
    const cur = mix.get(m.label) ?? { label: m.label, value: 0, points: 0 }
    cur.value += m.value
    cur.points += m.points ?? 0
    mix.set(m.label, cur)
  }
  return {
    sc: {
      total: add('total'), done: add('done'), wip: add('wip'), blocked: add('blocked'),
      pointsTotal: add('pointsTotal'), pointsDone: add('pointsDone'),
      velocityPerWeek: rates.length ? +rates.reduce((a, b) => a + b, 0).toFixed(1) : null,
      running: spaces.filter((s) => s.scorecard.activeSprint).length,
    },
    // Keep the per-space bucket order (To do, In progress, Done, ...).
    statusMix: [...mix.values()],
  }
}

export default function Report({ data, onFocus }) {
  const spaces = (data?.spaces ?? []).filter((s) => s.scorecard)
  if (!spaces.length) return <div className="degraded">no backlog data to report</div>
  const { sc, statusMix } = combine(spaces)
  const single = spaces.length === 1
  // Presets use the report's own rules — stories only (no epics), exact status —
  // so Work Items lists exactly the items the tile counted.
  const show = (label, rule) => onFocus && (() =>
    onFocus({ label, ...rule, stories: true, spaces: spaces.map((s) => s.space) }))

  return (
    <div className="report">
      <div className="dim small">{spaces.map((s) => s.space.toUpperCase()).join(' · ')}</div>

      <div className="tiles">
        <Tile label="Stories done" value={`${sc.done}/${sc.total}`} sub={`${pct(sc.done, sc.total)}%`} tone="ok"
              onClick={show('stories done', { status: 'DONE' })} />
        <Tile label="Points done" value={`${sc.pointsDone}/${sc.pointsTotal}`} sub={`${pct(sc.pointsDone, sc.pointsTotal)}%`} />
        <Tile label="In progress" value={sc.wip} tone="wip" onClick={show('in progress', { status: 'IN PROGRESS' })} />
        <Tile label="Blocked" value={sc.blocked} tone={sc.blocked ? 'down' : undefined} onClick={show('blocked', { blocked: true })} />
        <Tile label="Velocity" value={sc.velocityPerWeek ?? '—'} sub={single ? 'pts / week' : 'pts / week, combined'} />
        {single
          ? <Tile label="Active sprint" value={sc.activeSprint ? `${Math.round((sc.elapsed ?? 0) * 100)}%` : '—'} sub={sc.activeSprint ?? 'none'} />
          : <Tile label="Active sprints" value={sc.running} sub={`of ${spaces.length} projects`} />}
      </div>

      <div className="report-charts">
        <div className="rc">
          <h3 className="rc-h">Status mix</h3>
          <PieChart data={statusMix.map((m) => ({ label: m.label, value: m.value }))} onSelect={() => {}} unit="stories" />
        </div>
      </div>
    </div>
  )
}
