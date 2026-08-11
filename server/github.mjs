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
    this.blobCache = new Map() // blob sha → text; sha-keyed, so it self-invalidates
  }

  label() {
    return `${this.owner}/${this.repo}`
  }

  // Public web URL for a commit. github.com only — the token path is the API host,
  // and this repo has no Enterprise base-URL setting to derive another origin from.
  commitUrl(hash) {
    return `https://github.com/${this.owner}/${this.repo}/commit/${hash}`
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

  async graphql(query, variables = {}) {
    const r = await fetch(`${API}/graphql`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'meta-os-dashboard',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    })
    if (!r.ok) {
      const e = new Error(`GitHub GraphQL ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
      e.status = 502
      throw e
    }
    const body = await r.json()
    // GraphQL reports errors in a 200 body; surface them rather than returning holes.
    if (body.errors?.length) {
      const e = new Error(`GitHub GraphQL: ${body.errors.map((x) => x.message).join('; ').slice(0, 200)}`)
      e.status = 502
      throw e
    }
    return body.data
  }

  // Bulk file read: Map<path, text>. The contents API is one request per file, which
  // a vault-native backlog (1000+ item files) would turn into a rate-limit incident on
  // every poll — so this batches through GraphQL aliases instead, ~15 requests for a
  // whole vault rather than ~1400.
  //
  // The cache is keyed by BLOB SHA, not path: the tree already tells us each file's
  // sha, so unchanged content is never refetched and changed content can never be
  // served stale. (A path-keyed cache with no TTL — which is what readText uses — would
  // pin the first version read for the process's lifetime.)
  async readManyText(paths, { batch = 100 } = {}) {
    const tree = await this.ensureTree()
    const out = new Map()
    const misses = []
    for (const p of paths) {
      const sha = tree.get(p)?.sha
      if (!sha) continue // not in the tree at this ref — caller treats as absent
      if (this.blobCache.has(sha)) out.set(p, this.blobCache.get(sha))
      else misses.push({ path: p, sha })
    }
    for (let i = 0; i < misses.length; i += batch) {
      const chunk = misses.slice(i, i + batch)
      const fields = chunk
        .map((m, k) => `f${k}: object(oid: ${JSON.stringify(m.sha)}) { ... on Blob { text isBinary } }`)
        .join('\n')
      const data = await this.graphql(
        `query($owner:String!,$name:String!){ repository(owner:$owner,name:$name){ ${fields} } }`,
        { owner: this.owner, name: this.repo },
      )
      const repo = data?.repository ?? {}
      chunk.forEach((m, k) => {
        const blob = repo[`f${k}`]
        // isBinary blobs return text: null — record the miss rather than caching null.
        if (typeof blob?.text !== 'string') return
        this.blobCache.set(m.sha, blob.text)
        out.set(m.path, blob.text)
      })
    }
    return out
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
  const framework = mk(config.github.framework, { owner: 'meta-agentic', repo: 'meta-os' })

  // Two backlog sources, chosen by the shape of `path` so existing configs keep working:
  //   path ending in .json → a pre-built backlog document (legacy mirror repo)
  //   anything else        → vault-native (IOS-838): `path` is the space directory,
  //                          defaulting to the space name, in `vault` unless the entry
  //                          names its own owner/repo.
  const backlogs = (config.github.backlogs ?? []).map((b) => {
    if (typeof b.path === 'string' && b.path.endsWith('.json')) {
      return {
        space: b.space,
        mode: 'document',
        repo: new GitRepo({ owner: b.owner, repo: b.repo, ref: b.ref ?? 'main', token }),
        path: b.path,
      }
    }
    return {
      space: b.space,
      mode: 'vault',
      repo: b.owner && b.repo ? new GitRepo({ owner: b.owner, repo: b.repo, ref: b.ref ?? 'main', token }) : vault,
      path: b.path ?? b.space,
    }
  })

  return { instance, vault, framework, backlogs, token }
}