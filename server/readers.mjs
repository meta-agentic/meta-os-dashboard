// Read surfaces per meta-os systems/interface-layer.md. The vault is the database:
// everything here parses git-tracked markdown/JSON from the instance root. Every reader
// degrades to { available: false, reason } instead of throwing — degrade visibly.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import YAML from 'yaml'
import { annotateSchedule } from './cron.mjs'
import { sprintMembers } from './backlog-schema.mjs'
import { loadBacklog } from './vault-backlog.mjs'

const run = promisify(execFile)
const unavailable = (reason) => ({ available: false, reason })

// Strip [[target|label]] / [[target]] wikilinks and inline code to plain text.
const plain = (s) =>
  s.replace(/\[\[([^\]|]*\|)?([^\]]+)\]\]/g, '$2').replace(/`([^`]*)`/g, '$1').trim()

export async function ontology(frameworkRoot) {
  try {
    const raw = await fs.readFile(path.join(frameworkRoot, 'systems/ontology.yaml'), 'utf8')
    return { available: true, ...YAML.parse(raw) }
  } catch {
    return unavailable('systems/ontology.yaml not found under frameworkRoot')
  }
}

// Expand ${var} references from instance.config.json `vars` — recursively over strings,
// arrays and objects. Lets a single prefix variable (e.g. a shared repo root) repoint every
// project/backlog path in one shot, instead of hardcoding absolute paths that rot on a move.
// Depth cap: this walks caller-supplied structures, and `registry()` feeds it YAML
// front-matter from vault notes — where an anchor/alias can build a cycle. Unbounded
// recursion turned that into a RangeError that took the whole reader down, so bottom
// out instead and let the rest of the config through.
const MAX_DEPTH = 32

export function expandVars(value, vars = {}, depth = 0) {
  if (typeof value === 'string') {
    // `k in vars` walks the prototype chain, so `${constructor}`, `${toString}` and
    // `${__proto__}` all resolved to inherited members and were interpolated straight
    // into filesystem paths. Only an OWN key is a declared variable; anything else is
    // left literal, exactly as an unknown `${foo}` already was.
    return value.replace(/\$\{(\w+)\}/g, (m, k) => {
      if (!Object.hasOwn(vars, k)) return m
      const v = vars[k]
      // A declared var must be a scalar. Substituting an object yields "[object Object]"
      // inside a path, which is never what the author meant.
      return typeof v === 'string' || typeof v === 'number' ? String(v) : m
    })
  }
  if (depth >= MAX_DEPTH) return value
  if (Array.isArray(value)) return value.map((v) => expandVars(v, vars, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, expandVars(v, vars, depth + 1)]),
    )
  }
  return value
}

export async function registry(instanceRoot, vars = {}) {
  const dir = path.join(instanceRoot, 'projects')
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md') && f !== '_index.md')
    const projects = await Promise.all(
      files.map(async (f) => {
        const { data, content } = matter(await fs.readFile(path.join(dir, f), 'utf8'))
        const purpose = content.match(/\*\*(.+?)\*\*/)?.[1] ?? ''
        return { note: f, purpose: plain(purpose), ...data, path: expandVars(data.path, vars) }
      }),
    )
    return { available: true, projects }
  } catch (e) {
    return unavailable(`projects/ unreadable: ${e.message}`)
  }
}

export async function automations(instanceRoot) {
  try {
    const md = await fs.readFile(path.join(instanceRoot, 'automations/_index.md'), 'utf8')
    const lines = md.split('\n').filter((l) => /^\s*\|/.test(l))
    // Strip wikilinks BEFORE splitting: [[target|label]] carries a pipe of its own.
    const cells = (l) => plain(l).split('|').slice(1, -1).map((c) => c.trim())
    const header = cells(lines[0] ?? '').map((h) => h.toLowerCase())
    const rows = lines
      .slice(2) // skip header + separator
      .map(cells)
      .filter((r) => r.length === header.length)
      .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])))

    // Last run per automation from automations/runs.jsonl (see ontology `automations:`).
    // Absent log → every row reports lastRun: null; the UI renders "never".
    let log = []
    try {
      const jsonl = await fs.readFile(path.join(instanceRoot, 'automations/runs.jsonl'), 'utf8')
      log = jsonl.split('\n').filter(Boolean).flatMap((l) => {
        try { return [JSON.parse(l)] } catch { return [] }
      })
    } catch { /* no run log yet — degrade */ }
    const lastByName = new Map()
    for (const e of log) {
      const prev = lastByName.get(e.automation)
      if (!prev || e.ts > prev.ts) lastByName.set(e.automation, e)
    }
    for (const r of rows) {
      const last = lastByName.get(r.automation) ?? null
      r.lastRun = last && { ts: last.ts, outcome: last.outcome ?? null }
    }

    // Upcoming runs over the next 48h + the overdue/never verdict, derived from the
    // cadence column (cron or @nickname per the ontology contract). Event-driven rows
    // ("—") have no schedule; an unparseable cadence degrades to its reason instead of
    // a guessed time.
    const schedule = annotateSchedule(rows, new Date())
    return { available: true, rows, runLog: log.length > 0, schedule }
  } catch (e) {
    return unavailable(`automations/_index.md unreadable: ${e.message}`)
  }
}

async function mdFiles(dir) {
  const out = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== '_index.md') {
      const full = path.join(entry.parentPath ?? entry.path, entry.name)
      out.push({ file: path.relative(dir, full), mtime: (await fs.stat(full)).mtimeMs })
    }
  }
  return out
}

// 24h high-water mark per stage, from samples the server records as it observes counts.
// Sampled (not derived from git) because unpromoted raw notes are often uncommitted.
// Lives in a gitignored cache — derived observability state, not vault data.
const SAMPLES_FILE = new URL('../.cache/memory-samples.json', import.meta.url).pathname

async function sampleCounts(counts) {
  let samples = []
  try { samples = JSON.parse(await fs.readFile(SAMPLES_FILE, 'utf8')) } catch { /* first run */ }
  const now = Date.now()
  samples = samples.filter((s) => now - s.ts < 864e5)
  const last = samples.at(-1)
  if (!last || ['raw', 'wiki', 'output'].some((k) => last[k] !== counts[k])) {
    samples.push({ ts: now, ...counts })
    await fs.mkdir(path.dirname(SAMPLES_FILE), { recursive: true })
    await fs.writeFile(SAMPLES_FILE, JSON.stringify(samples))
  }
  return samples
}

const TIERS = ['raw', 'wiki', 'output']
const LAYOUTS = ['flat', 'tier/project', 'project/tier']

// Count .md notes under a directory, degrading to [] when the dir is absent or
// unreadable — a missing tier is a zero, never a throw.
async function safeNotes(dir) {
  try { return await mdFiles(dir) } catch { return [] }
}

// A federated/navigation mount's note count (recursive .md walk over the realpath —
// symlinked mounts must be resolved; recursive readdir does not descend into links).
async function mountRow(name, absPath) {
  try {
    const target = await fs.realpath(absPath)
    if (!(await fs.stat(target)).isDirectory()) return null
    const notes = await mdFiles(target)
    return { name, notes: notes.length, newest: notes.length ? Math.max(...notes.map((n) => n.mtime)) : null }
  } catch {
    return null // broken symlink / unreadable — caller reports as skipped
  }
}

// Enumerate one canon root per its declared layout. Returns per-tier note lists
// (canon — feeds the pipeline stages) and per-project rows (context — feeds the
// federated.vaults breakdown). A project-partitioned layout contributes to both:
// its tier totals into stages, its projects into the vault rows.
async function enumerateRoot(absPath, layout) {
  const tiers = { raw: [], wiki: [], output: [] }
  const projects = new Map() // name -> { notes, newest }
  const addProject = (name, notes) => {
    const p = projects.get(name) ?? { notes: 0, newest: null }
    p.notes += notes.length
    const n = notes.length ? Math.max(...notes.map((x) => x.mtime)) : null
    if (n && (p.newest === null || n > p.newest)) p.newest = n
    projects.set(name, p)
  }
  // Child directory names, following symlinks — a project can legitimately be a
  // symlink to its own repo (the "centralize a mix" topology), and Dirent.isDirectory()
  // is false for a symlink, so stat the resolved target. A broken symlink is skipped.
  const subdirs = async (dir) => {
    let entries
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return [] }
    const out = []
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      if (e.isDirectory()) { out.push(e.name); continue }
      if (e.isSymbolicLink()) {
        try { if ((await fs.stat(path.join(dir, e.name))).isDirectory()) out.push(e.name) } catch { /* broken symlink — skip */ }
      }
    }
    return out
  }

  if (layout === 'flat') {
    for (const tier of TIERS) tiers[tier] = await safeNotes(path.join(absPath, tier))
  } else if (layout === 'tier/project') {
    for (const tier of TIERS) {
      for (const proj of await subdirs(path.join(absPath, tier))) {
        const notes = await safeNotes(path.join(absPath, tier, proj))
        tiers[tier].push(...notes)
        addProject(proj, notes)
      }
    }
  } else { // project/tier
    for (const proj of await subdirs(absPath)) {
      const projNotes = []
      for (const tier of TIERS) {
        const notes = await safeNotes(path.join(absPath, proj, tier))
        tiers[tier].push(...notes)
        projNotes.push(...notes)
      }
      addProject(proj, projNotes)
    }
  }
  return { tiers, projects }
}

// Assemble stages (with sampled 24h capacity) from aggregated per-tier note lists.
async function stagesFrom(tierNotes) {
  const stages = {}
  for (const tier of TIERS) {
    const notes = tierNotes[tier].slice().sort((a, b) => a.mtime - b.mtime)
    stages[tier] = { count: notes.length, oldest: notes[0] ?? null, newest: notes.at(-1) ?? null }
  }
  const counts = Object.fromEntries(TIERS.map((t) => [t, stages[t].count]))
  const samples = await sampleCounts(counts)
  for (const tier of TIERS) {
    stages[tier].capacity = Math.max(stages[tier].count, ...samples.map((s) => s[tier] ?? 0))
  }
  return stages
}

const federatedBlock = (vaults) => {
  vaults.sort((a, b) => b.notes - a.notes)
  return {
    vaults,
    total: vaults.reduce((a, v) => a + v.notes, 0),
    newest: vaults.reduce((m, v) => Math.max(m, v.newest ?? 0), 0) || null,
  }
}

// Default topology (no `memory` config): the instance's own memory/{raw,wiki,output}
// is the sole canon root and vaults/* are federated mounts. Kept byte-for-byte
// identical to the prior behaviour so upgrading without a `memory` block is a
// no-op for every existing adopter.
async function legacyMemory(instanceRoot) {
  const tierNotes = { raw: [], wiki: [], output: [] }
  for (const tier of TIERS) tierNotes[tier] = await mdFiles(path.join(instanceRoot, 'memory', tier))
  const stages = await stagesFrom(tierNotes)

  const vaults = []
  try {
    const dir = path.join(instanceRoot, 'vaults')
    for (const name of await fs.readdir(dir)) {
      if (name.startsWith('.')) continue // tooling dirs (.claude-flow, …) aren't project memory
      const row = await mountRow(name, path.join(dir, name))
      if (row) vaults.push(row)
    }
  } catch { /* no vaults/ folder — fine */ }
  return { available: true, stages, federated: federatedBlock(vaults) }
}

// Configured topology: canon `roots[]` (each {label, path, layout}) feed the
// pipeline stages; `federated[]` mounts are navigation context. Per-project rows from
// partitioned roots and the federated mounts share the existing federated.vaults shape,
// so the Memory / Memory Flux widgets need zero changes. Broken paths skip-and-report
// via the additive `topology` diagnostics; existing keys keep their shape.
async function configuredMemory(memoryConfig, vars, instanceRoot) {
  const roots = (memoryConfig.roots ?? []).map((r) => ({ ...r, path: expandVars(r.path, vars) }))
  const mounts = (memoryConfig.federated ?? []).map((f) => ({ ...f, path: expandVars(f.path, vars) }))
  const skipped = []
  const rootReport = []
  const tierNotes = { raw: [], wiki: [], output: [] }
  const projectRows = new Map() // name -> { notes, newest }

  for (const [i, r] of roots.entries()) {
    const label = r.label ?? `root[${i}]`
    const layout = r.layout ?? 'flat'
    if (!LAYOUTS.includes(layout)) {
      skipped.push({ label, path: r.path, reason: `unknown layout "${layout}" (expected ${LAYOUTS.join(' | ')})` })
      continue
    }
    let isDir = false
    try { isDir = (await fs.stat(r.path)).isDirectory() } catch { /* missing */ }
    if (!isDir) {
      skipped.push({ label, path: r.path, reason: 'root path missing or not a directory' })
      continue
    }
    const { tiers, projects } = await enumerateRoot(r.path, layout)
    for (const tier of TIERS) tierNotes[tier].push(...tiers[tier])
    for (const [name, p] of projects) {
      const cur = projectRows.get(name) ?? { notes: 0, newest: null }
      cur.notes += p.notes
      if (p.newest && (cur.newest === null || p.newest > cur.newest)) cur.newest = p.newest
      projectRows.set(name, cur)
    }
    rootReport.push({ label, layout, notes: TIERS.reduce((a, t) => a + tiers[t].length, 0) })
  }

  const stages = await stagesFrom(tierNotes)

  // Per-project canon rows + federated mounts share the vault-row namespace, keyed by
  // name. A project can surface from a partitioned canon root and a like-named federated
  // mount (e.g. a stray estate scaffold folder alongside the project's own doc-repo);
  // merge by name (sum notes, max newest) so the widget never renders a duplicate chip.
  const byName = new Map(projectRows)
  const mergeRow = (name, notes, newest) => {
    const cur = byName.get(name) ?? { notes: 0, newest: null }
    cur.notes += notes
    if (newest && (cur.newest === null || newest > cur.newest)) cur.newest = newest
    byName.set(name, cur)
  }
  const mountReport = []
  for (const [i, f] of mounts.entries()) {
    const label = f.label ?? `federated[${i}]`
    const row = await mountRow(label, f.path)
    if (row) { mergeRow(label, row.notes, row.newest); mountReport.push({ label, notes: row.notes }) }
    else skipped.push({ label, path: f.path, reason: 'federated mount missing, not a directory, or a broken symlink' })
  }
  const vaults = [...byName].map(([name, p]) => ({ name, notes: p.notes, newest: p.newest }))

  return {
    available: true,
    stages,
    federated: federatedBlock(vaults),
    topology: { roots: rootReport, federated: mountReport, skipped },
  }
}

// `memoryConfig` is the optional instance.config.json `memory` block ({ roots[],
// federated[] }); absent it, the instance falls back to the default single-root
// topology. `vars` drives ${...} expansion in configured paths, exactly as for backlogs.
export async function memory(instanceRoot, memoryConfig = null, vars = {}) {
  try {
    if (memoryConfig && Array.isArray(memoryConfig.roots)) {
      return await configuredMemory(memoryConfig, vars, instanceRoot)
    }
    return await legacyMemory(instanceRoot)
  } catch (e) {
    return unavailable(`memory/ unreadable: ${e.message}`)
  }
}

export async function activity(instanceRoot, limit = 15) {
  try {
    const { stdout } = await run('git', [
      '-C', instanceRoot, 'log', `-${limit}`, '--date=iso-strict',
      '--pretty=format:%h%x09%ad%x09%s',
    ])
    const commits = stdout.split('\n').filter(Boolean).map((l) => {
      const [hash, date, ...s] = l.split('\t')
      return { hash, date, subject: s.join('\t') }
    })
    return { available: true, commits }
  } catch {
    return unavailable('instance root is not a git repository (or git log failed)')
  }
}

// Output inbox: finished deliverables in memory/output/ plus recent promotions into
// memory/wiki/ — the vault is the database, the inbox is just a view over it.
// Timestamps come from the instance git history (file-add dates); uncommitted files
// fall back to mtime and say so. A project's `output:` registry field (ontology) says
// where it delivers when NOT here — the widget links the two views together.
export async function outputs(instanceRoot, promotionWindowDays = 30) {
  try {
    // file → first-seen add date, newest history first so the latest add wins.
    const added = new Map()
    let gitOk = true
    try {
      const { stdout } = await run('git', [
        '-C', instanceRoot, 'log', '--diff-filter=A', '--date=iso-strict',
        '--pretty=format:\x01%ad', '--name-only', '--', 'memory/output', 'memory/wiki',
      ])
      let date = null
      for (const line of stdout.split('\n')) {
        if (line.startsWith('\x01')) date = line.slice(1)
        else if (line && date && !added.has(line)) added.set(line, date)
      }
    } catch {
      gitOk = false
    }

    const collect = async (stage) => {
      const dir = path.join(instanceRoot, 'memory', stage)
      const items = []
      for (const f of await mdFiles(dir)) {
        const rel = path.posix.join('memory', stage, f.file.split(path.sep).join('/'))
        let fm = {}
        try {
          fm = matter(await fs.readFile(path.join(dir, f.file), 'utf8')).data
        } catch { /* unreadable front-matter — still list the file */ }
        const ts = added.get(rel) ?? new Date(f.mtime).toISOString()
        items.push({
          file: f.file, stage, ts, committed: added.has(rel),
          type: fm.type ?? null, tags: fm.tags ?? [],
          project: (fm.tags ?? []).find((t) => String(t).startsWith('project/'))?.slice(8) ?? null,
        })
      }
      return items
    }

    const outputItems = await collect('output')
    const cutoff = Date.now() - promotionWindowDays * 864e5
    const promotions = (await collect('wiki')).filter((i) => new Date(i.ts).getTime() >= cutoff)
    const items = [...outputItems, ...promotions.map((p) => ({ ...p, promotion: true }))]
      .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    return {
      available: true, items, promotionWindowDays,
      counts: { output: outputItems.length, promotions: promotions.length },
      datesBasis: gitOk ? 'git add-dates; mtime for uncommitted files' : 'mtime only — instance is not a git repository',
    }
  } catch (e) {
    return unavailable(`memory/ unreadable: ${e.message}`)
  }
}

// Turn a git remote URL into a browsable commit-URL prefix, accepting both remote
// spellings (scp-like `git@host:owner/repo` and `https://host/owner/repo`) and
// stripping any embedded credentials. `/commit/<sha>` is the route GitHub, GitLab,
// Gitea and Forgejo share — including self-hosted installs, which is why the host
// isn't whitelisted; Bitbucket is the one exception. A remote that doesn't parse
// returns null and its commits render unlinked, never as a guessed URL.
const COMMIT_PATH = { 'bitbucket.org': 'commits' }
export function commitUrlBase(remote) {
  const m = String(remote).trim().replace(/\.git$/, '')
    .match(/^(?:(?:git|ssh|https?):\/\/)?(?:[^@/\s]+@)?([^:/\s]+\.[^:/\s]+)[:/](\S+)$/)
  if (!m) return null
  const [, host, repo] = m
  return `https://${host}/${repo}/${COMMIT_PATH[host] ?? 'commit'}/`
}

// Unified event timeline: vault commits + automation runs + backlog sprint
// transitions, normalized to { ts, source, actor, action, target, note? }. Composes
// only feeds that already exist — per-story transition events wait for the tracker
// changelog (the mirror carries no per-story timestamps). Each source degrades
// independently; a dead source is reported, not silently absent.
export async function events(instanceRoot, backlogs, limit = 40) {
  const out = []
  const sources = []

  try {
    const { stdout } = await run('git', [
      '-C', instanceRoot, 'log', `-${limit}`, '--date=iso-strict',
      '--pretty=format:%h%x09%ad%x09%an%x09%s',
    ])
    // Commit hashes link out to the forge when the instance has a recognisable
    // remote; a remote-less repo just keeps them as plain text.
    let base = null
    try {
      const { stdout: remote } = await run('git', ['-C', instanceRoot, 'remote', 'get-url', 'origin'])
      base = commitUrlBase(remote)
    } catch { /* no origin remote — commits stay unlinked */ }
    for (const l of stdout.split('\n').filter(Boolean)) {
      const [hash, date, author, ...s] = l.split('\t')
      out.push({
        ts: date, source: 'vault', actor: author, action: 'commit',
        target: s.join('\t'), note: hash, ...(base ? { url: base + hash } : {}),
      })
    }
    sources.push({ name: 'vault', available: true })
  } catch {
    sources.push({ name: 'vault', available: false, reason: 'instance root is not a git repository' })
  }

  try {
    const jsonl = await fs.readFile(path.join(instanceRoot, 'automations/runs.jsonl'), 'utf8')
    for (const l of jsonl.split('\n').filter(Boolean)) {
      try {
        const e = JSON.parse(l)
        out.push({
          ts: e.ts, source: 'automations', actor: e.automation,
          action: `run ${e.outcome ?? '?'}`, target: e.note ?? '',
        })
      } catch { /* malformed line — skip */ }
    }
    sources.push({ name: 'automations', available: true })
  } catch {
    sources.push({ name: 'automations', available: false, reason: 'no automations/runs.jsonl yet' })
  }

  // Framework-hook events: automations/events.jsonl, one JSON object per line
  // { ts, actor, action, target, note? } (see ontology `events`). Same degrade
  // contract as runs.jsonl: a missing file reports the source unavailable; a
  // malformed line is skipped, and an entry with no ts can't be placed on the
  // timeline so it is dropped rather than sorted as an invalid date.
  try {
    const jsonl = await fs.readFile(path.join(instanceRoot, 'automations/events.jsonl'), 'utf8')
    for (const l of jsonl.split('\n').filter(Boolean)) {
      try {
        const e = JSON.parse(l)
        if (!e.ts) continue
        out.push({
          ts: e.ts, source: 'events', actor: e.actor ?? '', action: e.action ?? '',
          target: e.target ?? '', ...(e.note ? { note: e.note } : {}),
        })
      } catch { /* malformed line — skip */ }
    }
    sources.push({ name: 'events', available: true })
  } catch {
    sources.push({ name: 'events', available: false, reason: 'no automations/events.jsonl yet' })
  }

  // Sprint open/close from the backlog mirrors. Closed sprints report their delivered
  // count (stories DONE linked to the sprint) — sprint-close accounting, the only
  // timestamps the mirror has. Future/planned sprints emit nothing.
  const now = Date.now()
  for (const b of backlogs ?? []) {
    const space = b.space
    try {
      const d = await loadBacklog(b)
      const doneBySprint = new Map()
      for (const s of d.stories) {
        if (s.status !== 'DONE') continue
        for (const sid of sprintMembers(s)) doneBySprint.set(sid, (doneBySprint.get(sid) ?? 0) + 1)
      }
      for (const s of d.sprints) {
        const started = s.start && new Date(s.start).getTime() <= now
        if (started && ['IN PROGRESS', 'CLOSED'].includes(s.status))
          out.push({ ts: s.start, source: 'backlog', actor: space, action: 'sprint started', target: s.name ?? s.id })
        if (s.status === 'CLOSED' && s.end)
          out.push({
            ts: s.end, source: 'backlog', actor: space, action: 'sprint closed',
            target: s.name ?? s.id, note: `${doneBySprint.get(s.id) ?? 0} delivered`,
          })
      }
      sources.push({ name: `backlog:${space}`, available: true })
    } catch (e) {
      sources.push({ name: `backlog:${space}`, available: false, reason: `backlog unreadable: ${e.message}` })
    }
  }

  out.sort((a, b) => new Date(b.ts) - new Date(a.ts))
  return { available: true, events: out.slice(0, limit), sources }
}

// Lane derivation per ontology flow: group active-sprint stories by their `project`
// field (the swarm-harness rule: a lane is a distinct codebase/service). Forecast is
// velocity-based from closed sprints; the backlog mirror has no per-story transition
// timestamps, so cycle-time is reported unavailable rather than faked.
// Every status the vault can hold must map, or the item vanishes from flow entirely.
// REFINED is the normal state of freshly-planned work, so omitting it made a just-opened
// sprint render as "no active sprint" — the space looked stuck rather than ready.
export const STATE = {
  'TO DO': 'todo', PLANNED: 'todo', REFINED: 'todo',
  'IN PROGRESS': 'in-progress', 'IN REVIEW': 'in-progress',
  DONE: 'done',
}

export async function lanes(backlogs) {
  if (!backlogs?.length) return unavailable('no backlogs configured in instance.config.json')
  const spaces = []
  for (const b of backlogs) {
    const space = b.space
    try {
      const d = await loadBacklog(b)
      const active = d.sprints.filter((s) => s.status === 'IN PROGRESS')
      // No sprint IN PROGRESS: fall back to the most recently CLOSED one so the
      // widget still has something to render instead of going blank. `sprintActive`
      // tells the client which case it is so it can label the row as closed.
      const closedSprints = d.sprints
        .filter((s) => s.status === 'CLOSED' && s.start && s.end)
        .sort((a, b) => a.end.localeCompare(b.end))
      const lastClosed = closedSprints.at(-1)
      const target = active.length ? active : lastClosed ? [lastClosed] : []
      const sprintActive = active.length > 0

      const targetIds = new Set(target.map((s) => s.id))
      // Membership is linked from both sides (story.sprint and the sprint file's
      // committed[]), and a sprint often only has the latter — union them.
      const targetIssues = new Set(target.flatMap((s) => s.issues))
      const inSprint = d.stories.filter(
        (s) => sprintMembers(s).some((id) => targetIds.has(id)) || targetIssues.has(s.id),
      )

      // Blocked is DERIVED (ontology flow.item_states): a not-done story whose
      // `dependencies` include a story the mirror knows and that isn't DONE yet.
      // Unknown dependency ids don't count — no guessing. Blocked AGE stays
      // unavailable: the mirror has no transition timestamps (same reason as
      // cycle-time below).
      const statusById = new Map(d.stories.map((s) => [s.id, s.status]))
      const blockedBy = (s) =>
        s.dependencies.filter((id) => statusById.has(id) && statusById.get(id) !== 'DONE')

      const byLane = new Map()
      for (const s of inSprint) {
        const state = STATE[s.status]
        if (!state) continue // NO GO etc. — out of flow
        const key = s.project ?? 'unassigned' // no project field → still in flow, own lane
        const lane = byLane.get(key) ?? { lane: key, queues: { todo: [], 'in-progress': [], done: [] } }
        const blockers = state === 'done' ? [] : blockedBy(s)
        lane.queues[state].push({
          id: s.id, title: s.title, points: s.storyPoints ?? null, epic: s.epic ?? null,
          blockedBy: blockers.length ? blockers : null,
        })
        byLane.set(key, lane)
      }
      const pts = (q) => q.reduce((acc, i) => acc + (i.points ?? 0), 0)
      const laneRows = [...byLane.values()].map((l) => ({
        ...l,
        wip: l.queues['in-progress'].length,
        depth: l.queues.todo.length,
        done: l.queues.done.length,
        blocked: [...l.queues.todo, ...l.queues['in-progress']].filter((i) => i.blockedBy).length,
        points: { todo: pts(l.queues.todo), wip: pts(l.queues['in-progress']), done: pts(l.queues.done) },
      })).sort((a, b) => b.wip + b.depth - (a.wip + a.depth))

      // Velocity: done stories per week over closed sprints that have dates.
      const closed = closedSprints
      const doneBySprint = new Map()
      for (const s of d.stories) {
        if (s.status !== 'DONE') continue
        for (const sid of sprintMembers(s)) doneBySprint.set(sid, (doneBySprint.get(sid) ?? 0) + 1)
      }
      let throughput = null
      if (closed.length) {
        const weeks = closed.reduce((acc, s) => acc + Math.max((new Date(s.end) - new Date(s.start)) / 6048e5, 0.1), 0)
        const total = closed.reduce((acc, s) => acc + (doneBySprint.get(s.id) ?? 0), 0)
        throughput = total / weeks
      }

      // Acceleration: last closed sprint's velocity vs the MEDIAN of the (up to) 3
      // sprints before it — median damps one-off hot/cold sprints that a last-two
      // comparison would amplify. Needs 2+ closed sprints and a nonzero baseline.
      const perSprint = closed
        .map((s) => ({
          id: s.id,
          end: s.end,
          velocity: (doneBySprint.get(s.id) ?? 0) / Math.max((new Date(s.end) - new Date(s.start)) / 6048e5, 0.1),
        }))
        .sort((a, b) => a.end.localeCompare(b.end))
      const last = perSprint.at(-1)
      const window = perSprint.slice(-4, -1)
      const median = (xs) => {
        const v = xs.map((s) => s.velocity).sort((a, b) => a - b)
        return v.length ? (v[Math.floor((v.length - 1) / 2)] + v[Math.ceil((v.length - 1) / 2)]) / 2 : 0
      }
      const baseline = median(window)
      const acceleration =
        window.length >= 1 && baseline > 0
          ? {
              pct: +(((last.velocity - baseline) / baseline) * 100).toFixed(0),
              last: { id: last.id, velocity: +last.velocity.toFixed(1) },
              baseline: { velocity: +baseline.toFixed(1), sprints: window.map((s) => s.id) },
            }
          : null
      const remaining = laneRows.reduce((acc, l) => acc + l.depth + l.wip, 0)
      spaces.push({
        space,
        sprint: target.map((s) => ({ id: s.id, name: s.name, start: s.start, end: s.end })),
        sprintActive,
        lanes: laneRows,
        forecast: {
          throughputPerWeek: throughput ? +throughput.toFixed(1) : null,
          acceleration,
          etaWeeks: throughput && remaining ? +(remaining / throughput).toFixed(1) : null,
          basis: `velocity over ${closed.length} closed sprints`,
          cycleTime: null,
          cycleTimeReason: 'backlog mirror carries no per-story transition timestamps (authority: tracker changelog)',
        },
      })
    } catch (e) {
      spaces.push({ space, available: false, reason: `backlog unreadable: ${e.message}` })
    }
  }
  return { available: true, spaces }
}
