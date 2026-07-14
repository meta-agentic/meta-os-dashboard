// Safe read-only file browsing + preview, scoped to a whitelist of roots.
// Every path is resolved and re-checked to sit inside its root (no traversal).
import fs from 'node:fs/promises'
import path from 'node:path'

const TEXT_MAX = 128 * 1024 // text preview byte cap
const HEX_MAX = 16 * 1024 // hex preview byte cap (keeps the DOM bounded)
const ENTRY_MAX = 4000

function safe(root, rel) {
  const abs = path.resolve(root, rel ? rel.replace(/^[/\\]+/, '') : '.')
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    const e = new Error('path escapes root')
    e.status = 403
    throw e
  }
  return abs
}
function pickRoot(roots, key) {
  const root = roots[key]
  if (!root) {
    const e = new Error(`unknown root '${key}'`)
    e.status = 404
    throw e
  }
  return root
}

export async function browse(roots, key, rel) {
  const root = pickRoot(roots, key)
  const abs = safe(root, rel)
  const dirents = await fs.readdir(abs, { withFileTypes: true })
  const entries = []
  for (const d of dirents.slice(0, ENTRY_MAX)) {
    if (d.name === '.git' || d.name === 'node_modules') continue
    const isDir = d.isDirectory()
    let size = null
    if (!isDir) {
      try { size = (await fs.stat(path.join(abs, d.name))).size } catch { /* skip */ }
    }
    entries.push({ name: d.name, type: isDir ? 'dir' : 'file', size })
  }
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
  return { root: key, path: path.relative(root, abs) || '', entries }
}

function looksBinary(buf) {
  const n = Math.min(buf.length, 4096)
  let bad = 0
  for (let i = 0; i < n; i++) {
    const c = buf[i]
    if (c === 0) return true
    if (c < 9 || (c > 13 && c < 32)) bad++
  }
  return n > 0 && bad / n > 0.3
}

export async function readFile(roots, key, rel, mode) {
  const root = pickRoot(roots, key)
  const abs = safe(root, rel)
  const st = await fs.stat(abs)
  if (st.isDirectory()) {
    const e = new Error('is a directory')
    e.status = 400
    throw e
  }
  const ext = path.extname(abs).slice(1).toLowerCase()
  const cap = mode === 'hex' ? HEX_MAX : TEXT_MAX
  const len = Math.min(st.size, cap)
  const fd = await fs.open(abs, 'r')
  try {
    const buf = Buffer.alloc(len)
    await fd.read(buf, 0, len, 0)
    const base = { name: path.basename(abs), path: path.relative(root, abs), ext, size: st.size, truncated: st.size > cap }
    if (mode === 'hex' || looksBinary(buf)) {
      return { ...base, kind: 'binary', base64: buf.toString('base64') }
    }
    let text = buf.toString('utf8')
    let pretty = false
    if (ext === 'json') {
      try { text = JSON.stringify(JSON.parse(text), null, 2); pretty = true } catch { /* leave raw */ }
    }
    return { ...base, kind: 'text', text, pretty }
  } finally {
    await fd.close()
  }
}
