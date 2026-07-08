import React from 'react'
import Card from './Card.jsx'

function ago(ts) {
  const mins = Math.floor((Date.now() - new Date(ts)) / 60000)
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 48) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}

const FRESH_DAYS = 7

// The curated output inbox: deliverables in memory/output/ plus recent wiki
// promotions. The vault is the database — this is a view, not a store.
export default function Outputs({ data }) {
  const items = data?.items ?? []
  return (
    <Card title="Outputs — deliverables inbox" data={data}>
      {items.length === 0 ? (
        <div className="dim small">
          nothing delivered yet — finished work lands in <span className="mono">memory/output/</span>,
          promoted knowledge in <span className="mono">memory/wiki/</span>
        </div>
      ) : (
        <ul className="feed">
          {items.map((i) => {
            const fresh = Date.now() - new Date(i.ts) < FRESH_DAYS * 864e5
            return (
              <li key={`${i.stage}/${i.file}`}>
                {fresh && <span className="dot" style={{ background: 'var(--accent)' }} title={`new in the last ${FRESH_DAYS}d`} />}
                <span className="mono">{i.file}</span>
                <span className={`chip ${i.promotion ? '' : 'ok'}`}>{i.promotion ? 'wiki promotion' : 'output'}</span>
                {i.type && <span className="chip">{i.type}</span>}
                {i.project && <span className="chip">{i.project}</span>}
                <span className="dim small">
                  {' '}· {ago(i.ts)}{i.committed === false ? ' · uncommitted' : ''}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <div className="dim small">
        {data?.counts && `${data.counts.output} in output/ · ${data.counts.promotions} promotions in ${data.promotionWindowDays}d`}
        {data?.datesBasis && ` · dates: ${data.datesBasis}`}
      </div>
    </Card>
  )
}
