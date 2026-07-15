// File browse/preview over GitHub repos (instance + framework roots).
const TEXT_MAX = 128 * 1024

function repoFor(ctx, key) {
  if (key === 'framework') return ctx.framework
  if (key === 'instance') return ctx.instance
  const e = new Error(`unknown root '${key}'`)
  e.status = 404
  throw e
}

export async function browse(ctx, key, rel) {
  const repo = repoFor(ctx, key)
  const { dirs, files } = await repo.listDir(rel || '')
  const entries = [
    ...dirs.map((name) => ({ name, type: 'dir', size: null })),
    ...files.map((f) => ({ name: f.name, type: 'file', size: f.size })),
  ].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
  return { root: key, path: rel || '', entries }
}

export async function readFile(ctx, key, rel) {
  const repo = repoFor(ctx, key)
  const st = await repo.statPath(rel)
  if (st.size > TEXT_MAX) {
    return {
      root: key, path: rel, name: rel.split('/').pop(), kind: 'text',
      truncated: true, size: st.size, content: `(preview capped at ${TEXT_MAX} bytes — file is ${st.size} bytes on GitHub)`,
    }
  }
  const content = await repo.readText(rel)
  return { root: key, path: rel, name: rel.split('/').pop(), kind: 'text', size: st.size, content }
}

export async function reveal() {
  const e = new Error('reveal is not available in github source mode')
  e.status = 501
  throw e
}