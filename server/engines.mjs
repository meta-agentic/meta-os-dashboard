// meta-cli engines (MOS-148): which agent engines meta-cli can reach from this machine,
// what the PO has declared about each one's plan, and how much work has already gone
// through `meta` runs. Opt-in: nothing runs unless `metaCli.enabled` is true.
//
// Read-only and local-only. Subscription plans cannot be observed from a CLI, so
// `plan` is echoed back as declared config and never presented as a detection.
// Detection is `meta which` (the adapter's own view of CLI + ACP availability) plus
// an Ollama probe, since meta-cli has no ollama adapter yet (MOS-147 scope).
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const WINDOW_DAYS = 30
const WHICH_TIMEOUT_MS = 8000
const CACHE_MS = 60_000 // `meta which` spawns every provider's --version; don't do that on each poll
let cache = null // { at, key, value }

const run = (bin, args, timeout) =>
  new Promise((resolve) => {
    execFile(bin, args, { timeout, env: { ...process.env, NO_COLOR: '1' } }, (err, stdout, stderr) =>
      resolve({ err, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }),
    )
  })

// `meta which` prints a header, a dashes row, then one row per provider:
//   PROVIDER  CLI(ok|missing)  ACP(yes|no)  PATH  NOTE...
// A missing CLI prints the literal "(not on PATH)" as PATH, and NOTE is free text.
// The trailing "ACP lane: …" footer does not match the row shape and is skipped.
const WHICH_ROW = /^(\S+)\s+(ok|missing)\s+(yes|no)\s+(\(not on PATH\)|\S+)\s*(.*)$/
export function parseWhich(text) {
  const rows = []
  for (const line of text.split('\n')) {
    const m = WHICH_ROW.exec(line.trim())
    if (!m) continue
    const [, provider, cli, acp, p, note] = m
    rows.push({ provider, cli, acp, path: cli === 'ok' ? p : null, note: note || null })
  }
  return rows
}

async function ollamaProbe(bin) {
  const v = await run(bin, ['--version'], 3000)
  if (v.err) return { cli: 'missing', note: null, models: null }
  const version = (v.stdout.match(/version is (\S+)/) ?? [])[1] ?? null
  let models = null
  try {
    const ctrl = AbortSignal.timeout(2000)
    const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: ctrl })
    if (r.ok) models = ((await r.json()).models ?? []).map((m) => m.name)
  } catch { /* daemon down — models stay unknown, not zero */ }
  return { cli: 'ok', note: version, models }
}

// Count meta runs per provider in the window from <runsDir>/<run-id>/<slot>/meta.json.
// A slot is `provider` or `provider@n`; the provider name is read from meta.json itself.
async function runStats(runsDir) {
  if (!runsDir) return { runsDir: null, byProvider: {}, runs: 0 }
  const cutoff = Date.now() - WINDOW_DAYS * 864e5
  const byProvider = {}
  let runs = 0
  let dirs
  try {
    dirs = await fs.readdir(runsDir, { withFileTypes: true })
  } catch {
    return { runsDir, byProvider, runs, reason: 'runs dir not found yet — no meta runs recorded' }
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    const runDir = path.join(runsDir, d.name)
    let slots
    try { slots = await fs.readdir(runDir, { withFileTypes: true }) } catch { continue }
    let counted = false
    for (const s of slots) {
      if (!s.isDirectory()) continue
      let m
      try { m = JSON.parse(await fs.readFile(path.join(runDir, s.name, 'meta.json'), 'utf8')) } catch { continue }
      const at = Date.parse(m.started_at ?? '')
      if (!Number.isFinite(at) || at < cutoff || m.dry_run) continue
      const p = (byProvider[m.provider] ??= { runs: 0, ok: 0, failed: 0, ms: 0 })
      p.runs += 1
      if (m.exit_code === 0) p.ok += 1
      else p.failed += 1
      p.ms += Number(m.duration_ms) || 0
      counted = true
    }
    if (counted) runs += 1
  }
  return { runsDir, byProvider, runs }
}

export async function engines(cfg, claudeHome, baseDir) {
  if (!cfg?.enabled) {
    return {
      available: true,
      enabled: false,
      hint: 'add "metaCli": { "enabled": true } to meta-os.config.json (or instance.config.json) to turn this on',
    }
  }
  const key = JSON.stringify(cfg)
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.value

  const bin = cfg.bin ?? 'meta'
  const which = await run(bin, ['which'], WHICH_TIMEOUT_MS)
  if (which.err && !which.stdout) {
    const reason = which.err.killed
      ? `\`${bin} which\` timed out after ${WHICH_TIMEOUT_MS / 1000}s`
      : `meta-cli not runnable as "${bin}" (${which.err.code ?? which.err.message}) — set metaCli.bin or put meta on PATH`
    return { available: false, enabled: true, reason }
  }

  const declared = cfg.providers ?? {}
  const rows = parseWhich(which.stdout).map((r) => ({
    ...r,
    adapter: true,
    plan: declared[r.provider]?.plan ?? null,
  }))
  // Ollama sits outside meta-cli today; show it so the gap is visible, not silent.
  if (declared.ollama || cfg.probeOllama !== false) {
    const o = await ollamaProbe(cfg.ollamaBin ?? 'ollama')
    rows.push({
      provider: 'ollama', cli: o.cli, acp: 'no', path: null, note: o.note,
      adapter: false, plan: declared.ollama?.plan ?? null, models: o.models,
    })
  }

  const runsDir = cfg.runsDir ? path.resolve(baseDir ?? process.cwd(), cfg.runsDir) : null
  const stats = await runStats(runsDir)
  for (const r of rows) r.runs30d = stats.byProvider[r.provider] ?? null

  let skillMounted = false
  try {
    await fs.stat(path.join(claudeHome ?? path.join(os.homedir(), '.claude'), 'skills', 'multi-engine', 'SKILL.md'))
    skillMounted = true
  } catch { /* not mounted */ }

  const ready = rows.filter((r) => r.adapter && r.cli === 'ok').map((r) => r.provider)
  const value = {
    available: true,
    enabled: true,
    bin,
    windowDays: WINDOW_DAYS,
    providers: rows,
    ready,
    offload: ready.filter((p) => p !== 'claude'),
    runs: stats.runs,
    runsDir: stats.runsDir,
    runsReason: stats.reason ?? (stats.runsDir ? null : 'metaCli.runsDir not set — run counts off'),
    skill: { name: 'multi-engine', mounted: skillMounted },
    checkedAt: new Date().toISOString(),
  }
  cache = { at: Date.now(), key, value }
  return value
}
