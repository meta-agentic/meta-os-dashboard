import React, { useMemo, useState } from 'react'
import Card from './Card.jsx'

// The complete skill surface, grouped by the discipline that owns it.
//
// Sibling of Packs: that widget answers "does the declaration hold?", this one
// answers "what can this instance actually do, and where did each capability come
// from?". Grouping is by pack, with framework-owned and undeclared mounts as their
// own groups so the union mount is legible rather than flattened into one list —
// the flattening is what made a whole pack invisible for two weeks.
//
// Descriptions come from each SKILL.md's front-matter, so this reads the same text
// the agent reads when deciding whether a skill applies.
export default function Skills({ data }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(() => new Set())

  const groups = useMemo(() => {
    const g = (data?.packs ?? []).map((p) => ({
      key: p.name,
      label: p.name.replace(/^meta-discipline-/, ''),
      note: p.local ? null : 'remote source — metadata unavailable',
      skills: p.skills ?? [],
    }))
    const und = data?.undeclared ?? []
    const framework = und.filter((u) => u.origin === 'framework')
    const other = und.filter((u) => u.origin !== 'framework')
    if (framework.length) g.push({ key: '_framework', label: 'framework', note: 'owned by meta-os, not a pack', skills: framework })
    if (other.length) g.push({ key: '_undeclared', label: 'undeclared', note: 'mounted, declared by no pack', skills: other })
    return g
  }, [data])

  const needle = q.trim().toLowerCase()
  const shown = needle
    ? groups
        .map((g) => ({
          ...g,
          skills: g.skills.filter((s) =>
            s.name.toLowerCase().includes(needle) || (s.description ?? '').toLowerCase().includes(needle)),
        }))
        .filter((g) => g.skills.length)
    : groups

  const total = groups.reduce((n, g) => n + g.skills.length, 0)
  if (!total) return <Card title="Skills by discipline" data={data}><div className="degraded">no skills found</div></Card>

  const toggle = (k) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(k)) next.delete(k); else next.add(k)
    return next
  })

  return (
    <Card title="Skills by discipline" data={data}>
      <input
        className="filter"
        type="search"
        placeholder={`filter ${total} skills…`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="filter skills by name or description"
      />
      <ul className="feed">
        {shown.map((g) => {
          // A search narrows the list, so open every matching group; otherwise
          // respect the click state and start collapsed.
          const isOpen = needle ? true : open.has(g.key)
          return (
            <li key={g.key}>
              <button className="ghostbtn" onClick={() => toggle(g.key)} aria-expanded={isOpen}>
                <span className="mono">{isOpen ? '▾' : '▸'} {g.label}</span>
                <span className="chips"><span className="chip">{g.skills.length}</span></span>
              </button>
              {g.note && <span className="dim small"> {g.note}</span>}
              {isOpen && (
                <ul className="feed skill-list">
                  {g.skills.map((s) => (
                    <li key={g.key + '/' + s.name}>
                      <span className="mono">{s.name}</span>
                      {s.state === 'drifted' && <span className="chip down" title={`mounted from ${s.mountedFrom ?? 'unknown'}`}>drifted</span>}
                      {s.state === 'missing' && <span className="chip down" title="declared but not mounted">missing</span>}
                      {s.description
                        ? <div className="dim small">{s.description}</div>
                        : <div className="dim small">no description in SKILL.md front-matter</div>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
