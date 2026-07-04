import React from 'react'
import Card from './Card.jsx'

export default function Lint({ data }) {
  return (
    <Card title="Ontology lint" data={data}>
      {data?.violations?.length === 0 ? (
        <div className="lintok">
          <span className="dot ok" /> all {data.checked} notes conform to the ontology
        </div>
      ) : (
        <>
          <div className="dim small">
            {data?.violations?.length} of {data?.checked} notes violate the ontology
          </div>
          <ul className="feed">
            {data?.violations?.map((v) => (
              <li key={v.file}>
                <span className="mono">{v.file}</span>
                {v.problems.map((p, i) => (
                  <div key={i} className="warn small">· {p}</div>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}
