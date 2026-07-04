import React from 'react'
import Card from './Card.jsx'

function ago(ts) {
  const mins = Math.floor((Date.now() - new Date(ts)) / 60000)
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 48) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}

function LastRun({ lastRun }) {
  if (!lastRun) return <span className="dim small">never</span>
  return (
    <span className={lastRun.outcome === 'fail' ? 'warn' : ''}>
      <span className={`dot ${lastRun.outcome === 'fail' ? 'fail' : 'ok'}`} />
      {ago(lastRun.ts)}
    </span>
  )
}

export default function Automations({ data }) {
  return (
    <Card title="Automations" data={data}>
      <table>
        <thead>
          <tr><th>automation</th><th>trigger</th><th>cadence</th><th>last run</th><th>status</th></tr>
        </thead>
        <tbody>
          {data?.rows?.map((r, i) => (
            <tr key={i}>
              <td>{r.automation}</td>
              <td className="dim">{r.trigger}</td>
              <td>{r.cadence && r.cadence !== '—' ? <span className="chip mono">{r.cadence}</span> : <span className="dim">event</span>}</td>
              <td><LastRun lastRun={r.lastRun} /></td>
              <td><span className={`chip ${r.status === 'shipped' ? 'ok' : ''}`}>{r.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {data?.runLog === false && (
        <div className="dim small">no automations/runs.jsonl yet — last-run appears once automations log their executions</div>
      )}
    </Card>
  )
}
