import React, { useMemo, useState } from 'react'
import Card from './Card.jsx'
import MetaCliHint from './MetaCliHint.jsx'

// The complete skill surface, grouped by the discipline that owns it.
//
// Sibling of Packs: that widget answers "does the declaration hold?", this one
// answers "what can this instance actually do, and where did each capability come
// from?". Framework-owned and undeclared mounts are their own groups, so the union
// mount stays legible rather than flattened into one list.
//
// Two levels: a grid of disciplines filling the widget, then — on click — that
// discipline's skills as cards. A search cuts across every discipline at once.
// Descriptions are each SKILL.md's front-matter: the text the agent reads when
// deciding whether a skill applies.

const shortDate = (iso) => {
  const d = new Date(iso)
  return isNaN(d) ? null : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function groupsOf(data) {
  const g = (data?.packs ?? []).map((p) => ({
    key: p.name,
    label: p.name.replace(/^meta-discipline-/, ''),
    source: p.source,
    head: p.head,
    headDate: p.headDate,
    note: p.local ? null : 'remote source — metadata unavailable',
    skills: p.skills ?? [],
  }))
  const und = data?.undeclared ?? []
  const framework = und.filter((u) => u.origin === 'framework')
  const other = und.filter((u) => u.origin !== 'framework')
  if (framework.length) g.push({ key: '_framework', label: 'framework', note: 'owned by meta-os, not a pack', skills: framework })
  if (other.length) g.push({ key: '_undeclared', label: 'undeclared', note: 'mounted, declared by no pack', skills: other })
  return g
}

const troubled = (skills) => skills.filter((s) => s.state === 'drifted' || s.state === 'missing').length

function Health({ skills }) {
  const drifted = skills.filter((s) => s.state === 'drifted').length
  const missing = skills.filter((s) => s.state === 'missing').length
  if (!drifted && !missing) return <span className="sk-ok">all mounted</span>
  return (
    <span className="warn">
      {[drifted && `${drifted} drifted`, missing && `${missing} missing`].filter(Boolean).join(' · ')}
    </span>
  )
}

function DisciplineTile({ g, onOpen }) {
  return (
    <button className={'sk-tile' + (troubled(g.skills) ? ' bad' : '')} onClick={() => onOpen(g.key)}>
      <span className="sk-tile-n">{g.skills.length}</span>
      <span className="sk-tile-name">{g.label}</span>
      <span className="sk-tile-meta small" title={g.note ?? undefined}>
        {g.note ? <span className="dim">{g.note}</span> : <Health skills={g.skills} />}
      </span>
      {g.head && <span className="sk-tile-meta dim small mono">{g.head}{g.headDate ? ` · ${shortDate(g.headDate)}` : ''}</span>}
    </button>
  )
}

function SkillCard({ s, tag, open, onToggle }) {
  return (
    <button className={'sk-card' + (open ? ' open' : '') + (s.state === 'drifted' || s.state === 'missing' ? ' bad' : '')}
            onClick={onToggle} aria-expanded={open}>
      <span className="sk-card-head">
        <span className="sk-card-title">{s.title && s.title !== s.name ? s.title : s.name}</span>
        {s.state === 'drifted' && <span className="chip down">drifted</span>}
        {s.state === 'missing' && <span className="chip down">missing</span>}
      </span>
      {((s.title && s.title !== s.name) || tag) && (
        <span className="sk-card-sub mono dim small">
          {[s.title && s.title !== s.name ? s.name : null, tag].filter(Boolean).join(' · ')}
        </span>
      )}
      <span className={'sk-card-desc small' + (open ? '' : ' clamp')}>
        {s.description || <span className="dim">no description in SKILL.md front-matter</span>}
      </span>
      {open && (
        <span className="sk-card-foot dim small mono">
          {s.state === 'missing' ? 'declared by the pack but not mounted' : s.mountedFrom ?? ''}
        </span>
      )}
    </button>
  )
}

export default function Skills({ data, engines }) {
  const [q, setQ] = useState('')
  const [at, setAt] = useState(null) // null → the discipline grid; else a group key
  const [expanded, setExpanded] = useState(null) // 'group/skill' of the card shown in full

  const groups = useMemo(() => groupsOf(data), [data])
  const total = groups.reduce((n, g) => n + g.skills.length, 0)
  if (!total) return <Card title="Skills by discipline" data={data}><div className="degraded">no skills found</div></Card>

  const needle = q.trim().toLowerCase()
  const current = groups.find((g) => g.key === at) ?? null
  const hits = needle
    ? (current ? [current] : groups).flatMap((g) => g.skills
      .filter((s) => [s.name, s.title, s.description].some((v) => String(v ?? '').toLowerCase().includes(needle)))
      .map((s) => ({ g, s })))
    : null
  const toggle = (id) => setExpanded((e) => (e === id ? null : id))

  return (
    <Card title="Skills by discipline" data={data}>
      <div className="sk-bar">
        {current && <button className="fp-btn" onClick={() => { setAt(null); setExpanded(null) }}>← all disciplines</button>}
        {current && <span className="sk-crumb mono">{current.label}</span>}
        <input
          className="filter sk-search"
          type="search"
          placeholder={current ? `filter ${current.skills.length} ${current.label} skills…` : `filter ${total} skills…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="filter skills by name or description"
        />
      </div>

      {hits ? (
        hits.length ? (
          <div className="sk-cards">
            {hits.map(({ g, s }) => (
              <SkillCard key={g.key + '/' + s.name} s={s} tag={current ? null : g.label}
                         open={expanded === g.key + '/' + s.name} onToggle={() => toggle(g.key + '/' + s.name)} />
            ))}
          </div>
        ) : <div className="degraded">no skill matches “{q}”</div>
      ) : current ? (
        <>
          <div className="sk-head">
            <span className="sk-head-n">{current.skills.length}</span>
            <span className="sk-head-l">skills</span>
            <span className="small">{current.note ? <span className="dim">{current.note}</span> : <Health skills={current.skills} />}</span>
            {current.head && (
              <span className="dim small mono" title={current.source}>
                {current.head}{current.headDate ? ` · ${shortDate(current.headDate)}` : ''}
              </span>
            )}
          </div>
          <div className="sk-cards">
            {current.skills.map((s) => (
              <SkillCard key={s.name} s={s} open={expanded === current.key + '/' + s.name}
                         onToggle={() => toggle(current.key + '/' + s.name)} />
            ))}
          </div>
        </>
      ) : (
        <div className="sk-grid">
          {groups.map((g) => <DisciplineTile key={g.key} g={g} onOpen={(k) => { setAt(k); setExpanded(null) }} />)}
        </div>
      )}
      <MetaCliHint engines={engines} point="skills" />
    </Card>
  )
}
