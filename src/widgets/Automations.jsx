import React from 'react'
import Card from './Card.jsx'

function ago(ts) {
  const mins = Math.floor((Date.now() - new Date(ts)) / 60000)
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 48) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}

function inRel(ts) {
  const mins = Math.max(Math.round((new Date(ts) - Date.now()) / 60000), 0)
  if (mins < 60) return `in ${mins}m`
  return `in ${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}`
}

// "never" has three very different meanings, and collapsing them is what made a
// shipped row look broken. The server's `health` verdict separates them:
//   inactive — candidate/retired: nothing is owed yet, so this is not an alarm
//   unlogged — shipped but event/on-demand: runs.jsonl is the only evidence there is,
//              so silence means "never logged", which is weaker than "never ran"
//   never    — shipped AND scheduled: a run was owed and none exists. Real failure.
const NEVER = {
  never: { cls: 'warn', dot: 'fail', text: 'never',
    hint: 'shipped and scheduled, but no run was ever logged' },
  unlogged: { cls: 'dim small', dot: null, text: 'never logged',
    hint: 'on-demand automation — it appears here once it appends to automations/runs.jsonl' },
  inactive: { cls: 'dim small', dot: null, text: 'never',
    hint: 'not shipped yet — no run is owed' },
}

function LastRun({ r }) {
  if (!r.lastRun) {
    const s = NEVER[r.health] ?? NEVER.inactive
    return (
      <span className={s.cls} title={s.hint}>
        {s.dot && <span className={`dot ${s.dot}`} />}{s.text}
        {r.missed > 0 && <span className="dim small"> · {r.missed}{r.missedCapped ? '+' : ''} owed</span>}
      </span>
    )
  }
  const failed = r.lastRun.outcome === 'fail'
  const late = r.health === 'overdue'
  return (
    <span className={failed || late ? 'warn' : ''}
      title={late ? `${r.missed}${r.missedCapped ? '+' : ''} scheduled run(s) missed since ${new Date(r.lastRun.ts).toLocaleString()}` : undefined}>
      <span className={`dot ${failed ? 'fail' : late ? 'late' : 'ok'}`} />
      {ago(r.lastRun.ts)}
      {late && <span className="chip down">overdue · {r.missed}{r.missedCapped ? '+' : ''} missed</span>}
    </span>
  )
}

function Next({ r }) {
  if (r.nextReason) return <span className="warn small" title={r.nextReason}>?</span>
  if (!r.upcoming) return <span className="dim small">—</span>
  if (!r.upcoming.length) return <span className="dim small">&gt;48h</span>
  return <span className="small">{inRel(r.upcoming[0])}</span>
}

// The next-48h strip: one tick per scheduled run, positioned by time. Shipped rows
// run for real (accent); candidates would run once shipped (dim) — visible but
// distinguishable, so the strip never implies a candidate is live.
function NextStrip({ rows, schedule }) {
  if (!schedule) return null
  const t0 = new Date(schedule.now).getTime()
  const span = schedule.horizonHours * 3600e3
  const ticks = rows
    .flatMap((r) => (r.upcoming ?? []).map((ts) => ({ ts, automation: r.automation, status: r.status })))
    .filter((t) => new Date(t.ts) - t0 <= span)
  if (!ticks.length)
    return <div className="dim small">no scheduled runs in the next {schedule.horizonHours}h</div>
  return (
    <div className="nextstrip">
      <div className="striprail">
        <i className="daymark" style={{ left: '50%' }} />
        {ticks.map((t, i) => (
          <i
            key={i}
            className={`stick ${t.status === 'shipped' ? 'shipped' : ''}`}
            style={{ left: `${((new Date(t.ts) - t0) / span) * 100}%` }}
            title={`${t.automation} (${t.status}) · ${new Date(t.ts).toLocaleString()}`}
          />
        ))}
      </div>
      <div className="striplabels dim small">
        <span>now</span><span>+24h</span><span>+{schedule.horizonHours}h</span>
      </div>
    </div>
  )
}

export default function Automations({ data }) {
  return (
    <Card title="Automations" data={data}>
      <table>
        <thead>
          <tr><th>automation</th><th>trigger</th><th>cadence</th><th>last run</th><th>next</th><th>status</th></tr>
        </thead>
        <tbody>
          {data?.rows?.map((r, i) => (
            <tr key={i}>
              <td>{r.automation}</td>
              <td className="dim">{r.trigger}</td>
              <td>{r.cadence && r.cadence !== '—' ? <span className="chip mono">{r.cadence}</span> : <span className="dim">event</span>}</td>
              <td><LastRun r={r} /></td>
              <td><Next r={r} /></td>
              <td>
                {/* A shipped row whose schedule is not being honoured is not "ok" —
                    the chip drops its green so status and evidence agree. */}
                <span className={`chip ${r.status === 'shipped' ? (['overdue', 'never'].includes(r.health) ? 'down' : 'ok') : ''}`}
                  title={['overdue', 'never'].includes(r.health) ? 'shipped, but the run log does not back the schedule' : undefined}>
                  {r.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <NextStrip rows={data?.rows ?? []} schedule={data?.schedule} />
      {data?.runLog === false && (
        <div className="dim small">no automations/runs.jsonl yet — last-run appears once automations log their executions</div>
      )}
    </Card>
  )
}
