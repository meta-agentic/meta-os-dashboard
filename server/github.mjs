// GitHub-backed read surface — server-side only. The token never reaches the browser.
import path from 'node:path'

const API = 'https://api.github.com'

export class GitRepo {
  constructor({ owner, repo, ref = 'main', token }) {
    this.owner = owner
    this.repo = repo
    this.ref = ref
    this.token = token
    this.tree = null
    this.treeFetched = null
    this.textCache = new Map()
    this.dateCache = new Map()
  }

  label() {
    return `${this.owner}/${this.repo}`
  }

  async fetch(url, opts = {}) {
    const r = await fetch(`${API}${url}`, {
      ...opts,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'meta-os-dashboard',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...opts.headers,
      },
    })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      const e = new Error(`GitHub ${r.status} ${url}: ${body.slice(0, 200)}`)
      e.status = r.status === 404 ? 404 : 502
      throw e
    }
    return r.json()
  }

  async ensureTree() {
    const age = Date.now() - (this.treeFetched ?? 0)
    if (this.tree && age < 120_000) return this.tree
    const refData = await this.fetch(`/repos/${this.owner}/${this.repo}/git/ref/heads/${this.ref}`)
    const treeData = await this.fetch(
      `/repos/${this.owner}/${this.repo}/git/trees/${refData.object.sha}?recursive=1`,
    )
    const entries = new Map()
    for (const e of treeData.tree ?? []) {
      if (e.type !== 'blob') continue
      entries.set(e.path, { sha: e.sha, size: e.size ?? 0 })
    }
    this.tree = entries
    this.treeFetched = Date.now()
    return entries
  }

  async readText(filePath, { ref } = {}) {
    const key = `${ref ?? this.ref}:${filePath}`
    if (this.textCache.has(key)) return this.textCache.get(key)
    const data = await this.fetch(
      `/repos/${this.owner}/${this.repo}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}${ref ? `?ref=${ref}` : ''}`,
    )
    if (Array.isArray(data)) {
      const e = new Error(`${filePath} is a directory`)
      e.status = 400
      throw e
    }
    const text = Buffer.from(data.content, data.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8')
    this.textCache.set(key, text)
    return text
  }

  async readJson(filePath) {
    return JSON.parse(await this.readText(filePath))
  }

  async listDir(dirPath = '') {
    const prefix = dirPath ? `${dirPath.replace(/\/$/, '')}/` : ''
    const tree = await this.ensureTree()
    const dirs = new Set()
    const files = []
    for (const p of tree.keys()) {
      if (!p.startsWith(prefix)) continue
      const rest = p.slice(prefix.length)
      if (!rest) continue
      const slash = rest.indexOf('/')
      if (slash === -1) files.push({ name: rest, path: p, size: tree.get(p).size })
      else dirs.add(rest.slice(0, slash))
    }
    return {
      dirs: [...dirs].sort(),
      files: files.sort((a, b) => a.name.localeCompare(b.name)),
    }
  }

  async mdFiles(dirPath) {
    const prefix = dirPath ? `${dirPath.replace(/\/$/, '')}/` : ''
    const tree = await this.ensureTree()
    const out = []
    for (const [p, meta] of tree) {
      if (prefix && !p.startsWith(prefix)) continue
      const base = path.posix.basename(p)
      if (!p.endsWith('.md') || base === '_index.md') continue
      const rel = prefix ? p.slice(prefix.length) : p
      out.push({ file: rel, path: p, size: meta.size })
    }
    await Promise.all(out.map(async (f) => { f.mtime = await this.lastCommitMs(f.path) }))
    return out
  }

  async lastCommitMs(filePath) {
    if (this.dateCache.has(filePath)) return this.dateCache.get(filePath)
    try {
      const commits = await this.fetch(
        `/repos/${this.owner}/${this.repo}/commits?path=${encodeURIComponent(filePath)}&per_page=1`,
      )
      const ms = commits[0]?.commit?.committer?.date
        ? new Date(commits[0].commit.committer.date).getTime()
        : 0
      this.dateCache.set(filePath, ms)
      return ms
    } catch {
      this.dateCache.set(filePath, 0)
      return 0
    }
  }

  async commits(limit = 15) {
    const data = await this.fetch(`/repos/${this.owner}/${this.repo}/commits?per_page=${limit}`)
    return data.map((c) => ({
      hash: c.sha.slice(0, 7),
      sha: c.sha,
      date: c.commit?.committer?.date ?? c.commit?.author?.date,
      author: c.commit?.author?.name ?? c.author?.login ?? 'unknown',
      subject: (c.commit?.message ?? '').split('\n')[0],
    }))
  }

  async topLevelDirs() {
    const { dirs } = await this.listDir('')
    return dirs.filter((d) => !d.startsWith('.'))
  }

  hasPath(filePath) {
    return this.tree?.has(filePath) ?? false
  }

  async statPath(filePath) {
    await this.ensureTree()
    const hit = this.tree.get(filePath)
    if (!hit) {
      const e = new Error(`not found: ${filePath}`)
      e.status = 404
      throw e
    }
    return { size: hit.size, mtimeMs: await this.lastCommitMs(filePath) }
  }
}

export function createGithubContext(config) {
  const token = process.env.META_OS_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? config.github?.token
  if (!token) throw new Error('GITHUB_TOKEN is required for source=github')

  const mk = (spec, fallback) => {
    const s = spec ?? fallback
    if (!s?.owner || !s?.repo) throw new Error('github config requires owner + repo for each source')
    return new GitRepo({ owner: s.owner, repo: s.repo, ref: s.ref ?? 'main', token })
  }

  const instance = mk(config.github.instance)
  const vault = mk(config.github.vault)
  const framework = mk(config.github.framework, { owner: 'mova77', repo: 'meta-os' })

  const backlogs = (config.github.backlogs ?? []).map((b) => ({
    space: b.space,
    repo: new GitRepo({ owner: b.owner, repo: b.repo, ref: b.ref ?? 'main', token }),
    path: b.path,
  }))

  return { instance, vault, framework, backlogs, token }
}