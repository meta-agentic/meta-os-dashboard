// Flow view — vault × git × GitHub, joined. Answers "what is waiting for me, what has
// drifted, and which lanes are running" across every configured repository.
//
// Read-only by construction: git runs with GIT_OPTIONAL_LOCKS=0 (so `status` never
// refreshes the index), nothing fetches, and gh only reads. Every call is async with
// its own timeout; the repo scan and the GitHub reads are cached separately so the
// dashboard's polling never turns into a git/gh storm. A missing or unauthenticated
// `gh` degrades the GitHub half only, with its reason.
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { loadBacklog } from './vault-backlog.mjs'
import {
  parseWorktrees, parseStatus, parseRefs, countCherry, githubSlug,
  classifyDrift, waitingForPo, laneRows, SEVERITY,
} from './flow-model.mjs'

export const FLOW_DEFAULTS = {
  scanRoots: [],
  scanDepth: 2,
  repos: [],
  exclude: [],
  github: { user: null, orgs: [] },
  mergedWindowDays: 14,
  staleDays: 7,
  prLimit: 200,
  githubCacheSec: 300,
  scanCacheSec: 60,
  timeoutMs: 15_000,
  concurrency: 8,
  laneLedger: null,
}

const SKIP_DIRS = new Set(['node_modules', 'vendor', 'target', 'dist', 'build'])
const MAX_DIRTY = 500

export function flowConfig(raw) {
  const c = { ...FLOW_DEFAULTS, ...(raw ?? {}) }
  c.github = { ...FLOW_DEFAULTS.github, ...(raw?.github ?? {}) }
  return c
}

function run(cmd, args, { cwd, timeoutMs }) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, {
      cwd, timeout: timeoutMs, maxBuffer: 32 << 20,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
    }, (err, stdout, stderr) => (err ? reject(Object.assign(err, { stderr: String(stderr ?? '') })) : resolve(String(stdout))))
  })
}

async function mapLimit(list, n, fn) {
  const out = new Array(list.length)
  let next = 0
  const worker = async () => {
    while (next < list.length) {
      const i = next++
      out[i] = await fn(list[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, worker))
  return out
}

// TTL cache with in-flight de-duplication: concurrent requests share one computation.
// Once a value exists, an expired read returns it at once and refreshes behind it
// (stale-while-revalidate), so only the very first request waits for a cold scan.
function cached(ttlMs, compute) {
  let value = null
  let at = 0
  let inflight = null
  const refresh = () => {
    if (!inflight) {
      inflight = compute()
        .then((v) => { value = v; at = Date.now(); return v })
        .finally(() => { inflight = null })
    }
    return inflight
  }
  return () => {
    if (!value) return refresh()
    if (Date.now() - at >= ttlMs) refresh().catch(() => {})
    return Promise.resolve(value)
  }
}

// ── repository discovery ────────────────────────────────────────────────────────
// A directory with a .git DIRECTORY is a repository root; one with a .git FILE is a
// linked worktree or submodule, found through its main repository instead.
async function discover(cfg) {
  const found = new Set(cfg.repos.map((p) => path.resolve(p)))
  const excluded = (p) => cfg.exclude.some((x) => p === x || p.startsWith(x.replace(/\/?$/, '/')) || path.basename(p) === x)
  const walk = async (dir, depth) => {
    if (excluded(dir)) return
    let ents
    try { ents = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    const git = ents.find((e) => e.name === '.git')
    if (git) { if (git.isDirectory()) found.add(dir); return }
    if (depth <= 0) return
    await Promise.all(ents
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
      .map((e) => walk(path.join(dir, e.name), depth - 1)))
  }
  await Promise.all(cfg.scanRoots.map((r) => walk(path.resolve(r), cfg.scanDepth)))
  return [...found].filter((p) => !excluded(p)).sort()
}

async function dirtyFiles(wtPath, git) {
  let out
  try { out = await git(['status', '--porcelain=v1', '-z', '--untracked-files=normal'], wtPath) } catch { return null }
  const entries = parseStatus(out).slice(0, MAX_DIRTY)
  return Promise.all(entries.map(async (e) => {
    try { return { ...e, mtimeMs: (await fs.stat(path.join(wtPath, e.path))).mtimeMs } } catch { return { ...e, mtimeMs: null } }
  }))
}

async function scanRepo(repoPath, cfg, rootsForName) {
  const git = (args, cwd = repoPath) => run('git', args, { cwd, timeoutMs: cfg.timeoutMs })
  const name = path.relative(rootsForName(repoPath), repoPath) || path.basename(repoPath)
  const repo = { name, path: repoPath, remote: null, base: null, slug: null, remoteRefs: new Set(), branches: [], worktrees: [], error: null }
  try {
    const remotes = (await git(['remote'])).split('\n').filter(Boolean)
    repo.remote = remotes.includes('origin') ? 'origin' : remotes[0] ?? null
    const refs = parseRefs(await git(['for-each-ref', '--format=%(refname)%09%(upstream:short)%09%(upstream:track)%09%(committerdate:unix)%09%(objectname)', 'refs/heads', 'refs/remotes']))
    repo.remoteRefs = refs.remotes
    if (repo.remote) {
      repo.slug = githubSlug(await git(['remote', 'get-url', repo.remote]).catch(() => ''))
      const head = await git(['symbolic-ref', '--short', `refs/remotes/${repo.remote}/HEAD`]).then((s) => s.trim()).catch(() => null)
      repo.base = head ?? ['main', 'master'].map((b) => `${repo.remote}/${b}`).find((r) => refs.remotes.has(r)) ?? null
    }
    repo.branches = await mapLimit(refs.heads, 4, async (b) => {
      if (!repo.base) return { ...b, ahead: null, behind: null, unmerged: null }
      try {
        const [behind, ahead] = (await git(['rev-list', '--left-right', '--count', `${repo.base}...refs/heads/${b.name}`])).trim().split(/\s+/).map(Number)
        const unmerged = ahead === 0 ? 0 : countCherry(await git(['cherry', repo.base, `refs/heads/${b.name}`]))
        return { ...b, ahead, behind, unmerged }
      } catch {
        return { ...b, ahead: null, behind: null, unmerged: null }
      }
    })
    const wts = parseWorktrees(await git(['worktree', 'list', '--porcelain']))
    repo.worktrees = await mapLimit(wts, 4, async (wt) => {
      if (wt.bare || wt.prunable) return { ...wt, dirty: [] }
      return { ...wt, dirty: (await dirtyFiles(wt.path, git)) ?? [] }
    })
  } catch (e) {
    repo.error = (e.stderr || e.message || String(e)).trim().split('\n')[0]
  }
  return repo
}

// ── GitHub ──────────────────────────────────────────────────────────────────────
async function readGithub(cfg, slugs) {
  const gh = (args) => run('gh', args, { timeoutMs: cfg.timeoutMs }).then((s) => JSON.parse(s || 'null'))
  let user
  try {
    user = cfg.github.user || (await run('gh', ['api', 'user', '--jq', '.login'], { timeoutMs: cfg.timeoutMs })).trim()
  } catch (e) {
    const reason = e.code === 'ENOENT' ? 'gh CLI not installed' : `gh not authenticated or unreachable: ${(e.stderr || e.message).trim().split('\n')[0]}`
    return { available: false, reason }
  }
  const owners = cfg.github.orgs.length ? [...new Set([...cfg.github.orgs, user])] : []
  const ownerOk = (slug) => !owners.length || owners.includes(slug.split('/')[0])
  try {
    const search = await gh([
      'search', 'prs', '--author', user, '--state', 'open', '--limit', '200',
      '--json', 'repository,number,title,url,isDraft,createdAt,updatedAt',
      ...owners.flatMap((o) => ['--owner', o]),
    ]) ?? []
    const repos = [...new Set([...slugs.filter(ownerOk), ...search.map((s) => s.repository?.nameWithOwner).filter(Boolean)])].sort()
    const withOpen = new Set(search.map((s) => s.repository?.nameWithOwner))
    const failed = []
    const prsByRepo = {}
    const checksByRepo = {}
    // A renamed or transferred repository still answers at its old slug (GitHub
    // redirects), so a clone whose remote was never updated would be read twice under
    // two names. The PR URLs carry the current name: key everything by that, and
    // report the old → new mapping so local repositories can be joined to it.
    const aliases = {}
    await mapLimit(repos, 6, async (slug) => {
      try {
        const prs = await gh(['pr', 'list', '-R', slug, '--state', 'all', '--limit', String(cfg.prLimit),
          '--json', 'number,title,state,headRefName,headRefOid,url,isDraft,createdAt,mergedAt,reviewDecision,author']) ?? []
        const canonical = /github\.com\/([^/]+\/[^/]+)\/pull\//.exec(prs[0]?.url ?? '')?.[1] ?? slug
        if (canonical.toLowerCase() !== slug.toLowerCase()) aliases[slug] = canonical
        prsByRepo[canonical] = prs
        if (withOpen.has(canonical)) {
          const open = await gh(['pr', 'list', '-R', canonical, '--state', 'open', '--author', user, '--json', 'number,statusCheckRollup']) ?? []
          checksByRepo[canonical] = Object.fromEntries(open.map((p) => [p.number, p.statusCheckRollup]))
        }
      } catch (e) {
        failed.push({ repo: slug, reason: (e.stderr || e.message).trim().split('\n')[0] })
      }
    })
    return { available: true, user, owners, repos: Object.keys(prsByRepo).length, aliases, failed, search, prsByRepo, checksByRepo, fetchedAt: new Date().toISOString() }
  } catch (e) {
    return { available: false, reason: `gh query failed: ${(e.stderr || e.message).trim().split('\n')[0]}` }
  }
}

// ── vault ───────────────────────────────────────────────────────────────────────
async function readItems(backlogs) {
  const items = new Map()
  const failed = []
  await Promise.all((backlogs ?? []).map(async (b) => {
    try {
      const d = await loadBacklog(b)
      for (const s of [...d.epics, ...d.stories]) {
        if (s?.id) items.set(String(s.id).toUpperCase(), { id: s.id, space: b.space, status: s.status, title: s.title })
      }
    } catch (e) {
      failed.push({ space: b.space, reason: e.message })
    }
  }))
  return { items, failed }
}

async function readLedger(file, instanceRoot) {
  if (!file) return { ledger: null, source: { available: false, configured: false, reason: 'no laneLedger configured' } }
  const p = path.isAbsolute(file) ? file : path.join(instanceRoot, file)
  try {
    return { ledger: JSON.parse(await fs.readFile(p, 'utf8')), source: { available: true } }
  } catch (e) {
    return { ledger: null, source: { available: false, reason: `lane ledger unreadable: ${e.code ?? e.message}` } }
  }
}

// ── endpoint ────────────────────────────────────────────────────────────────────
export function createFlow({ flow, backlogs, instanceRoot }) {
  const cfg = flowConfig(flow)
  const scanRoots = cfg.scanRoots.map((r) => path.resolve(r))
  const rootsForName = (p) => scanRoots.filter((r) => p.startsWith(r + '/')).sort((a, b) => b.length - a.length)[0] ?? path.dirname(p)

  const scan = cached(cfg.scanCacheSec * 1000, async () => {
    const paths = await discover(cfg)
    const repos = await mapLimit(paths, cfg.concurrency, (p) => scanRepo(p, cfg, rootsForName))
    const vault = await readItems(backlogs)
    return { repos, vault, scannedAt: new Date().toISOString() }
  })
  // Re-created when the set of local GitHub repos changes, so a new clone is picked
  // up without waiting out the GitHub TTL.
  let lastSlugs = ''
  let github = null

  return async function flowView() {
    if (!scanRoots.length && !cfg.repos.length) {
      return { available: false, reason: 'no repositories configured — set flow.scanRoots (or flow.repos) in instance.config.json' }
    }
    const { repos, vault, scannedAt } = await scan()
    const slugs = [...new Set(repos.map((r) => r.slug).filter(Boolean))].sort()
    if (!github || slugs.join(',') !== lastSlugs) {
      lastSlugs = slugs.join(',')
      github = cached(cfg.githubCacheSec * 1000, () => readGithub(cfg, slugs))
    }
    const [gh, { ledger, source: ledgerSource }] = await Promise.all([github(), readLedger(cfg.laneLedger, instanceRoot)])
    const now = Date.now()
    const ok = repos.filter((r) => !r.error).map((r) => (gh.aliases?.[r.slug] ? { ...r, slug: gh.aliases[r.slug] } : r))
    const drift = classifyDrift({ repos: ok, github: gh, items: vault.items, now, mergedWindowDays: cfg.mergedWindowDays, staleDays: cfg.staleDays })
    const waiting = gh.available ? waitingForPo({ search: gh.search, prsByRepo: gh.prsByRepo, checksByRepo: gh.checksByRepo, items: vault.items, now }) : []
    const lanes = laneRows({ repos: ok, github: gh, items: vault.items, ledger })
    const bySeverity = Object.fromEntries(Object.keys(SEVERITY).map((s) => [s, drift.filter((a) => a.severity === s).length]))
    return {
      available: true,
      generatedAt: new Date(now).toISOString(),
      settings: { mergedWindowDays: cfg.mergedWindowDays, staleDays: cfg.staleDays },
      sources: {
        git: { available: true, repos: repos.length, failed: repos.filter((r) => r.error).map((r) => ({ repo: r.name, reason: r.error })), scannedAt },
        github: gh.available
          ? { available: true, user: gh.user, owners: gh.owners, repos: gh.repos, failed: gh.failed, fetchedAt: gh.fetchedAt }
          : { available: false, reason: gh.reason },
        vault: (backlogs ?? []).length
          ? { available: true, items: vault.items.size, failed: vault.failed }
          : { available: false, reason: 'no backlogs configured — items cannot be linked' },
        ledger: ledgerSource,
      },
      counts: { waiting: waiting.length, drift: drift.length, driftBySeverity: bySeverity, lanes: lanes.length },
      waiting,
      drift,
      lanes,
    }
  }
}
