// ADR register for deployed (GitHub) mode — the remote twin of adrs.mjs, sharing its
// parser. Read-only: it reads the cached tree and batches file contents through
// readManyText, whose blob-sha cache the vault-native backlog already warms.
import { parseAdr, isExcluded, namedAdr, declaresAdr, register, validId } from './adr-parse.mjs'

const unavailable = (reason) => ({ available: false, reason })
const DOCUMENT = 'backlog is a pre-built JSON document — no vault files to scan'

async function scanSpace(b) {
  const tree = await b.repo.ensureTree()
  const prefix = b.path ? `${b.path.replace(/\/$/, '')}/` : ''
  const rels = [...tree.keys()]
    .filter((p) => p.startsWith(prefix) && p.endsWith('.md'))
    .map((p) => p.slice(prefix.length))
    .filter((rel) => !isExcluded(rel))
  const texts = await b.repo.readManyText(rels.map((rel) => prefix + rel))
  const records = []
  for (const rel of rels) {
    const text = texts.get(prefix + rel)
    if (typeof text !== 'string' || (!namedAdr(rel) && !declaresAdr(text))) continue
    const r = parseAdr(text, { space: b.space, rel })
    if (r) records.push(r)
  }
  return records
}

export async function adrs(ctx) {
  if (!ctx.backlogs?.length) return unavailable('no backlogs configured in github.backlogs')
  const records = []
  const failed = []
  for (const b of ctx.backlogs) {
    if (b.mode === 'document') {
      failed.push({ space: b.space, reason: DOCUMENT })
      continue
    }
    try {
      records.push(...(await scanSpace(b)))
    } catch (e) {
      failed.push({ space: b.space, reason: e.message })
    }
  }
  return register(records, failed)
}

// File Preview's GitHub roots are the instance and framework repos only, so the full
// ADR cannot be opened there; the panel says so instead of offering a dead link.
export async function adrDetail(ctx, space, id) {
  const b = (ctx.backlogs ?? []).find((x) => x.space === space)
  if (!b) return unavailable(space ? `no backlog configured for space "${space}"` : 'no space selected')
  if (!validId(id)) return unavailable('no valid ADR id given')
  if (b.mode === 'document') return unavailable(DOCUMENT)
  try {
    const adr = (await scanSpace(b)).find((r) => r.id === id)
    if (!adr) return unavailable(`no ADR ${id} in ${space}`)
    return {
      available: true, space, adr, preview: null,
      previewReason: `File Preview cannot browse the vault repository in GitHub mode — the file is ${b.repo.label()}:${b.path}/${adr.path}`,
    }
  } catch (e) {
    return unavailable(`ADR unreadable: ${e.message}`)
  }
}
