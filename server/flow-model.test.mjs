// node --test server/
// The Flow view's rules, driven from fixtures: no repository, no network, a fixed clock.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseBranchKey, isNoise, parseWorktrees, parseStatus, parseRefs, countCherry, githubSlug,
  summarizeChecks, isMerged, classifyDrift, waitingForPo, laneRows,
} from './flow-model.mjs'

const DAY = 86_400_000
const NOW = Date.parse('2026-06-30T12:00:00Z')
const ago = (days) => NOW - days * DAY
const iso = (days) => new Date(ago(days)).toISOString()

const items = new Map([
  ['ABC-1', { id: 'ABC-1', space: 'abc', status: 'IN REVIEW', title: 'merged but open' }],
  ['ABC-2', { id: 'ABC-2', space: 'abc', status: 'DONE', title: 'done' }],
  ['ABC-3', { id: 'ABC-3', space: 'abc', status: 'IN REVIEW', title: 'waiting on a PR' }],
  ['ABC-4', { id: 'ABC-4', space: 'abc', status: 'IN REVIEW', title: 'no PR anywhere' }],
])

const branch = (name, over = {}) => ({ name, upstream: null, gone: false, date: ago(1), sha: `sha-${name}`, ahead: 1, behind: 0, unmerged: 1, ...over })

function fixtureRepo(over = {}) {
  return {
    name: 'org/app', path: '/src/app', remote: 'origin', base: 'origin/main', slug: 'your-org/app',
    remoteRefs: new Set(['origin/main', 'origin/abc/abc-3-pushed', 'origin/feature/pushed-no-pr']),
    branches: [
      branch('main', { upstream: 'origin/main', ahead: 0, unmerged: 0 }),
      branch('abc/ABC-9-local-only'),
      branch('ci/tracks-main', { upstream: 'origin/main' }),
      branch('abc/ABC-3-pushed', { upstream: 'origin/abc/ABC-3-pushed' }),
      branch('feature/pushed-no-pr', { upstream: 'origin/feature/pushed-no-pr' }),
      branch('abc/ABC-2-merged', { upstream: 'origin/abc/ABC-2-merged', gone: true, ahead: 2, unmerged: 0 }),
      branch('abc/ABC-5-squashed', { gone: true, ahead: 3, unmerged: 3, sha: 'squash-tip' }),
    ],
    worktrees: [
      { path: '/src/app', branch: 'main', main: true, detached: false, dirty: [{ path: '.DS_Store', mtimeMs: ago(90) }] },
      { path: '/wt/merged', branch: 'ABC/abc-2-merged', main: false, detached: false, dirty: [] },
      { path: '/wt/squashed', branch: 'abc/ABC-5-squashed', main: false, detached: false, dirty: [] },
      { path: '/wt/stale', branch: 'abc/ABC-3-pushed', main: false, detached: false, dirty: [
        { path: 'src/a.js', mtimeMs: ago(30) }, { path: 'src/b.js', mtimeMs: ago(2) }, { path: '.claude-flow/state.json', mtimeMs: ago(200) },
      ] },
    ],
    ...over,
  }
}

const github = {
  available: true,
  prsByRepo: {
    'your-org/app': [
      { number: 10, state: 'OPEN', headRefName: 'abc/ABC-3-pushed', url: 'https://github.com/your-org/app/pull/10', isDraft: false, reviewDecision: 'REVIEW_REQUIRED' },
      { number: 7, state: 'MERGED', headRefName: 'abc/ABC-2-merged', mergedAt: iso(3), url: 'u7' },
      { number: 8, state: 'MERGED', headRefName: 'abc/ABC-5-squashed', headRefOid: 'squash-tip', mergedAt: iso(40), url: 'u8' },
    ],
    'your-org/other': [
      { number: 3, state: 'MERGED', headRefName: 'abc/ABC-1-thing', mergedAt: iso(2), url: 'u3', title: 'thing' },
      { number: 2, state: 'MERGED', headRefName: 'abc/ABC-1-older', mergedAt: iso(30), url: 'u2' },
    ],
  },
}

test('branch → item key follows <space>/<KEY>-slug, case-insensitively', () => {
  assert.equal(parseBranchKey('abc/ABC-168-flow-view'), 'ABC-168')
  assert.equal(parseBranchKey('XYZ/XYZ-1064-some-port'), 'XYZ-1064')
  assert.equal(parseBranchKey('abc/abc-22-backlog'), 'ABC-22')
  assert.equal(parseBranchKey('refs/heads/abc/ABC-7'), 'ABC-7')
  assert.equal(parseBranchKey('ABC-12_underscore'), 'ABC-12')
  // Not a key: no digits, key not opening a segment, or digits running into letters.
  assert.equal(parseBranchKey('ci/codeql-blueprint'), null)
  assert.equal(parseBranchKey('lane-abc-933'), null)
  assert.equal(parseBranchKey('feat/abc-12x'), null)
  assert.equal(parseBranchKey(null), null)
})

test('noise filter drops tool state and keeps real files', () => {
  for (const p of ['.DS_Store', 'a/b/.DS_Store', '.claude-flow/x.json', '.claude/settings.local.json', '.idea/', 'pkg/__pycache__/m.pyc', 'agentdb.rvf', 'agentdb.rvf.lock', 'ruvector.db', 'memory.db-wal']) {
    assert.equal(isNoise(p), true, p)
  }
  for (const p of ['src/index.js', 'README.md', 'docs/claude-notes.md', 'memory.db', '.github/workflows/ci.yml']) {
    assert.equal(isNoise(p), false, p)
  }
})

test('git output parsers', () => {
  const wts = parseWorktrees('worktree /src/app\nHEAD aaa\nbranch refs/heads/main\n\nworktree /wt/x\nHEAD bbb\ndetached\n\nworktree /wt/gone\nHEAD ccc\nbranch refs/heads/f\nprunable gitdir file points to non-existent location\n')
  assert.deepEqual(wts.map((w) => [w.path, w.branch, w.detached, w.main, w.prunable]), [
    ['/src/app', 'main', false, true, false], ['/wt/x', null, true, false, false], ['/wt/gone', 'f', false, false, true],
  ])
  const st = parseStatus(' M src/a.js\0?? new.txt\0R  to.js\0from.js\0 D gone.js\0')
  assert.deepEqual(st.map((s) => s.path), ['src/a.js', 'new.txt', 'to.js'])
  const refs = parseRefs('refs/heads/main\torigin/main\t[behind 2]\t1700000000\tabc\nrefs/heads/x\torigin/x\t[gone]\t1700000000\tdef\nrefs/remotes/origin/Main\t\t\t1700000000\tabc\n')
  assert.deepEqual(refs.heads.map((h) => [h.name, h.gone, h.sha]), [['main', false, 'abc'], ['x', true, 'def']])
  assert.ok(refs.remotes.has('origin/main'))
  assert.equal(countCherry('+ a\n- b\n+ c\n'), 2)
  assert.equal(githubSlug('git@github.com:your-org/app.git'), 'your-org/app')
  assert.equal(githubSlug('https://github.com/your-org/app'), 'your-org/app')
  assert.equal(githubSlug('https://gitlab.com/your-org/app.git'), null)
})

test('check rollup summarizes to one word', () => {
  assert.equal(summarizeChecks([]), 'none')
  assert.equal(summarizeChecks([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'SUCCESS' }]), 'passing')
  assert.equal(summarizeChecks([{ status: 'IN_PROGRESS', conclusion: '' }, { status: 'COMPLETED', conclusion: 'SUCCESS' }]), 'pending')
  assert.equal(summarizeChecks([{ status: 'IN_PROGRESS' }, { status: 'COMPLETED', conclusion: 'FAILURE' }]), 'failing')
  assert.equal(summarizeChecks([{ state: 'ERROR' }]), 'failing')
})

test('merged means patch-equivalent, or a merged PR whose head is this tip', () => {
  assert.equal(isMerged({ unmerged: 0 }, null), true)
  assert.equal(isMerged({ unmerged: 2, sha: 't' }, { state: 'MERGED', headRefOid: 't' }), true)
  assert.equal(isMerged({ unmerged: 2, sha: 't' }, { state: 'MERGED', headRefOid: 'other' }), false)
  assert.equal(isMerged({ unmerged: 2, sha: 't' }, { state: 'OPEN', headRefOid: 't' }), false)
})

test('drift classification from fixtures', () => {
  const alarms = classifyDrift({ repos: [fixtureRepo()], github, items, now: NOW, mergedWindowDays: 14, staleDays: 7 })
  const by = (kind) => alarms.filter((a) => a.kind === kind)

  // Only on disk: no remote branch; a branch tracking the base itself counts as unpushed.
  assert.deepEqual(by('only-on-disk').map((a) => a.branch).sort(), ['abc/ABC-9-local-only', 'ci/tracks-main'])
  // Pushed, unmerged, no PR for its head.
  assert.deepEqual(by('unmerged-no-pr').map((a) => a.branch), ['feature/pushed-no-pr'])
  // Merged in the window, item not DONE; the older merge outside the window is ignored.
  assert.deepEqual(by('merged-not-done').map((a) => [a.key, a.evidence.pr.number]), [['ABC-1', 3]])
  // IN REVIEW with no open PR: ABC-4 only — ABC-3 has one, ABC-1 is already reported as merged.
  assert.deepEqual(by('in-review-no-pr').map((a) => a.key), ['ABC-4'])
  // Worktrees on merged branches: patch-equivalent (matched despite case) and squash-merged.
  assert.deepEqual(by('worktree-merged').map((a) => a.path).sort(), ['/wt/merged', '/wt/squashed'])
  // Stale uncommitted: noise ignored, age from the oldest real file.
  const stale = by('stale-uncommitted')
  assert.equal(stale.length, 1)
  assert.equal(stale[0].path, '/wt/stale')
  assert.equal(stale[0].evidence.files, 2)
  assert.equal(stale[0].evidence.oldest.days, 30)

  // Severity order, with only-on-disk and merged-not-done leading.
  assert.deepEqual(alarms.slice(0, 3).map((a) => a.kind), ['only-on-disk', 'only-on-disk', 'merged-not-done'])
  assert.equal(alarms.at(-1).severity, 'low')
})

test('without GitHub, PR-dependent alarms are skipped, not guessed', () => {
  const alarms = classifyDrift({ repos: [fixtureRepo()], github: { available: false }, items, now: NOW })
  const kinds = new Set(alarms.map((a) => a.kind))
  for (const k of ['merged-not-done', 'in-review-no-pr', 'unmerged-no-pr']) assert.equal(kinds.has(k), false, k)
  assert.ok(kinds.has('only-on-disk'))
})

test('a repository with no remote is one low alarm, not one per branch', () => {
  const alarms = classifyDrift({ repos: [fixtureRepo({ remote: null, base: null, slug: null })], github, items: new Map(), now: NOW })
  assert.deepEqual(alarms.map((a) => [a.kind, a.severity]), [['no-remote', 'low']])
})

test('stale threshold: fresh uncommitted work is not an alarm', () => {
  const repo = fixtureRepo({ worktrees: [{ path: '/wt/fresh', branch: 'main', main: true, dirty: [{ path: 'a.js', mtimeMs: ago(1) }] }] })
  assert.equal(classifyDrift({ repos: [repo], github, items, now: NOW, staleDays: 7 }).some((a) => a.kind === 'stale-uncommitted'), false)
})

test('waiting for the PO: enriched from the repo lists, drafts last', () => {
  const rows = waitingForPo({
    search: [
      { repository: { nameWithOwner: 'your-org/app' }, number: 10, title: 'ready', url: 'u10', isDraft: false, createdAt: iso(5) },
      { repository: { nameWithOwner: 'your-org/app' }, number: 11, title: 'draft', url: 'u11', isDraft: true, createdAt: iso(9) },
    ],
    prsByRepo: github.prsByRepo,
    checksByRepo: { 'your-org/app': { 10: [{ status: 'COMPLETED', conclusion: 'FAILURE' }] } },
    items, now: NOW,
  })
  assert.deepEqual(rows.map((r) => r.number), [10, 11])
  assert.equal(rows[0].ageDays, 5)
  assert.equal(rows[0].checks, 'failing')
  assert.equal(rows[0].reviewDecision, 'REVIEW_REQUIRED')
  assert.equal(rows[0].item.id, 'ABC-3')
  assert.equal(rows[1].item, null)
})

test('lanes: one row per worktree, with PR state, merge state and ledger session', () => {
  const ledger = { lanes: [{ path: '/wt/stale', session: 'lane-7' }] }
  const rows = laneRows({ repos: [fixtureRepo()], github, items, ledger })
  assert.equal(rows.length, 4)
  const at = (p) => rows.find((r) => r.path === p)
  assert.equal(at('/src/app').merged, null) // the base branch is neither merged nor not
  assert.equal(at('/src/app').dirty, 0) // .DS_Store is noise
  assert.equal(at('/wt/merged').merged, true)
  assert.equal(at('/wt/squashed').merged, true)
  assert.deepEqual([at('/wt/stale').pr.number, at('/wt/stale').pr.state, at('/wt/stale').item.id], [10, 'OPEN', 'ABC-3'])
  assert.equal(at('/wt/stale').session, 'lane-7')
  assert.equal(at('/wt/merged').session, null)
  assert.equal(laneRows({ repos: [fixtureRepo()], github, items, ledger: null })[0].session, null)
})
