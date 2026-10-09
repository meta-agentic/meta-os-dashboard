// ADR register — the pure half: which vault files are ADRs, what one says about
// itself, and which decisions it records. No I/O here, so the local and GitHub
// readers (adrs.mjs, github-adrs.mjs) share every rule and the tests need no vault.
//
// Read-only by construction: nothing in this module or its readers writes. A status
// is reported exactly as the file states it; one outside the standard vocabulary is
// shown as nonstandard with its raw value, never coerced into the nearest match.
import path from 'node:path'
import matter from 'gray-matter'

export const STATUSES = ['Proposed', 'Accepted', 'Superseded', 'Rejected', 'Deprecated']
export const NONSTANDARD = 'nonstandard'

// Front-matter fields the detail panel shows as they are, after the ones it derives.
const FIELDS = ['project', 'supersedes', 'supersededBy', 'gates', 'deliverableOf']
const SKIP_DIRS = new Set(['attachments', 'drafts', 'draft', 'node_modules'])
// A decision's own marker: in parentheses or bold in its title, or after a dash in it
// (`D4 — Old choice — superseded by D7`), or opening the callout right under its
// heading. A title that merely starts with or mentions the word is not a marker.
const MARKER_TITLE = /(?:\(|\*\*|\s[—–]\s*)\s*(superseded|reopened)\b/i
const MARKER_LEAD = /^(?:>\s*)?(?:\*\*|_)?\s*(superseded|reopened)\b/i

// Natural order for ids like ADR-ABC-2 < ADR-ABC-10.
export const idKey = (id) => String(id ?? '').replace(/\d+/g, (n) => n.padStart(8, '0'))

// Case-insensitive onto the five standard statuses; anything else, empty included,
// is nonstandard and keeps its raw value so the widget can show what is really there.
export function normalizeStatus(raw) {
  const text = raw == null ? '' : Array.isArray(raw) ? raw.join(', ') : String(raw).trim()
  const hit = STATUSES.find((s) => s.toLowerCase() === text.toLowerCase())
  return hit ? { value: hit, standard: true, raw: text } : { value: NONSTANDARD, standard: false, raw: text }
}

// A space-relative path that may never hold an ADR: hidden directories (.claude, .git
// and the like), attachments, drafts, and folder indexes.
export function isExcluded(rel) {
  const parts = rel.split('/')
  const base = parts[parts.length - 1]
  if (parts.slice(0, -1).some((p) => p.startsWith('.') || SKIP_DIRS.has(p.toLowerCase()))) return true
  return base.startsWith('.') || base === '_index.md' || /draft/i.test(base) || !base.endsWith('.md')
}

// The name rule: ADR-*.md anywhere under the space's wiki/ (wiki/adr/ included).
export const namedAdr = (rel) => {
  const parts = rel.split('/')
  return parts[0] === 'wiki' && /^ADR-.+\.md$/.test(parts[parts.length - 1])
}

// Cheap pre-check before a full parse: does the front-matter block say kind: adr?
// Lets a reader skip the hundreds of item files a space holds without parsing them.
export function declaresAdr(text) {
  if (typeof text !== 'string' || !text.startsWith('---')) return false
  const end = text.indexOf('\n---', 3)
  return /^kind:\s*['"]?adr['"]?\s*$/im.test(end === -1 ? text : text.slice(0, end))
}

const asList = (v) => (v == null || v === '' ? [] : (Array.isArray(v) ? v : [v]).map(String).filter(Boolean))

function asDate(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  return v == null || v === '' ? null : String(v)
}

// Inline markdown stripped for display: emphasis, code ticks, wiki and plain links.
const plain = (s) =>
  String(s ?? '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b ?? a)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

// Body lines outside fenced code blocks, each with its 1-based line in the file. A
// fence holds examples (front-matter samples, commands), never the ADR's own words.
function proseLines(text, content) {
  const offset = text.endsWith(content) ? text.slice(0, text.length - content.length).split('\n').length - 1 : 0
  const out = []
  let fence = null
  content.split('\n').forEach((raw, i) => {
    const f = raw.match(/^\s*(`{3,}|~{3,})/)
    if (f) {
      if (!fence) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
      return
    }
    if (!fence) out.push({ text: raw, line: offset + i + 1 })
  })
  return out
}

const heading = (s) => {
  const m = s.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/)
  return m ? { level: m[1].length, text: m[2] } : null
}

// What the body itself declares before its first section — the status table older
// ADRs carry (| **Status** | … |) or a **Status:** line. Reported next to an empty or
// odd front-matter status as a hint; it never replaces the front-matter value.
function declared(lines) {
  const out = {}
  for (const { text } of lines) {
    if (/^##\s/.test(text)) break
    for (const key of ['status', 'date']) {
      if (out[key]) continue
      const row = text.match(new RegExp(`^\\|\\s*\\**${key}\\**\\s*\\|\\s*(.+?)\\s*\\|?\\s*$`, 'i'))
      const line = key === 'status' && text.match(/^\*\*Status:?\*\*:?\s*(.+)$|^\*\*Status:\s*([^*]+)\*\*/i)
      const v = row?.[1] ?? (line ? line[1] ?? line[2] : null)
      if (v) out[key] = plain(v).slice(0, 160)
    }
  }
  return out.status || out.date ? out : null
}

// A leading [tag] on a decision title: [decision], [open], [evidence, 2026-01-02].
// The tag's first word is the status; anything after it is kept as a note.
function splitTag(title) {
  const m = title.match(/^\[([^\]]+)\]\s*(.*)$/)
  if (!m) return { tag: null, title }
  const [word, ...rest] = m[1].split(/[,;:]|\s+/).filter(Boolean)
  return { tag: { value: word.toLowerCase(), raw: m[1].trim(), note: m[1].slice(m[1].indexOf(word) + word.length).replace(/^[\s,;:]+/, '') || null }, title: m[2] }
}

// The status a decision carries. Its own superseded/reopened marker wins (it is the
// later fact), then its own tag; otherwise it inherits the ADR's status, and says so.
function decisionStatus({ rawTitle, tag, lead }, adrStatus) {
  const marker = rawTitle.match(MARKER_TITLE) ?? (lead ? lead.match(MARKER_LEAD) : null)
  if (marker) return { value: marker[1].toLowerCase(), source: 'marker', raw: marker[1], note: null }
  if (tag) return { value: tag.value, source: 'tag', raw: tag.raw, note: tag.note }
  return { value: adrStatus.value, source: 'inherited', raw: adrStatus.raw, note: null }
}

// The first prose line after `i` inside the same section — where a decision would put
// a "> Superseded by …" callout of its own.
function leadLine(lines, i, level) {
  for (let k = i + 1; k < lines.length; k++) {
    const h = heading(lines[k].text)
    if (h && h.level <= level) return null
    if (lines[k].text.trim()) return lines[k].text.trim()
  }
  return null
}

// Form 1: `### D<n> — <title>` headings, anywhere in the body.
function headingDecisions(lines) {
  const out = []
  lines.forEach(({ text, line }, i) => {
    const h = heading(text)
    const m = h && h.level >= 2 && h.level <= 4 && h.text.match(/^D(\d+[a-z]?)\b\s*(?:[—–:-]+\s*)?(.*)$/)
    if (!m) return
    const { tag, title } = splitTag(m[2].trim())
    out.push({ ref: `D${m[1]}`, title: plain(title), rawTitle: title, tag, line, lead: leadLine(lines, i, h.level) })
  })
  return out
}

// Form 2, used only when form 1 finds nothing: the numbered decisions of the
// `## Decision` section (`## Decision (proposed)`, `## Decisions — …` and
// `## The decision` included). Numbered `### 1. …` sub-headings are the decisions when
// the section has them; otherwise its top-level `1. **…**` items are. `section` is the
// section's own line, so a prose-only decision can still be linked to.
function listDecisions(lines) {
  const heads = []
  const items = []
  let section = null
  let inside = false
  lines.forEach(({ text, line }, i) => {
    const h = heading(text)
    if (h && h.level <= 2) {
      inside = h.level === 2 && /^(the\s+)?decisions?\b/i.test(h.text)
      if (inside && section == null) section = line
    }
    if (!inside) return
    const sub = h?.level === 3 && h.text.match(/^(\d+)\.\s+(.*)$/)
    if (sub) {
      const { tag, title } = splitTag(sub[2].trim())
      heads.push({ ref: sub[1], title: plain(title), rawTitle: title, tag, line, lead: leadLine(lines, i, 3) })
      return
    }
    // The bold lead may wrap onto the next line; then the rest of this line is the title.
    const m = text.match(/^(\d+)\.\s+\*\*(.+?)(?:\*\*(.*))?$/)
    if (!m) return
    let { tag, title } = splitTag(m[2].trim())
    if (tag && !title) title = (m[3] ?? '').trim()
    items.push({ ref: m[1], title: plain(title).replace(/[.:]$/, ''), rawTitle: title, tag, line, lead: null })
  })
  return { section, decisions: heads.length ? heads : items }
}

// One file → one ADR record, or null when it is not an ADR. `rel` is the path inside
// the space (posix separators), which is also how the detail endpoint finds it again.
export function parseAdr(text, { space, rel }) {
  if (typeof text !== 'string' || isExcluded(rel)) return null
  let doc
  try {
    doc = matter(text)
  } catch {
    doc = null
  }
  const fm = doc?.data ?? {}
  const isKind = String(fm.kind ?? '').toLowerCase() === 'adr'
  if (!isKind && !namedAdr(rel)) return null
  if (fm.draft === true) return null

  const problems = []
  if (!doc) problems.push('front-matter unreadable')
  const lines = proseLines(text, doc ? doc.content : text)
  const h1 = lines.map((l) => heading(l.text)).find((h) => h?.level === 1)
  const stem = path.posix.basename(rel, '.md')
  const fileId = stem.match(/^(ADR-[A-Za-z0-9]+-\d+)/)?.[1] ?? null
  const id = String(fm.id ?? fm.adrId ?? fileId ?? stem)
  if (!fm.id && !fm.adrId) problems.push('no id in front-matter — taken from the file name')
  const title = fm.title ? plain(fm.title) : h1 ? plain(h1.text.replace(/^ADR-[A-Za-z0-9]+-\d+\s*[—–:-]+\s*/, '')) : null
  if (!fm.title) problems.push(h1 ? 'no title in front-matter — taken from the first heading' : 'no title')
  const status = normalizeStatus(fm.status)
  if (!status.raw) problems.push('no status in front-matter')
  else if (!status.standard) problems.push(`status "${status.raw}" is not a standard ADR status`)
  const date = asDate(fm.date)
  if (!date) problems.push('no date in front-matter')

  const found = headingDecisions(lines)
  const listed = listDecisions(lines)
  const form = found.length ? 'heading' : 'numbered'
  const raw = found.length ? found : listed.decisions
  const decisions = raw.map(({ ref, title: t, rawTitle, tag, line, lead }) => ({
    ref, title: t, line, status: decisionStatus({ rawTitle, tag, lead }, status),
  }))

  return {
    id, space, path: rel, title, date, status,
    project: fm.project != null ? String(fm.project) : null,
    supersedes: asList(fm.supersedes),
    supersededBy: asList(fm.supersededBy),
    gates: asList(fm.gates),
    deliverableOf: asList(fm.deliverableOf),
    declared: declared(lines),
    decisionForm: decisions.length ? form : null,
    decisionSection: listed.section,
    decisions,
    problems,
  }
}

// List row: everything but the decisions themselves.
export const adrRow = ({ decisions, ...rest }) => ({ ...rest, decisionCount: decisions.length })

// Records → the register: one group per space with a count per status. Duplicate ids
// inside a space are flagged on every copy — the detail lookup can only reach one.
export function register(records, failed = []) {
  const bySpace = new Map()
  for (const r of records) {
    if (!bySpace.has(r.space)) bySpace.set(r.space, [])
    bySpace.get(r.space).push(r)
  }
  const spaces = [...bySpace.keys()].sort().map((space) => {
    const list = bySpace.get(space).sort((a, b) => idKey(a.id).localeCompare(idKey(b.id)) || a.path.localeCompare(b.path))
    const seen = new Map()
    for (const r of list) seen.set(r.id, (seen.get(r.id) ?? 0) + 1)
    const counts = Object.fromEntries([...STATUSES, NONSTANDARD].map((s) => [s, 0]))
    for (const r of list) counts[r.status.value] += 1
    const adrs = list.map((r) => {
      const row = adrRow(r)
      return seen.get(r.id) > 1 ? { ...row, problems: [...row.problems, `id ${r.id} is used by more than one file`] } : row
    })
    return { space, total: list.length, counts, adrs }
  })
  return { available: true, statuses: [...STATUSES, NONSTANDARD], total: records.length, spaces, failed }
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
export const validId = (id) => typeof id === 'string' && SAFE_ID.test(id)
