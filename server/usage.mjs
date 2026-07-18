// Engine usage — reads the engine's local session logs (claudeHome/projects/*/*.jsonl,
// one JSON object per line; assistant lines carry message.usage + message.model).
// Read-only and local-only: session logs are instance content and never leave this
// machine. Tokens are reported as recorded; cost is NOT estimated — the logs carry no
// price and hardcoded price tables rot. Per-file aggregates are cached by mtime so
// polling stays cheap even with large logs.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const WINDOW_DAYS = 30
const fileCache = new Map() // file → { mtimeMs, agg }

async function aggregateFile(file, mtimeMs) {
  const hit = fileCache.get(file)
  if (hit && hit.mtimeMs === mtimeMs) return { agg: hit.agg, session: hit.session }
  // day → model → counters (tokens only; a "turn" = one usage-bearing line)
  const agg = new Map()
  // File-level roll-up: one .jsonl is one engine session, so its totals + first/last
  // timestamps give a per-session row for the distribution/scatter widgets.
  const session = { out: 0, in: 0, cacheRead: 0, cacheWrite: 0, turns: 0, first: null, last: null }
  const text = await fs.readFile(file, 'utf8')
  for (const line of text.split('\n')) {
    if (!line) continue
    let e
    try { e = JSON.parse(line) } catch { continue }
    const u = e.message?.usage
    const model = e.message?.model
    if (!u || !model || model === '<synthetic>' || !e.timestamp) continue
    const day = e.timestamp.slice(0, 10)
    const byModel = agg.get(day) ?? new Map()
    const c = byModel.get(model) ?? { in: 0, out: 0, cacheRead: 0, cacheWrite: 0, turns: 0 }
    const din = u.input_tokens ?? 0, dout = u.output_tokens ?? 0
    const dcr = u.cache_read_input_tokens ?? 0, dcw = u.cache_creation_input_tokens ?? 0
    c.in += din; c.out += dout; c.cacheRead += dcr; c.cacheWrite += dcw; c.turns += 1
    byModel.set(model, c)
    agg.set(day, byModel)
    session.in += din; session.out += dout; session.cacheRead += dcr; session.cacheWrite += dcw; session.turns += 1
    const ts = Date.parse(e.timestamp)
    if (Number.isFinite(ts)) {
      if (session.first === null || ts < session.first) session.first = ts
      if (session.last === null || ts > session.last) session.last = ts
    }
  }
  fileCache.set(file, { mtimeMs, agg, session })
  return { agg, session }
}

// Map an engine project slug (path with / → -) back to a registry project by its
// `path` front-matter; unmatched slugs keep a shortened slug tail.
function slugLabel(slug, projects) {
  for (const p of projects ?? []) {
    if (p.path && slug === String(p.path).replaceAll('/', '-')) return p.name ?? slug
  }
  const parts = slug.split('-').filter(Boolean)
  return parts.slice(-2).join('/') || slug
}

export async function usage(claudeHome, projects) {
  const home = claudeHome ?? path.join(os.homedir(), '.claude')
  const root = path.join(home, 'projects')
  let slugs
  try {
    slugs = (await fs.readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory())
  } catch {
    return {
      available: false,
      reason: `no engine session logs at ${root} — set "claudeHome" in instance.config.json`,
    }
  }

  const cutoff = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString().slice(0, 10)
  const byDay = new Map() // day → model → counters
  const byProject = new Map() // label → out-tokens + turns
  const sessionList = [] // one row per session file (for distribution + scatter)
  let sessions = 0
  for (const d of slugs) {
    const dir = path.join(root, d.name)
    const label = slugLabel(d.name, projects)
    for (const f of await fs.readdir(dir)) {
      if (!f.endsWith('.jsonl')) continue
      const full = path.join(dir, f)
      let st
      try { st = await fs.stat(full) } catch { continue }
      const { agg, session } = await aggregateFile(full, st.mtimeMs)
      let touched = false
      let lastDay = ''
      for (const [day, models] of agg) {
        if (day < cutoff) continue
        touched = true
        if (day > lastDay) lastDay = day
        const dm = byDay.get(day) ?? new Map()
        for (const [model, c] of models) {
          const t = dm.get(model) ?? { in: 0, out: 0, cacheRead: 0, cacheWrite: 0, turns: 0 }
          for (const k of Object.keys(c)) t[k] += c[k]
          dm.set(model, t)
          const p = byProject.get(label) ?? { out: 0, turns: 0 }
          p.out += c.out
          p.turns += c.turns
          byProject.set(label, p)
        }
        byDay.set(day, dm)
      }
      if (touched) {
        sessions += 1
        sessionList.push({
          project: label,
          day: lastDay,
          out: session.out,
          in: session.in,
          cacheRead: session.cacheRead,
          cacheWrite: session.cacheWrite,
          turns: session.turns,
          durationMs: session.first !== null && session.last !== null ? session.last - session.first : 0,
        })
      }
    }
  }
  // Keep the heaviest sessions — the strip/scatter care about the spend distribution,
  // and a long tail of tiny sessions would just crowd the axis near zero.
  sessionList.sort((a, b) => b.out - a.out)

  const days = [...byDay.entries()]
    .map(([day, models]) => ({
      day,
      models: Object.fromEntries(models),
      out: [...models.values()].reduce((a, c) => a + c.out, 0),
    }))
    .sort((a, b) => a.day.localeCompare(b.day))
  const models = {}
  for (const { models: dm } of days)
    for (const [model, c] of Object.entries(dm)) {
      const t = (models[model] ??= { in: 0, out: 0, cacheRead: 0, cacheWrite: 0, turns: 0 })
      for (const k of Object.keys(c)) t[k] += c[k]
    }
  const totals = Object.values(models).reduce(
    (a, c) => ({ in: a.in + c.in, out: a.out + c.out, cacheRead: a.cacheRead + c.cacheRead, cacheWrite: a.cacheWrite + c.cacheWrite }),
    { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
  )
  return {
    available: true,
    windowDays: WINDOW_DAYS,
    sessions,
    totals,
    models,
    days,
    projects: [...byProject.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.out - a.out)
      .slice(0, 8),
    sessionList: sessionList.slice(0, 80),
    cost: null,
    costReason: 'session logs carry no cost field; prices are not estimated in code',
  }
}
