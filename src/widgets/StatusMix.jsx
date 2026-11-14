import React from 'react'
import { PieChart } from '../charts/Charts.jsx'
import { combineStatusMix } from './status-mix.mjs'

// Stories by status bucket, split out of the Scrum Report (summing rule in status-mix.mjs).
export default function StatusMix({ data }) {
  const spaces = (data?.spaces ?? []).filter((s) => s.statusMix?.length)
  if (!spaces.length) return <div className="degraded">no backlog data to report</div>
  const mix = combineStatusMix(spaces)
  return (
    <div className="status-mix">
      <div className="dim small">{spaces.map((s) => s.space.toUpperCase()).join(' · ')}</div>
      <PieChart data={mix.map((m) => ({ label: m.label, value: m.value }))} onSelect={() => {}} unit="stories" />
    </div>
  )
}
