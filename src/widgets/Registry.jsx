import React from 'react'
import Card from './Card.jsx'

// repo front-matter is either org/repo shorthand (assume GitHub) or a full URL.
const repoUrl = (repo) =>
  !repo ? null : /^https?:\/\//.test(repo) ? repo : `https://github.com/${repo}`

export default function Registry({ data }) {
  return (
    <Card title="Projects — estate registry" data={data}>
      <table>
        <thead>
          <tr><th>project</th><th>purpose</th><th>stack</th></tr>
        </thead>
        <tbody>
          {data?.projects?.map((p) => (
            <tr key={p.note}>
              <td className="mono">
                {p.name}
                {repoUrl(p.repo) && (
                  <a className="repolink" href={repoUrl(p.repo)} target="_blank" rel="noreferrer" title={p.repo}>↗</a>
                )}
              </td>
              <td className="dim">{p.purpose}</td>
              <td>{(p.stack ?? []).map((s) => <span key={s} className="chip">{s}</span>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
