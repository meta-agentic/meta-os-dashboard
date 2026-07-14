// Per-user dashboard board persistence. One JSON file per user key under <dataDir>/boards/.
// The key is advisory today (single-user 'local'); once Tessera token verification is
// wired server-side, derive it from the verified subject instead of the query param.
import fs from 'node:fs/promises'
import path from 'node:path'

const safeKey = (k) => ((k || 'local').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'local')
const fileFor = (dataDir, user) => path.join(dataDir, 'boards', safeKey(user) + '.json')

export async function loadBoards(dataDir, user) {
  try {
    return JSON.parse(await fs.readFile(fileFor(dataDir, user), 'utf8'))
  } catch {
    return null // no saved boards for this user yet
  }
}

export async function saveBoards(dataDir, user, doc) {
  if (!doc || !Array.isArray(doc.boards)) {
    const e = new Error('invalid boards payload — expected { boards: [...] }')
    e.status = 400
    throw e
  }
  const f = fileFor(dataDir, user)
  await fs.mkdir(path.dirname(f), { recursive: true })
  await fs.writeFile(f, JSON.stringify(doc, null, 2))
  return { saved: true, user: safeKey(user) }
}
