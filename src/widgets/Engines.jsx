import React from 'react'
import Card from './Card.jsx'

const dur = (ms) => (ms >= 60e3 ? `${Math.round(ms / 60e3)}m` : `${Math.round(ms / 1e3)}s`)

// meta-cli engines (MOS-148): the configuration meta-cli would route across. Plans are
// what the PO declared in config, labelled as such; CLI/ACP/version come from
// `meta which`; run counts from the meta runs dir. When the plugin is off it says so
// and how to enable it, rather than rendering an empty table.
export default function Engines({ data }) {
  if (data && data.available !== false && !data.enabled) {
    return (
      <Card title="meta-cli engines" data={data}>
        <div className="degraded">meta-cli plugin disabled. {data.hint}</div>
      </Card>
    )
  }
  const rows = data?.providers ?? []
  return (
    <Card title="meta-cli engines" data={data}>
      <div className="usagetotals">
        <span className="chip ok" title="adapters with a working CLI">{data?.ready?.length ?? 0} ready</span>
        <span className="chip eta" title="ready engines other than claude — where work can go when Claude usage runs short">
          offload → {data?.offload?.length ? data.offload.join(' · ') : 'none'}
        </span>
        <span className="chip" title="meta run / meta fan invocations; a fan counts once">{data?.runs ?? 0} meta invocations / {data?.windowDays ?? 30}d</span>
        <span className={`chip ${data?.skill?.mounted ? 'ok' : 'down'}`}>
          skill multi-engine {data?.skill?.mounted ? 'mounted' : 'not mounted'}
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th>engine</th><th title="as declared in metaCli.providers — not detected">plan (declared)</th>
            <th>cli</th><th>acp</th><th>version</th><th className="num">runs ok/fail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.provider}>
              <td className="mono">{r.provider}</td>
              <td className={r.plan ? '' : 'dim'}>{r.plan ?? '—'}</td>
              <td>
                <span className={`chip ${r.cli === 'ok' ? 'ok' : 'down'}`}>{r.cli}</span>
                {!r.adapter && <span className="chip down" title="meta-cli has no adapter for this engine yet (MOS-147)">no adapter</span>}
              </td>
              <td className="dim">{r.acp}</td>
              <td className="dim small" title={r.path ?? ''}>
                {r.note ?? ''}
                {r.models && ` · ${r.models.length} local model${r.models.length === 1 ? '' : 's'}`}
              </td>
              <td className="num">
                {r.runs30d ? (
                  <span title={`total ${dur(r.runs30d.ms)}`}>{r.runs30d.ok}/{r.runs30d.failed}</span>
                ) : <span className="dim">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data?.runsReason && <div className="dim small">runs: {data.runsReason}</div>}
      {data?.checkedAt && <div className="dim small">checked {new Date(data.checkedAt).toLocaleTimeString()} via <span className="mono">{data.bin} which</span></div>}
    </Card>
  )
}
