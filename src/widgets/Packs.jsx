import React from 'react'
import Card from './Card.jsx'

// Which discipline packs this instance declares, and whether the machine agrees.
//
// The point of this widget is the disagreement column, not the inventory: a pack
// can be mounted from a source the instance never declared, or declared and never
// mounted, and nothing in the OS reads the mount dir back to notice. Both states
// happened here before this existed. So `drifted` and `missing` are rendered as
// warnings even when the total is zero — the zero is the claim.
//
// Sibling of Skills (the by-discipline browser); this one is the health summary.
export default function Packs({ data }) {
  const packs = data?.packs ?? []
  if (!packs.length) {
    return <Card title="Packs mounted" data={data}><div className="degraded">no packs declared</div></Card>
  }
  const t = data.totals ?? {}
  const unknown = data.mountsKnown === false

  return (
    <Card title="Packs mounted" data={data}>
      <div className="tiles">
        <div className="tile"><div className="tile-v">{t.packs ?? packs.length}</div><div className="tile-l">packs</div></div>
        <div className="tile"><div className="tile-v">{t.declaredSkills ?? 0}</div><div className="tile-l">skills declared</div></div>
        <div className="tile">
          {/* Unknown mount state must not render as a clean zero. */}
          <div className="tile-v">{unknown ? '—' : t.mounted ?? 0}</div>
          <div className="tile-l">mounted</div>
        </div>
        <div className="tile">
          <div className={'tile-v' + (!unknown && (t.drifted || t.missing) ? ' warn' : '')}>
            {unknown ? '—' : (t.drifted ?? 0) + (t.missing ?? 0)}
          </div>
          <div className="tile-l">drifted / missing</div>
        </div>
      </div>

      {unknown && <div className="degraded">mount state unknown — {data.mountReason}</div>}

      <ul className="feed">
        {packs.map((p) => (
          <li key={p.name}>
            <span className="mono">{p.name}</span>
            {' '}
            <span className="dim small">{p.local ? 'local' : 'remote'}</span>
            {p.head && <span className="dim small mono"> {p.head}</span>}
            {p.headDate && <span className="dim small"> · {p.headDate.slice(0, 10)}</span>}
            <span className="chips">
              <span className="chip ok" title={`${p.counts.mounted} of ${p.declaredSkills} declared skills resolve into this pack`}>
                {p.counts.mounted}/{p.declaredSkills}
              </span>
              {p.counts.drifted > 0 && (
                <span className="chip down" title="mounted, but resolving somewhere other than this pack's declared source">
                  {p.counts.drifted} drifted
                </span>
              )}
              {p.counts.missing > 0 && (
                <span className="chip down" title="declared in .packs.yaml but not mounted in the skill-discovery dir">
                  {p.counts.missing} missing
                </span>
              )}
            </span>
            {!p.local && <div className="dim small">source is a URL — skill metadata and HEAD unavailable without a local checkout</div>}
          </li>
        ))}
      </ul>

      {data.undeclared?.length > 0 && (
        <div className="dim small" title="mounted in the skill-discovery dir but declared by no pack in .packs.yaml">
          + {data.undeclared.length} mounted skills no pack declares
          {' '}({data.undeclared.filter((u) => u.origin === 'framework').length} framework-owned) — listed in Skills
        </div>
      )}
    </Card>
  )
}
