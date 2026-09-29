// Flow view — the pure half. Everything here takes plain data (git/gh output already
// parsed into objects) and returns plain data, so the classification rules can be
// tested from fixtures without a repository, a network or a clock. flow.mjs owns the
// I/O: it runs git and gh, then hands the results to these functions.

const DAY = 86_400_000
// Ref and slug comparisons ignore case: on a case-insensitive filesystem `VEC/x` and
// `vec/x` are one ref, and git reports whichever spelling it met first; GitHub owner
// and repository names are case-insensitive too.
const lc = (s) => String(s ?? '').toLowerCase()

// ── branch → work-item key ──────────────────────────────────────────────────────
// Convention: `<space>/<KEY>-slug` (e.g. `abc/ABC-12-flow-view`). The key must open a
// path segment and be followed by a separator or the end, so `ci/codeql-2x` or
// `lane-abc-12` do not produce a key. Case-insensitive; returned upper-cased.
const KEY_RE = /(?:^|\/)([A-Za-z][A-Za-z0-9]*-\d+)(?=$|[-_/.])/

export function parseBranchKey(branch) {
  if (typeof branch !== 'string') return null
  const m = KEY_RE.exec(branch.replace(/^refs\/heads\//, ''))
  return m ? m[1].toUpperCase() : null
}

// ── noise filter for uncommitted files ──────────────────────────────────────────
// Tool state that changes on its own and says nothing about abandoned work.
const NOISE_SEGMENTS = new Set(['.DS_Store', '.claude-flow', '.claude', '.idea', '__pycache__'])
const NOISE_FILES = [/^agentdb\.rvf/, /^ruvector\.db/, /^memory\.db-/]

export function isNoise(file) {
  const parts = String(file).replace(/\/+$/, '').split('/')
  if (parts.some((p) => NOISE_SEGMENTS.has(p))) return true
  const base = parts[parts.length - 1]
  return NOISE_FILES.some((re) => re.test(base))
}

// ── git output parsers ──────────────────────────────────────────────────────────
// `git worktree list --porcelain`: blank-line separated records.
export function parseWorktrees(text) {
  const out = []
  for (const block of String(text).split(/\n\n+/)) {
    const wt = {}
    for (const line of block.split('\n')) {
      const sp = line.indexOf(' ')
      const k = sp < 0 ? line : line.slice(0, sp)
      const v = sp < 0 ? true : line.slice(sp + 1)
      if (k === 'worktree') wt.path = v
      else if (k === 'HEAD') wt.head = v
      else if (k === 'branch') wt.branch = String(v).replace(/^refs\/heads\//, '')
      else if (k === 'detached') wt.detached = true
      else if (k === 'bare') wt.bare = true
      else if (k === 'prunable') wt.prunable = true
      else if (k === 'locked') wt.locked = true
    }
    if (wt.path) out.push({ branch: null, detached: false, bare: false, prunable: false, ...wt })
  }
  return out.map((w, i) => ({ ...w, main: i === 0 }))
}

// `git status --porcelain=v1 -z`: NUL-separated; a rename carries its source path as
// the next field, which is skipped. Deleted files have no mtime and are left out.
export function parseStatus(text) {
  const fields = String(text).split('\0').filter(Boolean)
  const out = []
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]
    const code = f.slice(0, 2)
    const file = f.slice(3)
    if (code[0] === 'R' || code[0] === 'C') i++
    if (code.includes('D')) continue
    out.push({ code, path: file, untracked: code === '??' })
  }
  return out
}

// `git for-each-ref --format=%(refname)%09%(upstream:short)%09%(upstream:track)%09%(committerdate:unix)%09%(objectname)`
export function parseRefs(text) {
  const heads = []
  const remotes = new Set()
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue
    const [ref, upstream, track, date, sha] = line.split('\t')
    if (ref.startsWith('refs/heads/')) {
      heads.push({
        name: ref.slice('refs/heads/'.length),
        upstream: upstream || null,
        gone: /\bgone\b/.test(track ?? ''),
        date: Number(date) * 1000 || null,
        sha: sha || null,
      })
    } else if (ref.startsWith('refs/remotes/')) {
      remotes.add(lc(ref.slice('refs/remotes/'.length)))
    }
  }
  return { heads, remotes }
}

// `git cherry <base> <branch>`: '+' lines are patches not yet in base.
export const countCherry = (text) => String(text).split('\n').filter((l) => l.startsWith('+')).length

// https://github.com/owner/name(.git), git@github.com:owner/name(.git), ssh://git@github.com/owner/name
export function githubSlug(url) {
  const m = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(String(url ?? '').trim())
  return m ? `${m[1]}/${m[2]}` : null
}

// ── GitHub check rollup → one word ──────────────────────────────────────────────
const FAILED = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR'])
const PASSED = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])

export function summarizeChecks(rollup) {
  if (!Array.isArray(rollup) || !rollup.length) return 'none'
  let pending = false
  for (const c of rollup) {
    const verdict = c.conclusion || c.state || null
    if (verdict && FAILED.has(verdict)) return 'failing'
    if (c.status && c.status !== 'COMPLETED') pending = true
    else if (!verdict || !PASSED.has(verdict)) pending = true
  }
  return pending ? 'pending' : 'passing'
}

// ── classification ──────────────────────────────────────────────────────────────
export const SEVERITY = { high: 1, medium: 2, low: 3 }
// Order within a severity: the two the PO asked to see first lead.
const KIND_ORDER = ['only-on-disk', 'merged-not-done', 'in-review-no-pr', 'unmerged-no-pr', 'stale-uncommitted', 'worktree-merged', 'no-remote']

const ageDays = (ms, now) => (ms == null ? null : Math.max(0, Math.floor((now - ms) / DAY)))
const itemRef = (items, key) => {
  const it = key ? items.get(key) : null
  return it ? { id: it.id, space: it.space, status: it.status, title: it.title } : null
}

// A branch's commits exist somewhere other than this disk when a remote branch of
// the same name exists. An upstream that is the base branch itself (a branch cut
// with --track from origin/main) does not count: nothing of it was pushed.
function pushed(repo, b) {
  if (!repo.remote) return false
  if (repo.remoteRefs?.has(lc(`${repo.remote}/${b.name}`))) return true
  return !!(b.upstream && !b.gone && lc(b.upstream) !== lc(repo.base) && repo.remoteRefs?.has(lc(b.upstream)))
}

const findBranch = (repo, name) => (name ? repo.branches.find((x) => lc(x.name) === lc(name)) ?? null : null)
const isBase = (repo, name) => !!(repo.base && name && lc(name) === lc(repo.base.slice(repo.base.indexOf('/') + 1)))
const headKey = (slug, head) => `${lc(slug)}#${lc(head)}`

// Merged: every patch is in base (cherry), or a merged PR's head is exactly this
// branch's tip. The second covers squash merges of several commits, which leave no
// patch-equivalent commit behind for cherry to find.
export const isMerged = (b, pr) =>
  b.unmerged === 0 || !!(pr && pr.state === 'MERGED' && pr.headRefOid && b.sha && pr.headRefOid === b.sha)

// PRs indexed by `<slug>#<head>` and by linked key.
export function indexPrs(prsByRepo) {
  const byHead = new Map()
  const openKeys = new Map()
  for (const [slug, prs] of Object.entries(prsByRepo ?? {})) {
    for (const pr of prs ?? []) {
      const k = headKey(slug, pr.headRefName)
      // Prefer the open PR, then the most recent — a head reused after a merge.
      const prev = byHead.get(k)
      if (!prev || (pr.state === 'OPEN' && prev.state !== 'OPEN') || (prev.state !== 'OPEN' && pr.number > prev.number)) byHead.set(k, { ...pr, repo: slug })
      const key = parseBranchKey(pr.headRefName)
      if (key && pr.state === 'OPEN' && !openKeys.has(key)) openKeys.set(key, { ...pr, repo: slug })
    }
  }
  return { byHead, openKeys }
}

// repos: [{ name, path, remote, base, slug, remoteRefs:Set, branches:[{name, upstream, gone, date, ahead, behind, unmerged}],
//           worktrees:[{path, branch, detached, main, prunable, dirty:[{path, mtimeMs}]}] }]
// github: { available, prsByRepo } — when unavailable, the PR-dependent alarms are skipped, not guessed.
export function classifyDrift({ repos, github, items, now, mergedWindowDays = 14, staleDays = 7 }) {
  const alarms = []
  const gh = github?.available ? indexPrs(github.prsByRepo) : null
  const prFor = (repo, branch) => (gh && repo.slug ? gh.byHead.get(headKey(repo.slug, branch)) ?? null : null)
  const mergedNotDone = new Set()

  for (const repo of repos) {
    if (!repo.remote) {
      alarms.push({
        kind: 'no-remote', severity: 'low', repo: repo.name, path: repo.path,
        reason: 'repository has no remote — every commit exists only on this disk',
        evidence: { branches: repo.branches.length },
      })
      continue
    }
    for (const b of repo.branches) {
      if (isBase(repo, b.name) || !repo.base || !b.unmerged) continue
      const key = parseBranchKey(b.name)
      const pr = prFor(repo, b.name)
      if (isMerged(b, pr)) continue
      const evidence = { unmergedCommits: b.unmerged, ahead: b.ahead, behind: b.behind, upstream: b.upstream, upstreamGone: b.gone, lastCommitDays: ageDays(b.date, now) }
      if (!pushed(repo, b) && pr?.state !== 'OPEN') {
        alarms.push({
          kind: 'only-on-disk', severity: 'high', repo: repo.name, branch: b.name, key, item: itemRef(items, key),
          reason: `${b.unmerged} commit${b.unmerged === 1 ? '' : 's'} not in ${repo.base} and no remote branch${b.gone ? ' (upstream deleted)' : b.upstream === repo.base ? ` (tracks ${repo.base} itself)` : ''}` +
            (pr ? ` — PR #${pr.number} ${pr.state.toLowerCase()}${pr.state === 'MERGED' ? ' from a different tip' : ''}` : ''),
          evidence: { ...evidence, pr: pr ? { number: pr.number, state: pr.state, url: pr.url } : null },
        })
      } else if (gh && repo.slug && !pr) {
        alarms.push({
          kind: 'unmerged-no-pr', severity: 'medium', repo: repo.name, branch: b.name, key, item: itemRef(items, key),
          reason: `pushed, ${b.unmerged} commit${b.unmerged === 1 ? '' : 's'} not in ${repo.base}, and no pull request for this head`,
          evidence,
        })
      }
    }

    for (const wt of repo.worktrees) {
      if (wt.branch && repo.base && !isBase(repo, wt.branch)) {
        const b = findBranch(repo, wt.branch)
        const pr = prFor(repo, wt.branch)
        if (b && b.ahead != null && isMerged(b, pr)) {
          alarms.push({
            kind: 'worktree-merged', severity: 'low', repo: repo.name, branch: wt.branch, path: wt.path,
            key: parseBranchKey(wt.branch), item: itemRef(items, parseBranchKey(wt.branch)),
            reason: b.unmerged === 0
              ? `worktree still checked out on a branch whose every patch is already in ${repo.base}`
              : `worktree still checked out on a branch squash-merged by PR #${pr.number}`,
            evidence: { ahead: b.ahead, behind: b.behind, dirtyFiles: wt.dirty?.length ?? 0, pr: pr ? { number: pr.number, state: pr.state, url: pr.url } : null },
          })
        }
      }
      const real = (wt.dirty ?? []).filter((f) => !isNoise(f.path) && f.mtimeMs != null)
      if (real.length) {
        const oldest = real.reduce((a, f) => (f.mtimeMs < a.mtimeMs ? f : a))
        const newest = real.reduce((a, f) => (f.mtimeMs > a.mtimeMs ? f : a))
        const age = ageDays(oldest.mtimeMs, now)
        if (age > staleDays) {
          alarms.push({
            kind: 'stale-uncommitted', severity: 'medium', repo: repo.name, branch: wt.branch, path: wt.path,
            reason: `${real.length} uncommitted file${real.length === 1 ? '' : 's'}, oldest untouched for ${age} days`,
            evidence: { files: real.length, oldest: { path: oldest.path, days: age }, newest: { path: newest.path, days: ageDays(newest.mtimeMs, now) }, sample: real.slice(0, 5).map((f) => f.path) },
          })
        }
      }
    }
  }

  if (gh) {
    const since = now - mergedWindowDays * DAY
    for (const [slug, prs] of Object.entries(github.prsByRepo ?? {})) {
      for (const pr of prs ?? []) {
        if (pr.state !== 'MERGED' || !pr.mergedAt || Date.parse(pr.mergedAt) < since) continue
        const key = parseBranchKey(pr.headRefName)
        const it = itemRef(items, key)
        if (!it || it.status === 'DONE' || gh.openKeys.has(key)) continue
        mergedNotDone.add(key)
        alarms.push({
          kind: 'merged-not-done', severity: 'high', repo: slug, branch: pr.headRefName, key, item: it, url: pr.url,
          reason: `PR #${pr.number} merged ${ageDays(Date.parse(pr.mergedAt), now)}d ago; item is still ${it.status}`,
          evidence: { pr: { number: pr.number, title: pr.title, mergedAt: pr.mergedAt, url: pr.url } },
        })
      }
    }
    for (const it of items.values()) {
      if (it.status !== 'IN REVIEW' || gh.openKeys.has(it.id) || mergedNotDone.has(it.id)) continue
      alarms.push({
        kind: 'in-review-no-pr', severity: 'medium', repo: null, key: it.id, item: itemRef(items, it.id),
        reason: 'item is IN REVIEW but no open pull request in the scanned repositories links to it',
        evidence: { space: it.space },
      })
    }
  }

  return alarms.sort((a, b) =>
    SEVERITY[a.severity] - SEVERITY[b.severity] ||
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
    String(a.repo ?? '').localeCompare(String(b.repo ?? '')) ||
    String(a.branch ?? a.key ?? '').localeCompare(String(b.branch ?? b.key ?? '')))
}

// Open PRs authored by the configured user, enriched from the per-repo lists.
// search: [{ repository:{nameWithOwner}, number, title, url, isDraft, createdAt }]
export function waitingForPo({ search, prsByRepo, checksByRepo, items, now }) {
  return (search ?? [])
    .map((s) => {
      const slug = s.repository?.nameWithOwner ?? s.repository?.fullName ?? String(s.repository ?? '')
      const full = (prsByRepo?.[slug] ?? []).find((p) => p.number === s.number) ?? {}
      const head = full.headRefName ?? null
      const key = parseBranchKey(head)
      return {
        repo: slug, number: s.number, title: s.title, url: s.url, draft: !!(s.isDraft ?? full.isDraft),
        ageDays: ageDays(Date.parse(s.createdAt), now), createdAt: s.createdAt,
        reviewDecision: full.reviewDecision || null,
        checks: summarizeChecks(checksByRepo?.[slug]?.[s.number]),
        head, key, item: itemRef(items, key),
      }
    })
    .sort((a, b) => (a.draft - b.draft) || (b.ageDays ?? 0) - (a.ageDays ?? 0))
}

// Every worktree across the scanned repos, one row each.
export function laneRows({ repos, github, items, ledger }) {
  const gh = github?.available ? indexPrs(github.prsByRepo) : null
  const rows = []
  for (const repo of repos) {
    for (const wt of repo.worktrees) {
      if (wt.bare) continue
      const b = findBranch(repo, wt.branch)
      const key = parseBranchKey(wt.branch)
      const pr = gh && repo.slug && wt.branch ? gh.byHead.get(headKey(repo.slug, wt.branch)) : null
      const onBase = isBase(repo, wt.branch)
      rows.push({
        path: wt.path, repo: repo.name, branch: wt.branch, detached: wt.detached, main: wt.main, prunable: wt.prunable,
        key, item: itemRef(items, key),
        dirty: (wt.dirty ?? []).filter((f) => !isNoise(f.path)).length,
        ahead: b?.ahead ?? null, behind: b?.behind ?? null, upstream: b?.upstream ?? null,
        pr: pr ? { number: pr.number, state: pr.state, url: pr.url, draft: !!pr.isDraft } : null,
        merged: onBase || !b || b.ahead == null ? null : isMerged(b, pr),
        session: ledgerEntry(ledger, wt, repo),
      })
    }
  }
  return rows.sort((a, b) => (a.main - b.main) || a.repo.localeCompare(b.repo) || a.path.localeCompare(b.path))
}

// A ledger is an array (or { lanes: [...] }) of entries naming a worktree `path`
// (or `worktree`), or a `repo` + `branch`. The matched entry's `session` field is
// returned, else the entry itself. No ledger → null.
function ledgerEntry(ledger, wt, repo) {
  const list = Array.isArray(ledger) ? ledger : Array.isArray(ledger?.lanes) ? ledger.lanes : null
  if (!list) return null
  const hit = list.find((e) => (e.path ?? e.worktree) === wt.path || (e.branch && lc(e.branch) === lc(wt.branch) && (!e.repo || e.repo === repo.name)))
  return hit ? hit.session ?? hit : null
}
