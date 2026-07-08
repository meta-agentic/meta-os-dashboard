import React from 'react'
import Card from './Card.jsx'

// repo front-matter is either org/repo shorthand (assume GitHub) or a full URL.
const repoUrl = (repo) =>
  !repo ? null : /^https?:\/\//.test(repo) ? repo : `https://github.com/${repo}`

// output: may also be a filesystem/vault path — only linkify URLs and org/repo
// shorthand (exactly one slash, no leading dot or slash); paths render as text.
const outputUrl = (o) =>
  !o ? null : /^https?:\/\//.test(o) ? o : /^[\w.-]+\/[\w.-]+$/.test(o) ? `https://github.com/${o}` : null

export default function Registry({ data }) {
  return (
    <Card title="Projects — estate registry" data={data}>
      <table>
        <thead>
          <tr><th>project</th><th>purpose</th><th>stack</th><th>delivers to</th></tr>
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
              <td className="small">
                {p.output ? (
                  outputUrl(p.output) ? (
                    <a href={outputUrl(p.output)} target="_blank" rel="noreferrer">{p.output}</a>
                  ) : (
                    <span className="mono">{p.output}</span>
                  )
                ) : (
                  <span className="dim" title="no output: field on the project node — deliverables land in the vault">memory/output/</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
