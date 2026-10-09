import React, { useEffect, useMemo, useRef, useState } from 'react'
import { apiGet } from '../api.js'
import FilePreview from './FilePreview.jsx'

// ADR register — read-only. Lists every ADR the vault holds, grouped by space, and
// opens one onto its front-matter and decisions. There is no edit control anywhere
// here: status changes stay in the vault.

const TONE = { Proposed: 'wip', Accepted: 'done', Superseded: 'old', Rejected: 'old', Deprecated: 'old', nonstandard: 'bad' }
const DTONE = { decision: 'done', open: 'wip', evidence: 'none', superseded: 'old', reopened: 'wip' }

// Nonstandard is never dressed up as a real status: the raw value (or its absence)
// is the label, so the data problem is visible where the status would be.
function StatusPill({ status, small }) {
  const label = status.standard ? status.value : `nonstandard · ${status.raw ? `“${status.raw}”` : 'empty'}`
  return (
    <span className={`wi-pill ${TONE[status.value] ?? 'none'}${small ? ' small' : ''}`} title={`front-matter status: ${status.raw || '(empty)'}`}>
      {label}
    </span>
  )
}

function DecisionPill({ status }) {
  const inherited = status.source === 'inherited'
  const tone = inherited ? TONE[status.value] : DTONE[status.value]
  const label = inherited && status.value === 'nonstandard' ? `nonstandard · ${status.raw ? `“${status.raw}”` : 'empty'}` : status.value
  const why = inherited ? "inherited from the ADR's status" : status.source === 'marker' ? 'its own marker' : `its own tag [${status.raw}]`
  return (
    <span className="adr-dstatus">
      <span className={`wi-pill small ${tone ?? 'none'}`} title={why}>{label}</span>
      {inherited && <span className="dim small">inherited</span>}
      {status.note && <span className="dim small">{status.note}</span>}
    </span>
  )
}

function Group({ group, filter, onFilter, onOpen }) {
  const rows = group.adrs.filter((a) => !filter || a.status.value === filter)
  if (!rows.length) return null
  return (
    <section className="adr-group">
      <div className="adr-ghead">
        <span className="ss-name">{group.space.toUpperCase()}</span>
        <span className="dim small">{group.total} ADR{group.total === 1 ? '' : 's'}</span>
        <span className="chips adr-counts">
          {Object.entries(group.counts).filter(([, n]) => n > 0).map(([s, n]) => (
            <button key={s} className={'chip' + (filter === s ? ' on' : '')} onClick={() => onFilter(filter === s ? '' : s)} title={`Show only ${s}`}>
              {s} {n}
            </button>
          ))}
        </span>
      </div>
      <table className="wi-table adr-table">
        <colgroup><col style={{ width: '8rem' }} /><col /><col style={{ width: '6.5rem' }} /><col style={{ width: '11rem' }} /></colgroup>
        <tbody>
          {rows.map((a) => (
            <tr
              key={a.path}
              className="wi-row"
              tabIndex={0}
              onClick={() => onOpen(group.space, a.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(group.space, a.id) } }}
            >
              <td className="wi-id mono">{a.id}</td>
              <td className="wi-title" title={a.title ?? ''}>
                {a.problems.length > 0 && <span className="warn" title={a.problems.join('\n')}>⚠ </span>}
                {a.title ?? <em className="dim">untitled</em>}
              </td>
              <td className="mono dim">
                {a.date ?? (a.declared?.date ? <span title="from the body — no date in front-matter">{a.declared.date}*</span> : '—')}
              </td>
              <td><StatusPill status={a.status} small /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

// supersedes / gates / … — an id the register knows opens it; anything else is text.
function Refs({ ids, known, onOpen }) {
  if (!ids?.length) return <span className="dim">—</span>
  return ids.map((id) => {
    const hit = known.get(id)
    return hit
      ? <button key={id} className="chip wi-link" onClick={() => onOpen(hit, id)} title={`Open ${id}`}>{id}</button>
      : <span key={id} className="chip mono">{id}</span>
  })
}

function Detail({ view, known, roots, onOpen }) {
  const [line, setLine] = useState(null) // null → preview closed; 1 → top of the file
  const ref = useRef(null)
  useEffect(() => setLine(null), [view.id])
  useEffect(() => { if (line) ref.current?.scrollIntoView({ block: 'nearest' }) }, [line])
  if (view.error) return <div className="degraded">{view.error}</div>
  if (!view.adr) return <div className="degraded">loading {view.id}…</div>
  const a = view.adr
  const show = (n) => (view.preview ? setLine(n) : null)
  const section = (n, label) =>
    view.preview
      ? <button className="fp-btn" onClick={() => show(n)} title={`Open the ADR at line ${n}`}>{label}</button>
      : null
  const odd = !a.status.standard && a.declared?.status
  return (
    <div className="wi-detail">
      <div className="wi-dtags">
        <span className="wi-id mono">{a.id}</span>
        <StatusPill status={a.status} />
        {a.project && <span className="chip mono">{a.project}</span>}
        {view.preview && <button className="fp-btn" onClick={() => show(1)}>open full ADR</button>}
      </div>
      <h3 className="wi-dtitle">{a.title ?? <em className="dim">untitled</em>}</h3>
      <dl className="adr-fm">
        <dt>status</dt><dd>{a.status.raw ? <span className="mono">{a.status.raw}</span> : <span className="warn">empty</span>}{odd && <span className="dim small"> · the body declares “{a.declared.status}”</span>}</dd>
        <dt>date</dt><dd className="mono">{a.date ?? <span className="warn">none{a.declared?.date && <span className="dim"> · the body says {a.declared.date}</span>}</span>}</dd>
        <dt>supersedes</dt><dd><Refs ids={a.supersedes} known={known} onOpen={onOpen} /></dd>
        <dt>superseded by</dt><dd><Refs ids={a.supersededBy} known={known} onOpen={onOpen} /></dd>
        <dt>gates</dt><dd><Refs ids={a.gates} known={known} onOpen={onOpen} /></dd>
        <dt>deliverable of</dt><dd><Refs ids={a.deliverableOf} known={known} onOpen={onOpen} /></dd>
        <dt>file</dt><dd className="mono dim">{view.space}/{a.path}</dd>
      </dl>
      {a.problems.length > 0 && (
        <ul className="adr-problems warn small">{a.problems.map((p) => <li key={p}>{p}</li>)}</ul>
      )}
      <section className="wi-links">
        <h4>Decisions <span className="dim">{a.decisions.length}{a.decisionForm && ` · ${a.decisionForm === 'heading' ? 'D-headings' : 'numbered under Decision'}`}</span></h4>
        {a.decisions.length ? (
          <ul className="adr-decisions">
            {a.decisions.map((d, i) => (
              <li key={i}>
                <span className="mono adr-ref">{d.ref}</span>
                <span className="adr-dtitle" title={d.title}>{d.title}</span>
                <DecisionPill status={d.status} />
                {section(d.line, '§')}
              </li>
            ))}
          </ul>
        ) : (
          <div className="dim small">
            no decisions in a recognised form (### D&lt;n&gt; headings, or numbered under ## Decision)
            {a.decisionSection && <> — the decision is prose {section(a.decisionSection, '§ Decision')}</>}
          </div>
        )}
      </section>
      {!view.preview && <div className="dim small">{view.previewReason}</div>}
      {view.preview && line && (
        <div className="adr-preview" ref={ref}>
          <FilePreview key={view.preview.path} roots={roots} target={{ ...view.preview, line }} />
        </div>
      )}
    </div>
  )
}

export default function AdrRegister({ selected, roots }) {
  const [reg, setReg] = useState({ status: 'loading' })
  const [filter, setFilter] = useState('')
  const [view, setView] = useState(null) // null → the register; { space, id, adr?, error? }
  const seq = useRef(0)

  const load = () => {
    const n = ++seq.current
    setReg({ status: 'loading' })
    apiGet('/api/adrs')
      .then((d) => { if (n === seq.current) setReg(d.available === false ? { status: 'error', reason: d.reason } : { status: 'ok', ...d }) })
      .catch((e) => { if (n === seq.current) setReg({ status: 'error', reason: String(e) }) })
  }
  useEffect(load, [])

  const open = (space, id) => {
    setView({ space, id })
    apiGet(`/api/adr?space=${encodeURIComponent(space)}&id=${encodeURIComponent(id)}`)
      .then((d) => setView((v) => (v?.id === id ? (d.available === false ? { space, id, error: d.reason } : { space, id, ...d }) : v)))
      .catch((e) => setView((v) => (v?.id === id ? { space, id, error: String(e) } : v)))
  }

  // The global project filter narrows the groups, as it does Work Items.
  const groups = useMemo(() => {
    if (reg.status !== 'ok') return []
    return selected?.size ? reg.spaces.filter((g) => selected.has(g.space)) : reg.spaces
  }, [reg, selected])
  const known = useMemo(() => new Map(groups.flatMap((g) => g.adrs.map((a) => [a.id, g.space]))), [groups])
  const total = groups.reduce((n, g) => n + g.total, 0)
  const shown = groups.reduce((n, g) => n + g.adrs.filter((a) => !filter || a.status.value === filter).length, 0)
  const nonstandard = groups.reduce((n, g) => n + g.counts.nonstandard, 0)

  return (
    <div className="wi">
      <div className="fp-bar wi-bar">
        {view ? (
          <>
            <button className="fp-btn" onClick={() => setView(null)}>← back</button>
            <nav className="wi-crumbs mono" aria-label="Navigation trail">
              <button className="wi-crumb" onClick={() => setView(null)}>all ADRs</button>
              <span className="dim">›</span>
              <span className="wi-crumb cur">{view.id}</span>
            </nav>
          </>
        ) : (
          <>
            <select className="fp-root" value={filter} onChange={(e) => setFilter(e.target.value)} disabled={reg.status !== 'ok'} title="Filter by status">
              <option value="">all statuses</option>
              {(reg.statuses ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {filter && <button className="wi-preset" onClick={() => setFilter('')} title="Clear the status filter">{filter} ×</button>}
            <span className="spacer" />
            {reg.status === 'ok' && (
              <span className="dim small wi-count">
                {shown !== total ? `${shown} of ${total}` : total} ADRs
                {nonstandard > 0 && <> · <span className="warn">{nonstandard} nonstandard</span></>}
                {selected?.size > 0 && <> · filtered to {[...selected].join(', ').toUpperCase()}</>}
                {reg.failed?.length > 0 && (
                  <> · <span className="warn" title={reg.failed.map((f) => `${f.space}: ${f.reason}`).join('\n')}>
                    {reg.failed.length} space{reg.failed.length === 1 ? '' : 's'} not scanned
                  </span></>
                )}
              </span>
            )}
            <button className="fp-btn" onClick={load} title="Reload">↻</button>
          </>
        )}
      </div>
      {view ? (
        <Detail view={view} known={known} roots={roots} onOpen={(space, id) => open(space, id)} />
      ) : reg.status === 'loading' ? (
        <div className="degraded">scanning the vault for ADRs…</div>
      ) : reg.status === 'error' ? (
        <div className="degraded">{reg.reason}</div>
      ) : !total ? (
        <div className="degraded">no ADRs found{selected?.size ? ' in the selected projects' : ''}</div>
      ) : (
        <div className="wi-scroll adr-scroll">
          {groups.map((g) => <Group key={g.space} group={g} filter={filter} onFilter={setFilter} onOpen={open} />)}
        </div>
      )}
    </div>
  )
}
