import React from 'react'
import Card from './Card.jsx'

const days = (ms) => Math.floor((Date.now() - ms) / 864e5)
const ago = (ms) => {
  if (!ms) return null
  const d = days(ms)
  return d <= 0 ? 'today' : `${d}d ago`
}

export default function Memory({ data, ontology }) {
  const stages = ontology?.flow?.pipelines?.['memory-promotion']?.stages ?? ['raw', 'wiki', 'output']
  const vaults = data?.federated?.vaults ?? []
  const maxNotes = Math.max(1, ...vaults.map((v) => v.notes))
  const pipelineEmpty = data?.stages && Object.values(data.stages).every((s) => s.count === 0)

  return (
    <Card title="Memory" data={data}>
      {/* Where the knowledge actually lives — federated vaults, first-class. */}
      {vaults.length > 0 && (
        <div className="vaults">
          <div className="vaults-head">
            <span>Federated vaults</span>
            <span className="dim small">
              {data.federated.total} notes{data.federated.newest ? ` · newest ${ago(data.federated.newest)}` : ''}
            </span>
          </div>
          {vaults.map((v) => (
            <div className="vault-row" key={v.name} title={`${v.name}: ${v.notes} notes`}>
              <span className="vault-name mono">{v.name}</span>
              <span className="vault-bar"><i style={{ width: `${(v.notes / maxNotes) * 100}%` }} /></span>
              <span className="vault-n num">{v.notes}</span>
              <span className="vault-age dim small">{v.newest ? ago(v.newest) : '—'}</span>
            </div>
          ))}
        </div>
      )}

      {/* The promotion pipeline (raw → wiki → output) — a real meta-os concept, shown
          as context. Often thin because canon lives in the federated vaults above. */}
      <div className="pipeline-wrap">
        <div className="dim small pipeline-label">Promotion pipeline{pipelineEmpty ? ' — unused in this instance' : ''}</div>
        <div className="pipeline compact">
          {stages.map((stage, i) => {
            const s = data?.stages?.[stage]
            return (
              <React.Fragment key={stage}>
                {i > 0 && <span className="arrow">→</span>}
                <div className="stage">
                  <div className="count">{s?.count ?? '—'}</div>
                  <div className="mono small">{stage}/</div>
                  {stage === 'raw' && s?.oldest && (
                    <div className={`small ${days(s.oldest.mtime) > 7 ? 'warn' : 'dim'}`}>oldest {days(s.oldest.mtime)}d</div>
                  )}
                </div>
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </Card>
  )
}
