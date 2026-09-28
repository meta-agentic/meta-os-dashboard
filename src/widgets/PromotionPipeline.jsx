import React from 'react'
import Card from './Card.jsx'
import { days, pipelineTotal, promotionStages } from './memoryShared.js'

// The raw → wiki → output promotion pipeline, stage by stage, with the age of the
// oldest unpromoted raw note. Often thin: canon lives in the federated vaults.
export default function PromotionPipeline({ data, ontology }) {
  const stages = promotionStages(ontology)
  const unused = data?.stages && pipelineTotal(data) === 0
  return (
    <Card title="Promotion Pipeline" data={data}>
      {unused && <div className="dim small pipeline-label">unused in this instance</div>}
      <div className="pipeline">
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
    </Card>
  )
}
