import React from 'react'
import Card from './Card.jsx'

const days = (ms) => Math.floor((Date.now() - ms) / 864e5)

export default function Memory({ data, ontology }) {
  const stages = ontology?.flow?.pipelines?.['memory-promotion']?.stages ?? ['raw', 'wiki', 'output']
  return (
    <Card title="Memory — promotion pipeline" data={data}>
      <div className="pipeline">
        {stages.map((stage, i) => {
          const s = data?.stages?.[stage]
          return (
            <React.Fragment key={stage}>
              {i > 0 && <span className="arrow">→</span>}
              <div className="stage">
                <div className="count">{s?.count ?? '—'}</div>
                <div className="mono">{stage}/</div>
                {stage === 'raw' && s?.oldest && (
                  <div className={`small ${days(s.oldest.mtime) > 7 ? 'warn' : 'dim'}`}>
                    oldest: {days(s.oldest.mtime)}d
                  </div>
                )}
                {s && s.capacity > 0 && (
                  <div className="memslots" title={`${s.count} of ${s.capacity} (24h high-water mark)`}>
                    {Array.from({ length: s.capacity }).map((_, i) => (
                      <span key={i} className={`slot ${i < s.count ? 'filled' : ''}`} />
                    ))}
                  </div>
                )}
              </div>
            </React.Fragment>
          )
        })}
      </div>
      {data?.stages && Object.values(data.stages).every((s) => s.count === 0) && (
        <div className="dim small">skeleton only — capture into raw/, promote into wiki/</div>
      )}
      {data?.federated?.vaults?.length > 0 && (
        <div className="dim small federated">
          federated: <strong>{data.federated.total}</strong> notes across {data.federated.vaults.length} vaults
          <span className="dim"> (navigation, not canon)</span> —{' '}
          {data.federated.vaults.map((v) => `${v.name} ${v.notes}`).join(' · ')}
        </div>
      )}
    </Card>
  )
}
