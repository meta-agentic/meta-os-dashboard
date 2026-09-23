import React from 'react'
import Card from './Card.jsx'

// Read-only render of the instance's harness declarations (<instanceRoot>/harness/*.yaml,
// shape in docs/harness.example.yaml): the gates that guard each repo's PRs, hand-authored
// per repo. No write path exists here or in the reader.
export default function Harness({ data }) {
  const repos = data?.repos ?? []
  if (!repos.length) {
    return <Card title="Harness" data={data}><div className="degraded">no harness declarations</div></Card>
  }
  const t = data.totals ?? {}

  return (
    <Card title="Harness" data={data}>
      <div className="tiles">
        <div className="tile"><div className="tile-v">{t.repos ?? repos.length}</div><div className="tile-l">repos</div></div>
        <div className="tile"><div className="tile-v">{t.gates ?? 0}</div><div className="tile-l">gates</div></div>
        <div className="tile"><div className="tile-v">{t.blocking ?? 0}</div><div className="tile-l">blocking</div></div>
      </div>

      <ul className="feed">
        {repos.map((r) => (
          <li key={r.file}>
            <span className="mono">{r.repo}</span>
            {r.visibility && <span className="dim small"> · {r.visibility}</span>}
            {r.error ? (
              <div className="warn small">{r.error}</div>
            ) : (
              <ul className="feed">
                {r.gates.map((g) => (
                  <li key={g.name}>
                    <span className="mono small">{g.name}</span>
                    {' '}
                    <span className={'chip' + (g.blocking ? ' down' : '')} title={g.blocking ? 'blocking / required check' : 'non-blocking / advisory'}>
                      {g.blocking ? 'blocking' : 'advisory'}
                    </span>
                    {g.trigger && <span className="dim small"> · {g.trigger}</span>}
                    {Array.isArray(g.checks) && g.checks.length > 0 && (
                      <ul className="feed">
                        {g.checks.map((c, i) => <li key={i} className="dim small">· {c}</li>)}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
