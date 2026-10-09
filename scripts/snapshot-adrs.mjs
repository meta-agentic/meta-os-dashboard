// ADR register snapshots for the static build: the list, plus one detail document per
// ADR named adr-<space>-<id>.json (api.js snapshotName maps /api/adr to the same name).
//
// The id comes from vault front-matter, so it is untrusted as a file name: an id that
// fails validId (a slash, `..`, anything but a plain token) gets no detail file and is
// logged, and api.js refuses the same ids, so the page reports the detail as absent
// instead of fetching a path outside snapshots/. The resolved path is re-checked too.
import fs from 'node:fs/promises'
import path from 'node:path'
import { adrs, adrDetail } from '../server/adrs.mjs'
import { validId } from '../server/adr-parse.mjs'

const STATIC_PREVIEW = 'File Preview needs the live API — not available on a static snapshot'

export async function snapshotAdrs(backlogs, outDir, log = console.log) {
  const root = path.resolve(outDir)
  const write = async (name, data) => {
    const file = path.resolve(root, `${name}.json`)
    if (path.dirname(file) !== root) throw new Error(`snapshot name escapes ${root}: ${name}`)
    await fs.writeFile(file, JSON.stringify(data))
    log(`  ${name}.json`)
  }
  const register = await adrs(backlogs)
  await write('adrs', register)
  const skipped = []
  for (const s of register.spaces ?? []) {
    for (const a of s.adrs) {
      if (!validId(s.space) || !validId(a.id)) {
        skipped.push(`${s.space}/${a.id}`)
        log(`  skipped ADR detail for ${JSON.stringify(`${s.space}/${a.id}`)} — not a plain id, no file written`)
        continue
      }
      const d = await adrDetail(backlogs, {}, s.space, a.id)
      await write(`adr-${s.space}-${a.id}`, { ...d, preview: null, previewReason: d.available ? STATIC_PREVIEW : null })
    }
  }
  return { skipped }
}
