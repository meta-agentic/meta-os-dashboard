import React, { useState } from 'react'
import Card from './Card.jsx'

// Source → dot color. Kept in JS (not CSS classes) so an unknown future source
// still renders, just uncolored.
const SRC = { vault: 'var(--accent)', automations: 'var(--wip)', backlog: 'var(--ok)' }

function ago(ts) {
  const mins = Math.floor((Date.now() - new Date(ts)) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 48) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}

export default function Activity({ data }) {
  const [filter, setFilter] = useState(null)
  const events = (data?.events ?? []).filter((e) => !filter || e.source === filter)
  const present = [...new Set((data?.events ?? []).map((e) => e.source))]
  const dead = (data?.sources ?? []).filter((s) => s.available === false)
  return (
    <Card title="Activity" data={data}>
      {present.length > 1 && (
        <div className="chips">
          <button className={`chip ${!filter ? 'on' : ''}`} onClick={() => setFilter(null)}>all</button>
          {present.map((s) => (
            <button key={s} className={`chip ${filter === s ? 'on' : ''}`} onClick={() => setFilter(filter === s ? null : s)}>
              <span className="dot" style={{ background: SRC[s] }} />{s}
            </button>
          ))}
        </div>
      )}
      <ul className="feed">
        {events.map((e, i) => (
          <li key={i}>
            <span className="dot" style={{ background: SRC[e.source] }} title={e.source} />
            {e.source === 'vault' ? (
              <>
                <span className="mono dim">{e.note}</span> {e.target}
              </>
            ) : (
              <>
                <strong>{e.actor}</strong> <span className={e.action === 'run fail' ? 'warn' : 'dim'}>{e.action}</span>{' '}
                {e.target}
                {e.note && <span className="dim small"> · {e.note}</span>}
              </>
            )}
            <span className="dim small"> · {ago(e.ts)}</span>
          </li>
        ))}
      </ul>
      {dead.map((s) => (
        <div key={s.name} className="dim small">{s.name}: {s.reason}</div>
      ))}
    </Card>
  )
}
