import React from 'react'
import Card from './Card.jsx'

// repo front-matter is either org/repo shorthand (assume GitHub) or a full URL.
const repoUrl = (repo) =>
  !repo ? null : /^https?:\/\//.test(repo) ? repo : `https://github.com/${repo}`

// output: may also be a filesystem/vault path — only linkify URLs and org/repo
// shorthand (exactly one slash, no leading dot or slash); paths render as text.
const outputUrl = (o) =>
  !o ? null : /^https?:\/\//.test(o) ? o : /^[\w.-]+\/[\w.-]+$/.test(o) ? `https://github.com/${o}` : null

// What the local clone says about a node (server/readers.mjs registry()). The notes are
// hand-written; these chips are how a rename or a moved clone becomes visible.
function CloneChip({ clone }) {
  if (!clone || clone.state === 'ok') return null
  const [label, tone, title] = {
    archived: ['archived', '', 'status: archived on the project node'],
    missing: ['no clone', 'down', 'nothing at the node\'s path — moved, renamed, or not cloned here'],
    'no-remote': ['no remote', 'down', 'the clone has no origin, so the repo link cannot be confirmed'],
    mismatch: [`now ${clone.origin}`, 'down', `the clone's origin is ${clone.origin}, not the repo on the node`],
  }[clone.state] ?? [clone.state, 'down', '']
  return <span className={'chip reg-chip ' + tone} title={title}>{label}</span>
}

export default function Registry({ data }) {
  // Archived nodes sink to the bottom; the rest keep the notes' order.
  const projects = [...(data?.projects ?? [])].sort(
    (a, b) => (a.clone?.state === 'archived') - (b.clone?.state === 'archived'))
  const drift = projects.filter((p) => p.clone && !['ok', 'archived'].includes(p.clone.state)).length
  const unregistered = data?.unregistered ?? []
  return (
    <Card title="Projects — estate registry" data={data}>
      {(drift > 0 || unregistered.length > 0) && (
        <div className="dim small reg-summary">
          {drift > 0 && <span className="warn">{drift} node{drift === 1 ? '' : 's'} out of step with the clone</span>}
          {drift > 0 && unregistered.length > 0 && ' · '}
          {unregistered.length > 0 && <span>{unregistered.length} clone{unregistered.length === 1 ? '' : 's'} without a node (below)</span>}
        </div>
      )}
      <table>
        <thead>
          <tr><th>project</th><th>purpose</th><th>stack</th><th>delivers to</th></tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.note} className={p.clone?.state === 'archived' ? 'reg-archived' : undefined}>
              <td className="mono">
                {p.name}
                {repoUrl(p.repo) && (
                  <a className="repolink" href={repoUrl(p.repo)} target="_blank" rel="noreferrer" title={p.repo}>↗</a>
                )}
                <CloneChip clone={p.clone} />
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
      {unregistered.length > 0 && (
        <details className="reg-unregistered">
          <summary className="dim small">{unregistered.length} clone{unregistered.length === 1 ? '' : 's'} beside the registered ones with no project node</summary>
          <ul>
            {unregistered.map((u) => (
              <li key={u.dir}>
                <span className="mono">{u.dir}</span>
                {u.repo ? <span className="dim small"> {u.repo}</span> : <span className="dim small"> no remote</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}
