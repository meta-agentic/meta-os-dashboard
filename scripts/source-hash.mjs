// Content hash of the API's own source tree. The signal this answers is narrow and
// deliberate: "would starting a fresh server right now behave differently from the one
// already running" — not a release version, which doesn't move between commits and would
// be useless for a dev-time reuse check where nothing is ever tagged.
//
// Used from three places that all need the same answer independently: the server reports
// its own hash (server/index.mjs, `/api/version`), Vite computes what the frontend should
// expect (vite.config.js, at its own startup), and the dev launcher decides whether an
// already-running server is safe to reuse (scripts/dev.mjs) — hence a shared module rather
// than three copies that could drift (see MOS-146's own sibling lesson, IAM-54).
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const serverDir = new URL('../server', import.meta.url).pathname

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await collectFiles(full)))
    else if (entry.name.endsWith('.mjs')) files.push(full)
  }
  return files
}

export async function computeSourceHash() {
  const files = (await collectFiles(serverDir)).sort()
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(path.relative(serverDir, file))
    hash.update('\0')
    hash.update(await fs.readFile(file))
  }
  return hash.digest('hex').slice(0, 12)
}
