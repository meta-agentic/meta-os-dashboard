import React, { useEffect, useMemo, useRef, useState } from 'react'
import { apiGet, isStatic } from '../api.js'

// Flow — vault × git × GitHub. Three panels: what waits for the PO, what has drifted,
// and every worktree as a running lane. Fetched on its own (not a polled feed): the
// server caches the repo scan and the GitHub reads, so polling here is cheap.
const POLL_MS = 60_000
const MAX_ROWS = 200

const KIND = {
  'only-on-disk': 'only on disk',
  'merged-not-done': 'merged, not DONE',
  'in-review-no-pr': 'in review, no PR',
  'unmerged-no-pr': 'unmerged, no PR',
  'stale-uncommitted': 'stale uncommitted',
  'worktree-merged': 'worktree on merged branch',
  'no-remote': 'no remote',
}
const CHECKS = { passing: 'ok', failing: 'down', pending: 'wip', none: '' }
const FLOW = { 'TO DO': 'todo', PLANNED: 'todo', REFINED: 'todo', 'IN PROGRESS': 'wip', 'IN REVIEW': 'wip', DONE: 'done' }

const short = (p) => String(p ?? '').replace(/^\/Users\/[^/]+/, '~')
const tip = (o) => Object.entries(o ?? {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n')

function Item({ item, k, onOpen }) {
  if (!item) return k ? <span className="mono dim" title="no vault item with this id">{k}</span> : null
  return (
    <button className="flow-item mono" onClick={() => onOpen?.(item)} title={`${item.title}\n${item.status} — open in Work Items`}>
      {item.id} <span className={`wi-pill small ${FLOW[item.status] ?? 'none'}`}>{String(item.status).toLowerCase()}</span>
    </button>
  )
}

function Panel({ title, count, extra, children }) {
  return (
    <section className="flow-panel">
      <div className="spacehead">
        <strong>{title}</strong>
        <span className="flow-count">{count}</span>
        {extra}
      </div>
      {children}
    </section>
  )
}

function Waiting({ rows, onOpen }) {
  if (!rows.length) return <div className="dim small">nothing waiting — no open pull requests by you</div>
  return (
    <table>
      <thead><tr><th>pull request</th><th>item</th><th className="num">age</th><th>review</th><th>checks</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.repo}#${r.number}`}>
            <td>
              <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
              <div className="dim small mono">{r.repo}#{r.number}{r.draft ? ' · draft' : ''}</div>
            </td>
            <td><Item item={r.item} k={r.key} onOpen={onOpen} /></td>
            <td className="num">{r.ageDays}d</td>
            <td className="small">{r.reviewDecision ? r.reviewDecision.toLowerCase().replace(/_/g, ' ') : <span className="dim">—</span>}</td>
            <td><span className={`chip ${CHECKS[r.checks] ?? ''}`}>{r.checks}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Drift({ rows, onOpen }) {
  const [kind, setKind] = useState('')
  const kinds = useMemo(() => Object.keys(KIND).map((k) => [k, rows.filter((r) => r.kind === k).length]).filter(([, n]) => n), [rows])
  const shown = kind ? rows.filter((r) => r.kind === kind) : rows
  if (!rows.length) return <div className="dim small">no drift — git, GitHub and the vault agree</div>
  return (
    <>
      <div className="chips">
        <button className={'chip' + (!kind ? ' on' : '')} onClick={() => setKind('')}>all {rows.length}</button>
        {kinds.map(([k, n]) => (
          <button key={k} className={'chip' + (kind === k ? ' on' : '')} onClick={() => setKind(kind === k ? '' : k)}>{KIND[k]} {n}</button>
        ))}
      </div>
      <table>
        <tbody>
          {shown.slice(0, MAX_ROWS).map((a, i) => (
            <tr key={i} title={tip(a.evidence)}>
              <td className="flow-sev"><span className={`flow-dot ${a.severity}`} title={a.severity} /></td>
              <td className="small nowrap">{KIND[a.kind] ?? a.kind}</td>
              <td>
                <div className="mono small">
                  {a.repo && <span className="dim">{a.repo}</span>}
                  {a.branch && <> {a.branch}</>}
                  {!a.branch && a.path && <> {short(a.path)}</>}
                </div>
                <div className="small">{a.reason}</div>
              </td>
              <td>
                <Item item={a.item} k={a.key} onOpen={onOpen} />
                {(a.url || a.evidence?.pr?.url) && (
                  <a className="small" href={a.url || a.evidence.pr.url} target="_blank" rel="noreferrer"> PR #{a.evidence?.pr?.number}</a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length > MAX_ROWS && <div className="dim small">showing {MAX_ROWS} of {shown.length}</div>}
    </>
  )
}

function Lanes({ rows, onOpen }) {
  const [withMain, setWithMain] = useState(false)
  const shown = withMain ? rows : rows.filter((r) => !r.main)
  return (
    <>
      <label className="dim small flow-toggle">
        <input type="checkbox" checked={withMain} onChange={(e) => setWithMain(e.target.checked)} /> include main checkouts ({rows.filter((r) => r.main).length})
      </label>
      {!shown.length ? <div className="dim small">no linked worktrees</div> : (
        <table>
          <thead><tr><th>worktree</th><th>item</th><th className="num">dirty</th><th className="num">↑↓</th><th>PR</th><th>state</th><th>session</th></tr></thead>
          <tbody>
            {shown.slice(0, MAX_ROWS).map((l) => (
              <tr key={l.path}>
                <td>
                  <div className="mono small">{l.branch ?? (l.detached ? 'detached HEAD' : '—')}</div>
                  <div className="dim small mono" title={l.path}>{l.repo} · {short(l.path)}</div>
                </td>
                <td><Item item={l.item} k={l.key} onOpen={onOpen} /></td>
                <td className={'num' + (l.dirty ? ' warn' : ' dim')}>{l.dirty}</td>
                <td className="num small" title={l.upstream ? `upstream ${l.upstream}` : 'no upstream'}>{l.ahead ?? '–'}/{l.behind ?? '–'}</td>
                <td className="small">{l.pr ? <a href={l.pr.url} target="_blank" rel="noreferrer">#{l.pr.number} {l.pr.state.toLowerCase()}</a> : <span className="dim">—</span>}</td>
                <td>
                  {l.prunable ? <span className="chip down">prunable</span>
                    : l.merged === true ? <span className="chip ok">merged</span>
                      : l.merged === false ? <span className="chip eta">open work</span>
                        : <span className="dim small">{l.main ? 'main' : '—'}</span>}
                </td>
                <td className="small mono">{l.session == null ? <span className="dim">—</span> : typeof l.session === 'object' ? JSON.stringify(l.session) : String(l.session)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

function Sources({ s }) {
  const part = (label, src, ok) => (
    <span className={src?.available === false ? 'warn' : ''} title={src?.reason ?? tip(src)}>
      {label}: {src?.available === false ? `unavailable — ${src.reason}` : ok}
    </span>
  )
  return (
    <div className="dim small flow-sources">
      {part('git', s.git, `${s.git.repos} repos${s.git.failed?.length ? `, ${s.git.failed.length} failed` : ''}`)}
      {' · '}{part('GitHub', s.github, `${s.github.user} · ${s.github.repos} repos${s.github.failed?.length ? `, ${s.github.failed.length} failed` : ''}`)}
      {' · '}{part('vault', s.vault, `${s.vault.items} items`)}
      {' · '}{s.ledger?.configured === false ? <span title={s.ledger.reason}>ledger: not configured</span> : part('ledger', s.ledger, 'read')}
    </div>
  )
}

export default function Flow({ onOpenItem }) {
  const [state, setState] = useState({ status: 'loading' })
  const seq = useRef(0)
  const load = () => {
    if (isStatic) return setState({ status: 'error', reason: 'Flow needs the live API — not available on a static snapshot' })
    const n = ++seq.current
    apiGet('/api/flow')
      .then((d) => { if (n === seq.current) setState(d.available === false ? { status: 'error', reason: d.reason } : { status: 'ok', d }) })
      .catch((e) => { if (n === seq.current) setState((s) => (s.status === 'ok' ? s : { status: 'error', reason: String(e) })) })
  }
  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [])

  if (state.status === 'loading') return <div className="degraded">scanning repositories and pull requests… (the first scan can take half a minute)</div>
  if (state.status === 'error') return <div className="degraded">unavailable — {state.reason}</div>
  const { d } = state
  const sev = d.counts.driftBySeverity
  const open = (item) => onOpenItem?.({ label: item.id, spaces: [item.space], open: { id: item.id, space: item.space } })
  return (
    <div className="flow">
      <div className="fp-bar">
        <Sources s={d.sources} />
        <span className="spacer" />
        <span className="dim small" title={`generated ${d.generatedAt}`}>{new Date(d.generatedAt).toLocaleTimeString()}</span>
        <button className="fp-btn" onClick={load} title="Reload (server caches: repos 60 s, GitHub 5 min)">↻</button>
      </div>
      <Panel title="Waiting for you" count={d.counts.waiting}>
        <Waiting rows={d.waiting} onOpen={open} />
      </Panel>
      <Panel
        title="Drift"
        count={d.counts.drift}
        extra={<span className="small">
          {sev.high > 0 && <span className="warn">{sev.high} high</span>}
          {sev.medium > 0 && <span className="flow-med"> · {sev.medium} medium</span>}
          {sev.low > 0 && <span className="dim"> · {sev.low} low</span>}
          <span className="dim"> · merged window {d.settings.mergedWindowDays}d · stale after {d.settings.staleDays}d</span>
        </span>}
      >
        <Drift rows={d.drift} onOpen={open} />
      </Panel>
      <Panel title="Lanes" count={d.lanes.filter((l) => !l.main).length} extra={<span className="dim small">linked worktrees · {d.lanes.length} checkouts in all</span>}>
        <Lanes rows={d.lanes} onOpen={open} />
      </Panel>
    </div>
  )
}
