import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { apiGet, isStatic } from '../api.js'

// Fixed row height is what makes the window arithmetic exact — keep in step with
// .wi-row in styles.css.
const ROW = 30
const OVERSCAN = 8

const FLOW = { todo: 'todo', 'in-progress': 'wip', done: 'done' }
const STATES = [
  ['', 'all states'], ['todo', 'to do'], ['in-progress', 'in progress'], ['done', 'done'], ['other', 'out of flow'],
]
// Natural order for ids: IOS-9 < IOS-10 < IOS-S2-01.
const idKey = (id) => String(id ?? '').replace(/\d+/g, (n) => n.padStart(8, '0'))
const cmpText = (a, b) => String(a ?? '').localeCompare(String(b ?? ''))
const cmpNum = (a, b) => (a == null) - (b == null) || (a ?? 0) - (b ?? 0)

const COLS = [
  { k: 'id', label: 'id', w: '7.5rem', cmp: (a, b) => cmpText(idKey(a.id), idKey(b.id)) },
  { k: 'title', label: 'title', w: 'auto', cmp: (a, b) => cmpText(a.title, b.title) },
  { k: 'status', label: 'status', w: '7.5rem', cmp: (a, b) => cmpText(a.flowState ?? 'z', b.flowState ?? 'z') || cmpText(a.status, b.status) },
  { k: 'kind', label: 'kind', w: '5.5rem', cmp: (a, b) => cmpText(a.kind, b.kind) },
  { k: 'storyPoints', label: 'pts', w: '3.5rem', num: true, cmp: (a, b) => cmpNum(a.storyPoints, b.storyPoints) },
  { k: 'epic', label: 'epic', w: '6.5rem', cmp: (a, b) => cmpText(idKey(a.epic), idKey(b.epic)) },
  { k: 'project', label: 'lane', w: '5.5rem', cmp: (a, b) => cmpText(a.project, b.project) },
  { k: 'blocked', label: 'blocked', w: '6rem', cmp: (a, b) => (b.blockedBy?.length ?? 0) - (a.blockedBy?.length ?? 0) },
]

function Pill({ status, flowState, small }) {
  return (
    <span className={`wi-pill ${FLOW[flowState] ?? 'none'}${small ? ' small' : ''}`}>
      {String(status ?? '').toLowerCase() || '—'}
    </span>
  )
}

function Blocked({ by }) {
  if (!by?.length) return null
  return (
    <span className="chip down" title={`blocked by ${by.join(', ')}`}>
      blocked{by.length > 1 ? ` ×${by.length}` : ''}
    </span>
  )
}

// Windowed table: only the rows inside the viewport (plus OVERSCAN either side) are
// mounted; two spacer rows hold the scroll height of everything else.
function Table({ rows, sort, onSort, onOpen, scrollPos }) {
  const ref = useRef(null)
  const headRef = useRef(null)
  const [top, setTop] = useState(0)
  const [height, setHeight] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    setHeight(el.clientHeight)
    el.scrollTop = scrollPos.current // coming back from a detail page lands where you left
    setTop(el.scrollTop)
    return () => ro.disconnect()
  }, [])

  const onScroll = (e) => {
    scrollPos.current = e.currentTarget.scrollTop
    setTop(e.currentTarget.scrollTop)
  }
  const headH = headRef.current?.offsetHeight ?? 0
  const first = Math.max(0, Math.floor((top - headH) / ROW) - OVERSCAN)
  const last = Math.min(rows.length, Math.ceil((top - headH + height) / ROW) + OVERSCAN)

  return (
    <div className="wi-scroll" ref={ref} onScroll={onScroll}>
      <table className="wi-table">
        <colgroup>{COLS.map((c) => <col key={c.k} style={{ width: c.w }} />)}</colgroup>
        <thead ref={headRef}>
          <tr>
            {COLS.map((c) => (
              <th key={c.k} className={c.num ? 'num' : ''} aria-sort={sort.k === c.k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                <button className={'wi-sort' + (sort.k === c.k ? ' on' : '')} onClick={() => onSort(c.k)} title={`Sort by ${c.label}`}>
                  {c.label}{sort.k === c.k && <span className="wi-arrow">{sort.dir > 0 ? '▲' : '▼'}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {first > 0 && <tr className="wi-pad" style={{ height: first * ROW }}><td colSpan={COLS.length} /></tr>}
          {rows.slice(first, last).map((r) => (
            <tr
              key={r.id}
              className="wi-row"
              tabIndex={0}
              onClick={() => onOpen(r.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(r.id) } }}
            >
              <td className="wi-id mono">{r.id}</td>
              <td className="wi-title" title={r.title}>{r.title}</td>
              <td><Pill status={r.status} flowState={r.flowState} /></td>
              <td className="dim">{r.kind ?? ''}</td>
              <td className="num">{r.storyPoints ?? <span className="dim">·</span>}</td>
              <td className="mono dim">{r.epic ?? ''}</td>
              <td className="mono dim">{r.project ?? ''}</td>
              <td><Blocked by={r.blockedBy} /></td>
            </tr>
          ))}
          {last < rows.length && <tr className="wi-pad" style={{ height: (rows.length - last) * ROW }}><td colSpan={COLS.length} /></tr>}
        </tbody>
      </table>
    </div>
  )
}

function Links({ title, links, tone, onOpen }) {
  if (!links?.length) return null
  return (
    <section className="wi-links">
      <h4>{title} <span className="dim">{links.length}</span></h4>
      <ul>
        {links.map((l) => (
          <li key={l.id}>
            {l.title != null ? (
              <button className={`chip wi-link ${tone ?? ''}`} onClick={() => onOpen(l.id)} title={`Open ${l.id}`}>{l.id}</button>
            ) : (
              <span className="chip wi-link off" title="not an item in this space">{l.id}</span>
            )}
            <span className="wi-ltitle" title={l.title ?? ''}>{l.title ?? <em className="dim">unknown here</em>}</span>
            {l.title != null && <Pill status={l.status} flowState={l.flowState} small />}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Detail({ view, space, onOpen }) {
  if (view.error) return <div className="degraded">{view.error}</div>
  if (!view.item) return <div className="degraded">loading {view.id}…</div>
  const it = view.item
  const meta = [
    ['kind', it.kind], ['points', it.storyPoints], ['priority', it.priority],
    ['lane', it.project], ['sprint', Array.isArray(it.sprint) ? it.sprint.join(', ') : it.sprint],
  ].filter(([, v]) => v != null && v !== '')
  const hasLinks = [it.blockedBy, it.dependencies, it.relates, it.dependents, it.relatedBy, it.children].some((l) => l?.length)
  const blocked = (it.blockedBy ?? []).map((id) => it.dependencies.find((d) => d.id === id) ?? { id })
  return (
    <div className="wi-detail">
      <header className="wi-dhead">
        <div className="wi-dtags">
          <span className="wi-id mono">{it.id}</span>
          <Pill status={it.status} flowState={it.flowState} />
          {it.kind && <span className="chip">{it.kind}</span>}
          {it.priority && <span className="chip">{it.priority}</span>}
        </div>
        <h3 className="wi-dtitle">{it.title}</h3>
      </header>
      <dl className="wi-meta">
        {meta.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>
        ))}
        {it.epicLink && (
          <div><dt>epic</dt><dd>
            <button className="chip wi-link" onClick={() => onOpen(it.epicLink.id)} title={it.epicLink.title ?? `Open ${it.epicLink.id}`}>{it.epicLink.id}</button>
            {it.epicLink.title && <span className="wi-ltitle dim" title={it.epicLink.title}>{it.epicLink.title}</span>}
          </dd></div>
        )}
        {it.labels?.length > 0 && (
          <div className="wi-labels"><dt>labels</dt><dd>{it.labels.map((l) => <span key={l} className="chip">{l}</span>)}</dd></div>
        )}
      </dl>
      <div className="wi-linkgrid">
        <Links title="Blocked by" links={blocked} tone="down" onOpen={onOpen} />
        <Links title="Dependencies" links={it.dependencies} onOpen={onOpen} />
        <Links title="Related" links={it.relates} onOpen={onOpen} />
        <Links title="Depended on by" links={it.dependents} onOpen={onOpen} />
        <Links title="Related from" links={it.relatedBy} onOpen={onOpen} />
        <Links title="Stories in this epic" links={it.children} onOpen={onOpen} />
        {!hasLinks && <div className="dim small">no links to other items</div>}
      </div>
      {it.body != null ? (
        <pre className="wi-prose">{it.body || <span className="dim">(empty body)</span>}</pre>
      ) : (
        <div className="degraded">no body — {view.reason ?? 'no source file for this item'}</div>
      )}
      {it.path && <div className="wi-foot dim small mono">{space}/{it.path}</div>}
    </div>
  )
}

export default function WorkItems({ spaces, selected }) {
  // Driven entirely by the global project filter bar (App.jsx), not an internal
  // picker — this table only ever shows one project, so it needs exactly one
  // selected there; zero or several fall through to a guidance state below.
  const selectedList = useMemo(() => [...(selected ?? [])], [selected])
  const space = selectedList.length === 1 ? selectedList[0] : ''
  const [list, setList] = useState({ status: 'idle' })
  const [q, setQ] = useState('')
  const [state, setState] = useState('')
  const [sort, setSort] = useState({ k: 'id', dir: 1 })
  const [view, setView] = useState(null) // null → table; { id, item?, error?, reason? }
  const [trail, setTrail] = useState([]) // ids walked through to reach `view`
  const cache = useRef(new Map())
  const scrollPos = useRef(0)
  const seq = useRef(0)

  const loadList = () => {
    if (!space) return setList({ status: 'idle' })
    if (isStatic) return setList({ status: 'error', reason: 'Work items need the live API — not available on static GitHub Pages' })
    const n = ++seq.current
    setList({ status: 'loading' })
    apiGet(`/api/items?space=${encodeURIComponent(space)}`)
      .then((d) => { if (n === seq.current) setList(d.available === false ? { status: 'error', reason: d.reason } : { status: 'ok', items: d.items }) })
      .catch((e) => { if (n === seq.current) setList({ status: 'error', reason: String(e) }) })
  }
  useEffect(() => {
    cache.current = new Map()
    scrollPos.current = 0
    setView(null)
    setTrail([])
    loadList()
  }, [space])

  const open = (id, push = true) => {
    if (push && view?.id) setTrail((t) => [...t, view.id])
    const hit = cache.current.get(id)
    if (hit) return setView({ id, ...hit })
    setView({ id })
    apiGet(`/api/item?space=${encodeURIComponent(space)}&id=${encodeURIComponent(id)}`)
      .then((d) => {
        const next = d.available === false ? { error: d.reason } : { item: d.item, reason: d.reason }
        if (!next.error) cache.current.set(id, next)
        setView((v) => (v?.id === id ? { id, ...next } : v))
      })
      .catch((e) => setView((v) => (v?.id === id ? { id, error: String(e) } : v)))
  }
  const back = () => {
    if (!trail.length) return setView(null)
    const id = trail[trail.length - 1]
    setTrail((t) => t.slice(0, -1))
    open(id, false)
  }
  const jump = (i) => {
    // i === -1 → the table; otherwise reopen trail[i] and drop everything after it
    if (i < 0) { setTrail([]); return setView(null) }
    const id = trail[i]
    setTrail((t) => t.slice(0, i))
    open(id, false)
  }
  const onSort = (k) => setSort((s) => (s.k === k ? { k, dir: -s.dir } : { k, dir: 1 }))

  const rows = useMemo(() => {
    if (list.status !== 'ok') return []
    const needle = q.trim().toLowerCase()
    const col = COLS.find((c) => c.k === sort.k) ?? COLS[0]
    return list.items
      .filter((r) => {
        if (state === 'other' ? r.flowState : state && r.flowState !== state) return false
        if (!needle) return true
        return [r.id, r.title, r.epic, r.project, ...(r.labels ?? [])].some((v) => String(v ?? '').toLowerCase().includes(needle))
      })
      .sort((a, b) => col.cmp(a, b) * sort.dir || cmpText(idKey(a.id), idKey(b.id)))
  }, [list, q, state, sort])

  const total = list.status === 'ok' ? list.items.length : 0
  const blocked = list.status === 'ok' ? list.items.filter((r) => r.blockedBy).length : 0

  return (
    <div className="wi">
      <div className="fp-bar wi-bar">
        {space && <span className="mono wi-space" title="Project — set from the filter bar above">{space.toUpperCase()}</span>}
        {view ? (
          <>
            <button className="fp-btn" onClick={back} title={trail.length ? `Back to ${trail[trail.length - 1]}` : 'Back to the table'}>← back</button>
            <nav className="wi-crumbs mono" aria-label="Navigation trail">
              <button className="wi-crumb" onClick={() => jump(-1)}>all items</button>
              {trail.map((id, i) => (
                <React.Fragment key={i}>
                  <span className="dim">›</span>
                  <button className="wi-crumb" onClick={() => jump(i)}>{id}</button>
                </React.Fragment>
              ))}
              <span className="dim">›</span>
              <span className="wi-crumb cur">{view.id}</span>
            </nav>
          </>
        ) : (
          <>
            <input
              className="wi-search"
              type="search"
              placeholder="filter id, title, epic, lane, label…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={list.status !== 'ok'}
            />
            <select className="fp-root" value={state} onChange={(e) => setState(e.target.value)} disabled={list.status !== 'ok'} title="Flow state">
              {STATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <span className="spacer" />
            {list.status === 'ok' && (
              <span className="dim small wi-count">
                {rows.length !== total ? `${rows.length} of ${total}` : total} items
                {blocked > 0 && <> · <span className="warn">{blocked} blocked</span></>}
              </span>
            )}
            <button className="fp-btn" onClick={loadList} disabled={!space} title="Reload this space">↻</button>
          </>
        )}
      </div>

      {view ? (
        <Detail view={view} space={space} onOpen={open} />
      ) : !spaces?.length ? (
        <div className="degraded">no backlog spaces configured — add one under `backlogs` in instance.config.json</div>
      ) : selectedList.length === 0 ? (
        <div className="degraded">select a project in the bar above to browse its work items</div>
      ) : selectedList.length > 1 ? (
        <div className="degraded">
          {selectedList.length} projects selected — Work Items shows one at a time; narrow the selection above
          ({selectedList.map((s) => s.toUpperCase()).join(', ')})
        </div>
      ) : list.status === 'loading' ? (
        <div className="degraded">loading {space.toUpperCase()}…</div>
      ) : list.status === 'error' ? (
        <div className="degraded">{space.toUpperCase()}: {list.reason}</div>
      ) : !total ? (
        <div className="degraded">{space.toUpperCase()} has no work items yet</div>
      ) : !rows.length ? (
        <div className="degraded">no items match{q ? ` “${q}”` : ''}{state ? ` in ${STATES.find(([v]) => v === state)?.[1]}` : ''}</div>
      ) : (
        <Table rows={rows} sort={sort} onSort={onSort} onOpen={open} scrollPos={scrollPos} />
      )}
    </div>
  )
}
