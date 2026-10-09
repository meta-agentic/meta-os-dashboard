import React, { useEffect, useRef, useState } from 'react'
import GridLayout, { WidthProvider } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import Lanes from './widgets/Lanes.jsx'
import SprintSummary from './widgets/SprintSummary.jsx'
import Burndown from './widgets/Burndown.jsx'
import Velocity from './widgets/Velocity.jsx'
import SprintStats from './widgets/SprintStats.jsx'
import Packs from './widgets/Packs.jsx'
import Harness from './widgets/Harness.jsx'
import Skills from './widgets/Skills.jsx'
import Memory from './widgets/Memory.jsx'
import FederatedVaults from './widgets/FederatedVaults.jsx'
import PromotionPipeline from './widgets/PromotionPipeline.jsx'
import PromotionFlow from './widgets/PromotionFlow.jsx'
import Ingestion from './widgets/Ingestion.jsx'
import SessionSpend from './widgets/SessionSpend.jsx'
import SessionScatter from './widgets/SessionScatter.jsx'
import { tabsFor, reconcile, withFloors, loadTabs, storeTabs, toServerDoc, fromServerDoc } from './tabs.js'
import Automations from './widgets/Automations.jsx'
import Registry from './widgets/Registry.jsx'
import Activity from './widgets/Activity.jsx'
import GraphView from './widgets/graph/GraphView.jsx'
import GraphTable from './widgets/graph/GraphTable.jsx'
import Lint from './widgets/Lint.jsx'
import Outputs from './widgets/Outputs.jsx'
import Usage from './widgets/Usage.jsx'
import Engines from './widgets/Engines.jsx'
import Nav from './Nav.jsx'
import Distribution from './widgets/Distribution.jsx'
import FilePreview from './widgets/FilePreview.jsx'
import Gantt from './widgets/Gantt.jsx'
import Report from './widgets/Report.jsx'
import WorkItems from './widgets/WorkItems.jsx'
import AdrRegister from './widgets/AdrRegister.jsx'
import Flow from './widgets/Flow.jsx'
import { apiFetch, isStatic } from './api.js'
import { useAuth } from './auth/AuthProvider.jsx'
import Onboarding from './Onboarding.jsx'
import { deriveOnboarding } from './onboarding.js'

const FEEDS = ['meta', 'ontology', 'registry', 'automations', 'memory', 'events', 'lanes', 'lint', 'outputs', 'usage', 'report', 'packs', 'engines', 'harness']

// Every widget belongs to one group; the tabs are generated from the groups (tabs.js),
// so a widget's tab is decided here, next to the widget, and nowhere else.
const WIDGETS = [
  // vault × git × GitHub. Fetches /api/flow itself (cached server-side), not a polled
  // feed; an item id hands Work Items a preset that opens that item.
  { i: 'flow', group: 'flow', title: 'Flow — waiting · drift · lanes', render: (d, ctx) => <Flow onOpenItem={ctx?.focusItems} /> },
  // Its queue chips open an item in Work Items and move the project filter to its project.
  { i: 'lanes', group: 'sprint', title: 'Sprint Lanes', render: (d, ctx) => <Lanes data={d.lanes} engines={d.engines} onOpenItem={ctx?.focusItems} /> },
  { i: 'sprint-summary', group: 'sprint', title: 'Sprint Summary', render: (d) => <SprintSummary data={d.lanes} /> },
  { i: 'graph', group: 'knowledge', title: 'Knowledge Graph', render: (d) => <GraphView ontology={d.ontology} /> },
  { i: 'graph-table', group: 'knowledge', title: 'Graph Hubs', render: (d) => <GraphTable ontology={d.ontology} /> },
  { i: 'memory', group: 'memory', title: 'Memory', render: (d) => <Memory data={d.memory} /> },
  { i: 'federated-vaults', group: 'memory', title: 'Federated Vaults', render: (d) => <FederatedVaults data={d.memory} /> },
  { i: 'promotion-pipeline', group: 'memory', title: 'Promotion Pipeline', render: (d) => <PromotionPipeline data={d.memory} ontology={d.ontology} /> },
  { i: 'promotion-flow', group: 'memory', title: 'Promotion Flow', render: (d) => <PromotionFlow data={d.memory} ontology={d.ontology} /> },
  { i: 'ingestion', group: 'memory', title: 'Ingestion', render: (d) => <Ingestion events={d.events} /> },
  { i: 'outputs', group: 'memory', title: 'Outputs', render: (d) => <Outputs data={d.outputs} /> },
  { i: 'automations', group: 'operations', title: 'Automations', render: (d) => <Automations data={d.automations} /> },
  { i: 'usage', group: 'usage', title: 'Engine Usage', render: (d) => <Usage data={d.usage} engines={d.engines} /> },
  { i: 'session-spend', group: 'usage', title: 'Per-session spend', render: (d) => <SessionSpend data={d.usage} /> },
  { i: 'session-scatter', group: 'usage', title: 'Cost × Throughput', render: (d) => <SessionScatter data={d.usage} /> },
  { i: 'engines', group: 'usage', title: 'meta-cli engines', render: (d) => <Engines data={d.engines} /> },
  { i: 'registry', group: 'operations', title: 'Registry', render: (d) => <Registry data={d.registry} /> },
  { i: 'lint', group: 'operations', title: 'Lint', render: (d) => <Lint data={d.lint} /> },
  { i: 'activity', group: 'operations', title: 'Activity', render: (d) => <Activity data={d.events} /> },
  { i: 'distribution', group: 'backlog', title: 'Distribution', render: (d) => <Distribution data={d.lanes} /> },
  { i: 'files', group: 'knowledge', title: 'File Preview', render: (d) => <FilePreview roots={d.meta?.roots} /> },
  { i: 'gantt', group: 'backlog', title: 'Roadmap', render: (d) => <Gantt data={d.report} /> },
  { i: 'burndown', group: 'sprint', title: 'Burndown', render: (d) => <Burndown data={d.report} /> },
  { i: 'velocity', group: 'sprint', title: 'Velocity', render: (d) => <Velocity data={d.report} /> },
  { i: 'sprint-stats', group: 'sprint', title: 'Sprint Stats', render: (d) => <SprintStats data={d.report} /> },
  { i: 'packs', group: 'skills', title: 'Packs mounted', render: (d) => <Packs data={d.packs} /> },
  { i: 'harness', group: 'operations', title: 'Harness', render: (d) => <Harness data={d.harness} /> },
  { i: 'skills', group: 'skills', title: 'Skills by discipline', render: (d) => <Skills data={d.packs} engines={d.engines} /> },
  // Its count tiles hand a preset to Work Items (ctx.focusItems) — see focusItems below.
  { i: 'report', group: 'sprint', title: 'Scrum Report', render: (d, ctx) => <Report data={d.report} onFocus={ctx?.focusItems} /> },
  // Fetches on demand (whole-space list + per-item detail), not from the polled feeds.
  // Driven by the global project filter bar, not its own picker — ctx.selectedProjects
  // is the same Set every space-scoped widget reads.
  { i: 'work-items', group: 'backlog', title: 'Work Items', render: (d, ctx) => <WorkItems spaces={projectOptions(d)} selected={ctx?.selectedProjects} focus={ctx?.itemsFocus} /> },
  // Read-only, on demand (/api/adrs, /api/adr) like Work Items, and narrowed by the
  // same project filter. Its home is the backlog tab: the vault's read-only views.
  { i: 'adr-register', group: 'backlog', title: 'ADR Register', render: (d, ctx) => <AdrRegister selected={ctx?.selectedProjects} roots={d.meta?.roots} /> },
]

// Default size and size floor per widget: the auto-arranged tabs place each widget at
// this size, and a resize can never go below the floor.
const SIZES = Object.fromEntries([
  { i: 'sprint-summary', x: 0, y: 0, w: 12, h: 9, minW: 4, minH: 5 },
  { i: 'lanes', x: 0, y: 9, w: 7, h: 11, minW: 4, minH: 6 },
  { i: 'graph', x: 7, y: 9, w: 5, h: 11, minW: 3, minH: 6 },
  { i: 'memory', x: 0, y: 20, w: 4, h: 6, minW: 3, minH: 5 },
  { i: 'federated-vaults', x: 0, y: 26, w: 4, h: 9, minW: 3, minH: 4 },
  { i: 'promotion-pipeline', x: 4, y: 20, w: 4, h: 5, minW: 3, minH: 4 },
  { i: 'promotion-flow', x: 4, y: 25, w: 4, h: 7, minW: 3, minH: 5 },
  { i: 'ingestion', x: 8, y: 25, w: 4, h: 7, minW: 3, minH: 5 },
  { i: 'outputs', x: 8, y: 20, w: 4, h: 8, minW: 3, minH: 5 },
  { i: 'automations', x: 0, y: 29, w: 4, h: 8, minW: 3, minH: 5 },
  { i: 'usage', x: 0, y: 28, w: 6, h: 8, minW: 3, minH: 5 },
  { i: 'session-spend', x: 0, y: 36, w: 6, h: 6, minW: 3, minH: 4 },
  { i: 'session-scatter', x: 6, y: 36, w: 6, h: 9, minW: 3, minH: 6 },
  { i: 'registry', x: 6, y: 28, w: 3, h: 8, minW: 3, minH: 5 },
  { i: 'lint', x: 9, y: 28, w: 3, h: 8, minW: 3, minH: 5 },
  { i: 'activity', x: 0, y: 36, w: 8, h: 7, minW: 4, minH: 5 },
  { i: 'distribution', x: 8, y: 36, w: 4, h: 9, minW: 3, minH: 7 },
  { i: 'files', x: 0, y: 45, w: 6, h: 11, minW: 3, minH: 7 },
  { i: 'gantt', x: 6, y: 45, w: 6, h: 11, minW: 4, minH: 7 },
  { i: 'burndown', x: 0, y: 56, w: 6, h: 9, minW: 4, minH: 6 },
  { i: 'velocity', x: 6, y: 56, w: 6, h: 9, minW: 4, minH: 6 },
  { i: 'sprint-stats', x: 0, y: 77, w: 12, h: 16, minW: 6, minH: 8 },
  { i: 'packs', x: 0, y: 65, w: 6, h: 9, minW: 4, minH: 6 },
  { i: 'skills', x: 6, y: 65, w: 6, h: 9, minW: 4, minH: 6 },
  { i: 'report', x: 0, y: 65, w: 12, h: 12, minW: 5, minH: 9 },
  { i: 'graph-table', x: 0, y: 77, w: 6, h: 8, minW: 3, minH: 5 },
  { i: 'work-items', x: 0, y: 85, w: 12, h: 16, minW: 6, minH: 8 },
  { i: 'adr-register', x: 0, y: 101, w: 12, h: 16, minW: 6, minH: 8 },
  { i: 'engines', x: 0, y: 101, w: 6, h: 9, minW: 4, minH: 6 },
  { i: 'harness', x: 6, y: 101, w: 6, h: 9, minW: 4, minH: 6 },
  { i: 'flow', x: 0, y: 0, w: 12, h: 22, minW: 6, minH: 10 },
].map(({ i, ...size }) => [i, size]))

const PREFS_KEY = 'meta-os.prefs.v1'
const DEFAULT_PREFS = { theme: 'system', palette: 'graphite', density: 'comfortable', refreshSec: 30 }
const DENSITY = {
  comfortable: { margin: [14, 14], rowHeight: 30 },
  compact: { margin: [8, 8], rowHeight: 24 },
}
function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || 'null') || {}) }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}
// Widgets whose data is keyed by backlog SPACE (ios, iam, vec, ...) — the only ones
// the global project filter can act on. Registry uses a different, unlinked project
// vocabulary (repo entries, no `space` field), and most other widgets (Graph, Packs,
// Files, Usage, ...) have no project axis at all, so the filter leaves them alone.
const SPACE_SCOPED = new Set(['lanes', 'sprint-summary', 'distribution', 'activity', 'report', 'sprint-stats'])

// Every backlog space currently known to the lanes feed — the option list for the
// project filter bar. Derived live so a newly-onboarded space shows up without a
// code change.
const projectOptions = (data) =>
  [...new Set((data?.lanes?.spaces ?? []).filter((s) => s.available !== false).map((s) => s.space))].sort()

// Narrows the shared feed data down to the selected projects, for one space-scoped
// widget. An empty selection means no filter. `lanes`/`sprint-summary`/
// `distribution` all read `d.lanes.spaces`; `activity` reads `d.events.events`,
// whose rows carry the space as `actor`; `report` reads `d.report.spaces`.
function scopeToProject(data, widgetId, selected) {
  if (!selected.size || !SPACE_SCOPED.has(widgetId)) return data
  if (widgetId === 'report' || widgetId === 'sprint-stats') {
    return {
      ...data,
      report: data.report && { ...data.report, spaces: (data.report.spaces ?? []).filter((s) => selected.has(s.space)) },
    }
  }
  if (widgetId === 'activity') {
    return {
      ...data,
      events: data.events && { ...data.events, events: (data.events.events ?? []).filter((e) => selected.has(e.actor)) },
    }
  }
  return {
    ...data,
    lanes: data.lanes && { ...data.lanes, spaces: (data.lanes.spaces ?? []).filter((s) => selected.has(s.space)) },
  }
}

// Project filter is GLOBAL and persisted, like the group filter it replaces:
// zero or more selected projects, applying to every space-scoped widget on every
// tab — not a layout concern, so it's stored apart from the tab arrangements.
// Empty selection = no filter (show every project), same as the old "no groups
// hidden" state.
const PROJECTFILTER_KEY = 'meta-os.projectfilter.v1'
function loadProjectFilter() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROJECTFILTER_KEY) || 'null')
    if (Array.isArray(raw?.selected)) return new Set(raw.selected)
  } catch { /* private mode */ }
  return new Set()
}

const ONBOARDING_KEY = 'meta-os.onboarding.v1'
function loadOnboarding() {
  try {
    return { dismissed: false, ...(JSON.parse(localStorage.getItem(ONBOARDING_KEY) || 'null') || {}) }
  } catch {
    return { dismissed: false }
  }
}
const Grid = WidthProvider(GridLayout)
export default function App() {
  const [data, setData] = useState({})
  const [error, setError] = useState(null)
  const [apiHashMismatch, setApiHashMismatch] = useState(null)
  const [{ layouts, activeId }, setState] = useState(loadTabs)
  const [selectedProjects, setSelectedProjects] = useState(loadProjectFilter)
  const [itemsFocus, setItemsFocus] = useState(null)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [onboarding, setOnboarding] = useState(loadOnboarding)
  const [showGridAnyway, setShowGridAnyway] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const auth = useAuth()
  const userKey = auth?.user?.sub || auth?.user?.email || 'local'
  const serverReady = useRef(false)

  const refresh = () =>
    Promise.all(FEEDS.map((f) => apiFetch(`/api/${f}`).then((r) => r.json()).then((d) => [f, d])))
      .then((pairs) => setData(Object.fromEntries(pairs)))
      .catch((e) => setError(String(e)))

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, prefs.refreshSec * 1000)
    return () => clearInterval(t)
  }, [prefs.refreshSec])

  // MOS-146: not a widget feed, not polled — this build's own expectation (baked in at
  // Vite startup, see vite.config.js) checked against whatever backend it happens to be
  // talking to, once. A live backend can outlive the frontend that connected to it (this
  // is the exact drift scripts/dev.mjs's reuse check also guards against, from the other
  // direction), so a mismatch here is a real signal, not noise.
  useEffect(() => {
    if (isStatic) return // no live backend to check in a pre-built snapshot
    apiFetch('/api/version')
      .then((r) => r.json())
      .then((v) => {
        const expected = import.meta.env.VITE_EXPECTED_API_HASH
        if (expected && v.sourceHash && v.sourceHash !== expected) {
          setApiHashMismatch({ server: v.sourceHash, expected })
        }
      })
      .catch(() => {}) // the FEEDS refresh above already surfaces a dead backend
  }, [])

  useEffect(() => {
    const el = document.documentElement
    // `theme` is the light/dark axis, `palette` the colour scheme — orthogonal, so
    // every theme keeps working under System/Dark/Light.
    if (prefs.theme === 'system') delete el.dataset.theme
    else el.dataset.theme = prefs.theme
    el.dataset.palette = prefs.palette ?? 'graphite'
  }, [prefs.theme, prefs.palette])

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      /* storage disabled */
    }
  }, [prefs])

  useEffect(() => {
    try {
      localStorage.setItem(ONBOARDING_KEY, JSON.stringify(onboarding))
    } catch {
      /* storage disabled */
    }
  }, [onboarding])

  // Load this user's tab arrangements from the server (source of truth when reachable). Falls
  // back to the localStorage-seeded state on empty/unreachable. Re-runs per user.
  useEffect(() => {
    let cancelled = false
    serverReady.current = false
    apiFetch(`/api/boards?user=${encodeURIComponent(userKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (cancelled) return
        const saved = fromServerDoc(res?.doc)
        if (saved) setState(saved)
        serverReady.current = true
      })
      .catch(() => { serverReady.current = true })
    return () => { cancelled = true }
  }, [userKey])

  // Persist: localStorage always (offline cache), server debounced once it's ready.
  useEffect(() => {
    storeTabs({ layouts, activeId })
    if (!serverReady.current || isStatic) return
    const t = setTimeout(() => {
      fetch(`/api/boards?user=${encodeURIComponent(userKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toServerDoc({ layouts, activeId })),
      }).catch(() => {})
    }, 600)
    return () => clearTimeout(t)
  }, [layouts, activeId, userKey])

  const tabs = tabsFor(WIDGETS)
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]
  const activeLayout = reconcile(layouts[active.id], active.ids, SIZES)
  const showTab = (id) => setState((s) => ({ ...s, activeId: id }))

  const onLayoutChange = (next) =>
    setState((s) => ({ ...s, layouts: { ...s.layouts, [active.id]: withFloors(next, SIZES) } }))
  // Forget this tab's arrangement: it is re-flowed from the catalogue sizes.
  const resetActive = () =>
    setState((s) => {
      const { [active.id]: _dropped, ...rest } = s.layouts
      return { ...s, layouts: rest }
    })

  // A report tile was clicked: hand Work Items the preset and switch to its tab. A preset
  // with `selectProject` also moves the global project filter to its `spaces` (and stores
  // it, like a click on the filter bar), so the table behind the opened item is that
  // project's, not whatever was selected before. When the selection really changes, the
  // preset is handed over one tick later: Work Items reloads its table (and closes any
  // open item) when the filter changes, so an item opened in the same render would be
  // wiped by that reload.
  const focusItems = (preset) => {
    const handOver = () => setItemsFocus({ ...preset, n: Date.now() })
    const wanted = preset.selectProject ? preset.spaces ?? [] : []
    const changes = wanted.length > 0
      && (wanted.length !== selectedProjects.size || wanted.some((s) => !selectedProjects.has(s)))
    if (changes) {
      const next = new Set(wanted)
      setSelectedProjects(next)
      try { localStorage.setItem(PROJECTFILTER_KEY, JSON.stringify({ selected: [...next] })) } catch { /* private mode */ }
      setTimeout(handOver, 0)
    } else {
      handOver()
    }
    const home = tabs.find((t) => t.ids.includes('work-items'))
    if (home && home.id !== active.id) showTab(home.id)
  }
  useEffect(() => {
    if (!itemsFocus) return
    const t = setTimeout(() => document.querySelector('[data-wid="work-items"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    return () => clearTimeout(t)
  }, [itemsFocus])

  // project filter
  const toggleProject = (name) => setSelectedProjects((prev) => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    try { localStorage.setItem(PROJECTFILTER_KEY, JSON.stringify({ selected: [...next] })) } catch { /* private mode */ }
    return next
  })
  const clearProjects = () => {
    setSelectedProjects(new Set())
    try { localStorage.removeItem(PROJECTFILTER_KEY) } catch { /* private mode */ }
  }

  if (error) return <div className="degraded">API unreachable: {error}</div>
  if (!data.meta) return <div className="degraded">loading…</div>

  // First-run onboarding (MOS-19): derived live from feed availability. Auto-hides
  // once nothing is unavailable (complete) or once the user dismisses it (persisted).
  const onb = deriveOnboarding(data)
  const showOnboarding = onb.steps.length > 0 && !onboarding.dismissed
  const suppressGrid = onb.fresh && !onboarding.dismissed && !showGridAnyway

  const visible = WIDGETS.filter((w) => w.group === active.id)
  const projects = projectOptions(data)

  const dens = DENSITY[prefs.density] || DENSITY.comfortable

  return (
    <>
      <Nav open={navOpen} onClose={() => setNavOpen(false)} prefs={prefs} setPrefs={setPrefs} meta={data.meta} auth={auth} packs={data.packs} onboarding={onb} />
      <header>
        <button className="nav-toggle" onClick={() => setNavOpen(true)} title="Settings & navigation" aria-label="Open settings">☰</button>
        <h1>
          meta-os <span className="dim">/</span> {data.meta.instance}
        </h1>
        <span className="dim mono">{data.meta.instanceRoot}</span>
        {isStatic && <span className="static-badge" title="Read-only snapshot — rebuild CI to refresh">static snapshot</span>}
        {!isStatic && data.meta?.source === 'github' && (
          <span className="static-badge" title="Live reads via hosted API + GITHUB_TOKEN">github live</span>
        )}
        {apiHashMismatch && (
          <span
            className="static-badge warn"
            title={`This build expects API sourceHash ${apiHashMismatch.expected}, but the running server reports ${apiHashMismatch.server}. Restart npm run dev to pick up the current server/ source.`}
          >
            backend out of date
          </span>
        )}
        <span className="spacer" />
        <span className="dim hint">drag the header · resize from the edges</span>
        <button className="ghostbtn" onClick={resetActive} title="Re-arrange this tab's widgets at their default sizes">
          Reset layout
        </button>
      </header>

      {projects.length > 0 && (
        <div className="projectbar" role="group" aria-label="Project filter">
          <span className="dim small">projects</span>
          {projects.map((p) => {
            const on = selectedProjects.has(p)
            return (
              <button
                key={p}
                className={'pchip' + (on ? ' on' : '')}
                onClick={() => toggleProject(p)}
                aria-pressed={on}
                title={(on ? 'Remove ' : 'Filter to ') + p.toUpperCase()
                  + ' \u2014 narrows Sprint Lanes, Sprint Summary, Distribution, Activity & Scrum Report'}
              >
                {p.toUpperCase()}
              </button>
            )
          })}
          {selectedProjects.size > 0 && (
            <button className="ghostbtn" onClick={clearProjects} title="Clear the project filter">show all</button>
          )}
        </div>
      )}
      <nav className="tabbar" role="tablist">
        {tabs.map((t) => (
          <div key={t.id} className={'tab' + (t.id === active.id ? ' active' : '')}>
            <button
              className="tab-name"
              role="tab"
              aria-selected={t.id === active.id}
              onClick={() => showTab(t.id)}
              title={t.ids.map((i) => WIDGETS.find((w) => w.i === i)?.title ?? i).join(' · ')}
            >
              {t.name} <span className="tab-n">{t.ids.length}</span>
            </button>
          </div>
        ))}
      </nav>


      {showOnboarding && (
        <div className="ob-wrap">
          <Onboarding model={onb} meta={data.meta} onDismiss={() => setOnboarding((o) => ({ ...o, dismissed: true }))} />
          {suppressGrid && (
            <button className="ghostbtn ob-reveal" onClick={() => setShowGridAnyway(true)}>
              Show dashboard anyway
            </button>
          )}
        </div>
      )}

      {!suppressGrid && (
      <Grid
        key={active.id}
        className="wgrid"
        layout={activeLayout}
        cols={12}
        rowHeight={dens.rowHeight}
        margin={dens.margin}
        containerPadding={[20, 18]}
        draggableHandle=".wgt-head"
        resizeHandles={['se', 'e', 's']}
        onLayoutChange={onLayoutChange}
        compactType="vertical"
      >
        {visible.map((w) => (
          <div key={w.i} className="wgt" data-wid={w.i}>
            <div className="wgt-head">
              <span className="wgt-grip" aria-hidden="true">⠿</span>
              <span className="wgt-title">{w.title}</span>
            </div>
            <div className="wgt-body">{w.render(scopeToProject(data, w.i, selectedProjects), { selectedProjects, itemsFocus, focusItems })}</div>
          </div>
        ))}
      </Grid>
      )}
    </>
  )
}
