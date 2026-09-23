import React from 'react'

// The meta-cli enhancement point inside a host widget (MOS-148). Renders nothing unless
// meta-cli is enabled and its feed is healthy, so a disabled plugin leaves the host
// widget exactly as it was. Each `point` says what meta-cli adds *there*:
//   usage  — engines that can take work when Claude usage runs short
//   lanes  — a lane could be dispatched to another engine (agile-swarm plugin, MOS-147)
//   skills — the multi-engine skill and the cross-provider review it enables
export default function MetaCliHint({ engines, point }) {
  if (!engines?.enabled || engines.available === false) return null
  const offload = engines.offload ?? []
  const list = offload.length ? offload.join(' · ') : 'none ready'
  let body
  if (point === 'usage') {
    const offRuns = (engines.providers ?? [])
      .filter((p) => p.provider !== 'claude' && p.runs30d)
      .reduce((a, p) => a + p.runs30d.runs, 0)
    body = (
      <>
        offload headroom: <b>{list}</b>
        <span className="dim"> · {offRuns} run{offRuns === 1 ? '' : 's'} offloaded in {engines.windowDays}d</span>
      </>
    )
  } else if (point === 'lanes') {
    body = (
      <>
        lanes can run on: <b>{list}</b>
        <span className="dim"> via <span className="mono">meta run -C &lt;worktree&gt;</span> (agile-swarm plugin, MOS-147)</span>
      </>
    )
  } else if (point === 'skills') {
    body = engines.skill?.mounted ? (
      <>
        <span className="mono">multi-engine</span> mounted: cross-provider review with{' '}
        <span className="mono">meta fan -p {['claude', ...offload].join(',')}</span>
      </>
    ) : (
      <><span className="mono">multi-engine</span> skill not mounted: meta-cli is on, but no skill uses it</>
    )
  } else {
    return null
  }
  return (
    <div className="metacli-hint small" title="meta-cli enhancement point (MOS-148)">
      <span className="chip eta">⇄ meta-cli</span> {body}
    </div>
  )
}
