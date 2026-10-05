import React, { useState } from 'react'
import Card from './Card.jsx'

// Every sprint of every project, from the beginning, on one table per project:
// what was committed at open, what was delivered, how fast, and what carried over.
// The definitions live in server/sprint-stats.mjs; the header tooltips repeat them so
// a number can be read without opening the source.
//
// Carry-over is NOT summed in the totals row: an item that stays unfinished through
// three sprints is carried out of each of them, so a sum would count it three times.
// Committed and delivered are additive (an item is delivered once, by the sprint that
// finishes it), carry-over is not.

const COLS = [
  { k: 'cItems', label: 'Committed', sub: 'items', tip: 'Items on the sprint\'s commitment snapshot taken at open. — means no snapshot was recorded.' },
  { k: 'cPts', label: 'Committed', sub: 'SP', tip: 'Story points of the committed items, at their current estimate.' },
  { k: 'dItems', label: 'Delivered', sub: 'items', tip: 'DONE items, credited once to the last sprint they name. Work finished after the end date counts here.' },
  { k: 'dPts', label: 'Delivered', sub: 'SP', tip: 'Story points of the delivered items.' },
  { k: 'v', label: 'Velocity', sub: 'SP / week', tip: 'Delivered points per week of the sprint\'s length, so a longer sprint does not read as faster.' },
  { k: 'xItems', label: 'Carry-over', sub: 'items', tip: 'Items that were in the sprint but not delivered by it: unfinished, or finished in a later sprint. NO GO is not carried.' },
  { k: 'xPts', label: 'Carry-over', sub: 'SP', tip: 'Story points of the carried-over items.' },
]

const weeksOf = (r) => {
  const a = Date.parse(r.start), b = Date.parse(r.end)
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? (b - a) / 6048e5 : null
}

function totals(rows) {
  const closed = rows.filter((r) => r.status === 'CLOSED')
  const withCommit = closed.filter((r) => r.committedItems != null)
  const weeks = closed.reduce((a, r) => a + (weeksOf(r) ?? 0), 0)
  const dPts = closed.reduce((a, r) => a + r.deliveredPts, 0)
  return {
    sprints: closed.length,
    noCommit: closed.length - withCommit.length,
    cItems: withCommit.reduce((a, r) => a + r.committedItems, 0),
    cPts: withCommit.reduce((a, r) => a + (r.committedPts ?? 0), 0),
    dItems: closed.reduce((a, r) => a + r.deliveredItems, 0),
    dPts,
    v: weeks ? +(dPts / weeks).toFixed(1) : null,
  }
}

const N = ({ v }) => (v == null ? <span className="dim">—</span> : v === 0 ? <span className="dim">0</span> : v)

export default function SprintStats({ data }) {
  const [closedOnly, setClosedOnly] = useState(false)
  const spaces = (data?.spaces ?? []).filter((s) => s.sprintStats?.length)

  if (!spaces.length) {
    return <Card title="Sprint Stats" data={data}><div className="degraded">no sprint data to report</div></Card>
  }

  const total = spaces.reduce((a, s) => a + s.sprintStats.filter((r) => !closedOnly || r.status === 'CLOSED').length, 0)

  return (
    <Card title="Sprint Stats — committed · delivered · velocity · carry-over" data={data}>
      <div className="burn-head">
        <span className="dim small">
          {spaces.length} project{spaces.length === 1 ? '' : 's'} · {total} sprint{total === 1 ? '' : 's'} since the beginning
        </span>
        <span className="seg">
          <button className={'seg-b' + (!closedOnly ? ' on' : '')} onClick={() => setClosedOnly(false)}>all</button>
          <button className={'seg-b' + (closedOnly ? ' on' : '')} onClick={() => setClosedOnly(true)}>closed</button>
        </span>
      </div>

      {spaces.map((s) => {
        const rows = s.sprintStats.filter((r) => !closedOnly || r.status === 'CLOSED')
        if (!rows.length) return null
        const t = totals(s.sprintStats)
        const top = Math.max(1, ...rows.map((r) => r.perWeek ?? 0))
        return (
          <section key={s.space} className="ss-project">
            <div className="ss-head">
              <span className="mono ss-name">{s.space.toUpperCase()}</span>
              <span className="dim small">
                {t.sprints} closed · {t.dPts} SP / {t.dItems} items delivered{t.v != null ? ` · ${t.v} SP / week overall` : ''}
              </span>
            </div>
            <table className="ss-table">
              <thead>
                <tr>
                  <th>Sprint</th>
                  <th>Window</th>
                  {COLS.map((c) => (
                    <th key={c.k} className="num" title={c.tip}>{c.label}<br /><span className="ss-sub">{c.sub}</span></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const live = r.status !== 'CLOSED'
                  return (
                    <tr key={r.id} className={live ? 'ss-live' : ''}>
                      <td className="mono">{r.id}{live && <span className="chip eta">live</span>}</td>
                      <td className="dim small">{r.start ?? '—'} → {r.end ?? '—'}</td>
                      <td className="num" title={r.committedItems == null ? 'no commitment snapshot was recorded' : undefined}><N v={r.committedItems} /></td>
                      <td className="num"><N v={r.committedPts} /></td>
                      <td className="num"><N v={r.deliveredItems} /></td>
                      <td className="num">
                        <N v={r.deliveredPts} />
                        {r.drift && (
                          <span className="warn small" title={`the close record says ${r.storedSP} SP · ${r.storedItems} items; live work now gives ${r.deliveredPts} SP · ${r.deliveredItems} items`}> ≠</span>
                        )}
                      </td>
                      <td className="num">
                        <span className="ss-v">
                          <N v={r.perWeek} />
                          {r.perWeek ? <span className="ss-bar"><i style={{ width: `${Math.max(2, (r.perWeek / top) * 100)}%` }} /></span> : null}
                        </span>
                      </td>
                      <td className={'num' + (r.carryItems ? ' ss-carry' : '')}><N v={r.carryItems} /></td>
                      <td className={'num' + (r.carryPts ? ' ss-carry' : '')}><N v={r.carryPts} /></td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="ss-total">
                  <td colSpan={2} className="dim small">closed sprints{t.noCommit ? ` · ${t.noCommit} with no commitment recorded` : ''}</td>
                  <td className="num">{t.cItems}</td>
                  <td className="num">{t.cPts}</td>
                  <td className="num">{t.dItems}</td>
                  <td className="num">{t.dPts}</td>
                  <td className="num"><N v={t.v} /></td>
                  <td className="num dim" colSpan={2} title="Not summed: an item carried through several sprints is carried out of each of them">not additive</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )
      })}
    </Card>
  )
}
