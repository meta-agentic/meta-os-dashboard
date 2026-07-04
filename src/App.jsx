import React, { useEffect, useState } from 'react'
import Lanes from './widgets/Lanes.jsx'
import Memory from './widgets/Memory.jsx'
import Automations from './widgets/Automations.jsx'
import Registry from './widgets/Registry.jsx'
import Activity from './widgets/Activity.jsx'
import Graph from './widgets/Graph.jsx'
import Lint from './widgets/Lint.jsx'

const FEEDS = ['meta', 'ontology', 'registry', 'automations', 'memory', 'activity', 'lanes', 'lint']

export default function App() {
  const [data, setData] = useState({})
  const [error, setError] = useState(null)

  const refresh = () =>
    Promise.all(FEEDS.map((f) => fetch(`/api/${f}`).then((r) => r.json()).then((d) => [f, d])))
      .then((pairs) => setData(Object.fromEntries(pairs)))
      .catch((e) => setError(String(e)))

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [])

  if (error) return <div className="degraded">API unreachable: {error}</div>
  if (!data.meta) return <div className="degraded">loading…</div>

  return (
    <>
      <header>
        <h1>
          meta-os <span className="dim">/</span> {data.meta.instance}
        </h1>
        <span className="dim mono">{data.meta.instanceRoot}</span>
      </header>
      <main className="grid">
        <Lanes data={data.lanes} />
        <Graph ontology={data.ontology} />
        <Memory data={data.memory} ontology={data.ontology} />
        <Automations data={data.automations} />
        <Registry data={data.registry} />
        <Lint data={data.lint} />
        <Activity data={data.activity} />
      </main>
    </>
  )
}
