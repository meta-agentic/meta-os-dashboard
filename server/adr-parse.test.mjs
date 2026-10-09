// node --test server/
// The ADR parser on synthetic ADRs only: both decision forms, tagged and marked
// decisions, status normalisation, and which paths count as ADRs at all.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeStatus, isExcluded, namedAdr, declaresAdr, parseAdr, register, validId } from './adr-parse.mjs'

const fm = (fields) => `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`

test('statuses normalise case-insensitively onto the five standard values', () => {
  for (const [raw, value] of [['proposed', 'Proposed'], ['ACCEPTED', 'Accepted'], [' Superseded ', 'Superseded'], ['rejected', 'Rejected'], ['Deprecated', 'Deprecated']]) {
    assert.deepEqual(normalizeStatus(raw), { value, standard: true, raw: raw.trim() })
  }
})

test('anything else is nonstandard and keeps its raw value — never coerced', () => {
  for (const raw of ['TO DO', 'DONE', 'Accepted (direction)', 'draft']) {
    assert.deepEqual(normalizeStatus(raw), { value: 'nonstandard', standard: false, raw })
  }
  assert.deepEqual(normalizeStatus(undefined), { value: 'nonstandard', standard: false, raw: '' })
  assert.deepEqual(normalizeStatus(''), { value: 'nonstandard', standard: false, raw: '' })
  assert.deepEqual(normalizeStatus(null), { value: 'nonstandard', standard: false, raw: '' })
})

test('exclusions: hidden directories, attachments, drafts and indexes', () => {
  assert.equal(isExcluded('wiki/adr/ADR-ABC-01-x.md'), false)
  assert.equal(isExcluded('.claude/worktrees/w/wiki/ADR-ABC-01.md'), true)
  assert.equal(isExcluded('wiki/.git/ADR-ABC-01.md'), true)
  assert.equal(isExcluded('attachments/ABC-9/ADR-ABC-01.md'), true)
  assert.equal(isExcluded('wiki/drafts/ADR-ABC-02.md'), true)
  assert.equal(isExcluded('wiki/adr/ADR-draft.md'), true)
  assert.equal(isExcluded('wiki/adr/ADR-ABC-03.draft.md'), true)
  assert.equal(isExcluded('wiki/adr/_index.md'), true)
  assert.equal(isExcluded('wiki/adr/ADR-ABC-01.txt'), true)
})

test('the name rule needs ADR-*.md under wiki/; the kind rule reads front-matter only', () => {
  assert.equal(namedAdr('wiki/ADR-ABC-01-x.md'), true)
  assert.equal(namedAdr('wiki/adr/ADR-ABC-01-x.md'), true)
  assert.equal(namedAdr('raw/ADR-ABC-01-x.md'), false)
  assert.equal(namedAdr('wiki/notes.md'), false)
  assert.equal(declaresAdr(fm({ kind: 'adr' })), true)
  assert.equal(declaresAdr(fm({ kind: "'ADR'" })), true)
  assert.equal(declaresAdr(fm({ kind: 'story' }) + '\nkind: adr\n'), false)
  assert.equal(declaresAdr('# no front-matter\nkind: adr\n'), false)
})

test('a kind: adr file outside wiki/ is an ADR; a plain wiki note is not', () => {
  const r = parseAdr(fm({ kind: 'adr', id: 'ADR-ABC-07', title: 'Elsewhere', status: 'Accepted', date: '2026-01-02' }), { space: 'abc', rel: 'raw/ADR-ABC-07.md' })
  assert.equal(r.id, 'ADR-ABC-07')
  assert.equal(r.date, '2026-01-02')
  assert.deepEqual(r.problems, [])
  assert.equal(parseAdr(fm({ kind: 'note', title: 'x' }), { space: 'abc', rel: 'wiki/notes.md' }), null)
  assert.equal(parseAdr(fm({ kind: 'adr', draft: 'true' }), { space: 'abc', rel: 'wiki/adr/ADR-ABC-08.md' }), null)
})

const FORM1 = fm({ kind: 'adr', id: 'ADR-ABC-01', title: 'Heading form', status: 'proposed', date: '2026-01-02', supersedes: '[ADR-ABC-00]', gates: 'ABC-5' }) + `
# ADR-ABC-01 — Heading form

## Context

### [evidence] Not a decision: no D number

## Decision

### D1 — First choice

Body.

### D2 — [decision] Tagged choice

### D3 — [open] Waiting on the owner

### D3a — [evidence, 2026-01-03] A follow-up finding

### D4 — Reversed later (superseded by D5)

### D5 — Brought back

> **Reopened** after the review.

### D6 — Superseded tables are mentioned here but not marked

\`\`\`markdown
### D9 — inside a fence, never a decision
status: DONE
\`\`\`
`

test('form 1: ### D<n> headings, with tags, markers and inheritance', () => {
  const r = parseAdr(FORM1, { space: 'abc', rel: 'wiki/adr/ADR-ABC-01-heading-form.md' })
  assert.equal(r.decisionForm, 'heading')
  assert.equal(r.status.value, 'Proposed')
  assert.deepEqual(r.supersedes, ['ADR-ABC-00'])
  assert.deepEqual(r.gates, ['ABC-5'])
  const got = r.decisions.map((d) => [d.ref, d.status.value, d.status.source])
  assert.deepEqual(got, [
    ['D1', 'Proposed', 'inherited'],
    ['D2', 'decision', 'tag'],
    ['D3', 'open', 'tag'],
    ['D3a', 'evidence', 'tag'],
    ['D4', 'superseded', 'marker'],
    ['D5', 'reopened', 'marker'],
    ['D6', 'Proposed', 'inherited'],
  ])
  assert.equal(r.decisions[1].title, 'Tagged choice')
  assert.equal(r.decisions[3].status.note, '2026-01-03')
  assert.equal(r.decisions[0].status.raw, 'proposed')
  // Lines are file lines, so a section link lands on the heading itself.
  assert.equal(FORM1.split('\n')[r.decisions[0].line - 1], '### D1 — First choice')
})

const FORM2 = fm({ kind: 'adr', id: 'ADR-ABC-02', title: 'List form', status: 'ACCEPTED', date: '2026-01-04' }) + `
## Context

1. **Not a decision** — outside the Decision section.

## Decision (proposed)

1. **Adopt the first thing.** Because.
2. **[open] Name the second thing** later.
3. **[decision]** The third thing, tagged after the bold.
4. **[proposed] A bold lead that wraps onto
   the next line** still counts.
   1. **Nested items are not decisions.**

## Consequences

1. **Also not a decision.**
`

test('form 2: numbered bold items under ## Decision, only when form 1 is absent', () => {
  const r = parseAdr(FORM2, { space: 'abc', rel: 'wiki/adr/ADR-ABC-02.md' })
  assert.equal(r.decisionForm, 'numbered')
  assert.deepEqual(r.decisions.map((d) => [d.ref, d.title, d.status.value, d.status.source]), [
    ['1', 'Adopt the first thing', 'Accepted', 'inherited'],
    ['2', 'Name the second thing', 'open', 'tag'],
    ['3', 'The third thing, tagged after the bold', 'decision', 'tag'],
    ['4', 'A bold lead that wraps onto', 'proposed', 'tag'],
  ])
})

test('form 2 also reads numbered ### headings under ## The decision', () => {
  const text = fm({ kind: 'adr', id: 'ADR-ABC-03', title: 'Numbered headings', status: 'Rejected', date: '2026-01-05' }) + `
## The decision

### 1. One

1. **A list inside a numbered heading is detail, not a decision.**

### 2. Two

## Alternatives
`
  const r = parseAdr(text, { space: 'abc', rel: 'wiki/ADR-ABC-03.md' })
  assert.deepEqual(r.decisions.map((d) => [d.ref, d.title, d.status.value]), [['1', 'One', 'Rejected'], ['2', 'Two', 'Rejected']])
})

test('a prose-only decision has no decisions but keeps the section line', () => {
  const text = fm({ kind: 'adr', id: 'ADR-ABC-04', title: 'Prose', status: 'Deprecated', date: '2026-01-06' }) + '\n## Decision\nWe do the thing.\n'
  const r = parseAdr(text, { space: 'abc', rel: 'wiki/ADR-ABC-04.md' })
  assert.deepEqual(r.decisions, [])
  assert.equal(r.decisionForm, null)
  assert.equal(text.split('\n')[r.decisionSection - 1], '## Decision')
})

test('missing fields are reported, derived from the file and body, never invented', () => {
  const text = fm({ kind: 'adr', space: 'abc' }) + `
# ADR-ABC-05 — Derived title

| | |
|---|---|
| **Status** | Accepted (direction) |
| **Date** | 2026-01-07 |

\`\`\`yaml
status: TO DO
\`\`\`
`
  const r = parseAdr(text, { space: 'abc', rel: 'wiki/adr/ADR-ABC-05-derived.md' })
  assert.equal(r.id, 'ADR-ABC-05')
  assert.equal(r.title, 'Derived title')
  assert.deepEqual(r.status, { value: 'nonstandard', standard: false, raw: '' })
  assert.equal(r.date, null)
  assert.deepEqual(r.declared, { status: 'Accepted (direction)', date: '2026-01-07' })
  assert.equal(r.problems.length, 4)
  assert.ok(r.problems.includes('no status in front-matter'))
})

test('a nonstandard front-matter status is flagged with its raw value', () => {
  const r = parseAdr(fm({ kind: 'adr', id: 'ADR-ABC-06', title: 't', status: 'TO DO', date: '2026-01-08' }), { space: 'abc', rel: 'wiki/ADR-ABC-06.md' })
  assert.deepEqual(r.status, { value: 'nonstandard', standard: false, raw: 'TO DO' })
  assert.deepEqual(r.problems, ['status "TO DO" is not a standard ADR status'])
})

test('register groups by space, counts per status, and flags duplicate ids', () => {
  const mk = (space, id, status, rel = `wiki/${id}.md`) => parseAdr(fm({ kind: 'adr', id, title: id, status, date: '2026-01-01' }), { space, rel })
  const reg = register([
    mk('abc', 'ADR-ABC-10', 'Accepted'), mk('abc', 'ADR-ABC-2', 'proposed'), mk('abc', 'ADR-ABC-2', 'DONE', 'wiki/adr/ADR-ABC-2-copy.md'),
    mk('xyz', 'ADR-XYZ-01', 'Superseded'),
  ])
  assert.equal(reg.total, 4)
  assert.deepEqual(reg.spaces.map((s) => [s.space, s.total]), [['abc', 3], ['xyz', 1]])
  const abc = reg.spaces[0]
  assert.deepEqual(abc.counts, { Proposed: 1, Accepted: 1, Superseded: 0, Rejected: 0, Deprecated: 0, nonstandard: 1 })
  assert.deepEqual(abc.adrs.map((a) => a.id), ['ADR-ABC-2', 'ADR-ABC-2', 'ADR-ABC-10'])
  assert.ok(abc.adrs[0].problems.some((p) => p.includes('more than one file')))
  assert.equal(abc.adrs[0].decisions, undefined)
  assert.equal(abc.adrs[0].decisionCount, 0)
})

test('ids accepted by the detail lookup are plain tokens', () => {
  assert.equal(validId('ADR-ABC-01'), true)
  for (const bad of ['', '../x', 'a/b', '..', '.hidden', 'x'.repeat(200), undefined]) assert.equal(validId(bad), false)
})
