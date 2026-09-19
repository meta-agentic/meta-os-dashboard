import React from 'react'
import Card from './Card.jsx'

// Aggregates over the SAME feed the Lanes widget renders (/api/lanes) — no new
// endpoint, so the two can never disagree about what the active sprint contains.
// Lanes answers "where is each item"; this answers "how much, in total".

const sum = (xs, f) => xs.reduce((a, x) => a + (f(x) ?? 0), 0)

// The blocked COUNT was a dead number: /api/lanes carries blockedBy per item, so
// the keys and their blockers are known and can be named instead of tallied.
function blockedItems(space) {
  const out = []
  for (const lane of space.lanes ?? []) {
    for (const q of Object.values(lane.queues ?? {})) {
      for (const it of q ?? []) {
        if (it.blockedBy?.length) out.push({ id: it.id, lane: lane.lane, by: it.blockedBy, title: it.title })
      }
    }
  }
  return out
}

function totals(space) {
  const l = space.lanes ?? []
  return {
    todo: sum(l, (x) => x.depth),
    wip: sum(l, (x) => x.wip),
    done: sum(l, (x) => x.done),
    blocked: sum(l, (x) => x.blocked),
    ptTodo: sum(l, (x) => x.points?.todo),
    ptWip: sum(l, (x) => x.points?.wip),
    ptDone: sum(l, (x) => x.points?.done),
    lanes: l.length,
  }
}

const add = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + b[k]]))

// Completion prefers points and falls back to item count. Which basis was used is
// always stated: an unestimated sprint reporting "0%" by points would read as "no
// progress" when it actually means "nothing was estimated".
function completion(t) {
  const pts = t.ptTodo + t.ptWip + t.ptDone
  if (pts > 0) return { pct: Math.round((t.ptDone / pts) * 100), basis: 'points', done: t.ptDone, total: pts }
  const items = t.todo + t.wip + t.done
  if (items > 0) return { pct: Math.round((t.done / items) * 100), basis: 'items', done: t.done, total: items }
  return null
}

// Elapsed share of the sprint window, so "60% done with 90% of the time gone" is
// visible at a glance rather than something you compute in your head.
function elapsed(sprint) {
  if (!sprint) return null
  const t0 = new Date(sprint.start), t1 = new Date(sprint.end)
  if (isNaN(t0) || isNaN(t1) || t1 <= t0) return null
  return Math.round(Math.min(Math.max((Date.now() - t0) / (t1 - t0), 0), 1) * 100)
}

function Tile({ label, value, sub, cls }) {
  return (
    <div className={`tile${cls ? ' ' + cls : ''}`}>
      <div className="tile-v">{value}</div>
      <div className="tile-l">{label}</div>
      {sub ? <div className="tile-s dim">{sub}</div> : null}
    </div>
  )
}

export default function SprintSummary({ data }) {
  const spaces = data?.spaces ?? []
  const broken = spaces.filter((s) => s.available === false)
  // A space with lanes but no live sprint is showing its last CLOSED sprint
  // (server fallback) — still worth a row, just labeled so it isn't mistaken for
  // live work. `idle` is the genuine "nothing to show" case: no sprint ever closed.
  const withSprint = spaces.filter((s) => s.available !== false && (s.lanes?.length ?? 0) > 0)
  const idle = spaces.filter((s) => s.available !== false && (s.lanes?.length ?? 0) === 0)
  const anyLive = withSprint.some((s) => s.sprintActive)

  const rows = withSprint.map((s) => ({
    space: s.space, sprint: s.sprint?.[0] ?? null, live: s.sprintActive,
    t: totals(s), blocked: blockedItems(s),
  }))
  const grand = rows.length
    ? rows.map((r) => r.t).reduce(add)
    : null
  const gc = grand && completion(grand)
  const allBlocked = rows.flatMap((r) => r.blocked)

  return (
    <Card title={anyLive ? 'Sprint Summary — active flow totals' : 'Sprint Summary — no active sprint (last closed shown)'} data={data}>
      {!rows.length ? (
        <div className="dim small">no sprint data in any space</div>
      ) : (
        <>
          <div className="tiles">
            <Tile label="to do" value={grand.todo} sub={grand.ptTodo > 0 ? `${grand.ptTodo}pt` : null} />
            <Tile label="in progress" value={grand.wip} cls="wip"
                  sub={grand.ptWip > 0 ? `${grand.ptWip}pt` : null} />
            <Tile label="done" value={grand.done} cls="ok"
                  sub={grand.ptDone > 0 ? `${grand.ptDone}pt` : null} />
            <Tile label="blocked" value={grand.blocked} cls={grand.blocked > 0 ? 'down' : undefined}
                  sub={allBlocked.length ? allBlocked.map((b) => b.id).join(' · ') : null} />
            {gc && (
              <Tile label={`complete (${gc.basis})`} value={`${gc.pct}%`}
                    sub={`${gc.done} of ${gc.total}`} />
            )}
            <Tile label="sprints" value={rows.length}
                  sub={`${grand.lanes} lane${grand.lanes === 1 ? '' : 's'}`} />
          </div>

          <table>
            <thead>
              <tr>
                <th>space</th><th>sprint</th><th className="num">elapsed</th>
                <th className="num">todo</th><th className="num">wip</th><th className="num">done</th>
                <th className="num">blocked</th><th className="num">complete</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ space, sprint, live, t, blocked }) => {
                const c = completion(t)
                const el = elapsed(sprint)
                // Behind = more of the window spent than of the work finished.
                const behind = c && el != null && el - c.pct >= 20
                return (
                  <tr key={space} className={live ? undefined : 'dim'}>
                    <td className="mono">{space.toUpperCase()}</td>
                    <td className="dim small">
                      {sprint ? sprint.name : '—'}
                      {sprint && !live && <span className="dim small"> (closed)</span>}
                    </td>
                    <td className="num">{el == null ? '—' : `${el}%`}</td>
                    <td className="num">{t.todo}{t.ptTodo > 0 && <div className="dim small">{t.ptTodo}pt</div>}</td>
                    <td className="num">{t.wip}{t.ptWip > 0 && <div className="dim small">{t.ptWip}pt</div>}</td>
                    <td className="num">{t.done}{t.ptDone > 0 && <div className="dim small">{t.ptDone}pt</div>}</td>
                    <td className="num">
                      {t.blocked > 0 ? <span className="warn">{t.blocked}</span> : 0}
                      {blocked.map((x) => (
                        <div key={x.id} className="dim small mono"
                             title={`${x.title ?? x.id}\nblocked by ${x.by.join(', ')}`}>
                          {x.id} ← {x.by.join(', ')}
                        </div>
                      ))}
                    </td>
                    <td className="num">
                      {c ? (
                        <span
                          className={behind ? 'warn' : undefined}
                          title={behind ? `${el}% of the window spent, ${c.pct}% of the work done` : undefined}
                        >
                          {c.pct}%
                        </span>
                      ) : '—'}
                      {c && <div className="dim small">{c.basis}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {idle.length > 0 && (
        <div className="dim small">
          no sprint data: {idle.map((s) => s.space.toUpperCase()).join(' · ')}
        </div>
      )}
      {broken.map((s) => (
        <div key={s.space} className="degraded">{s.space}: {s.reason}</div>
      ))}
    </Card>
  )
}
