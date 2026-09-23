// Harness surface: which gates guard a repo's PRs, read from hand-authored declarations,
// one YAML file per repo (shape: docs/harness.example.yaml).
//
// The declarations are INSTANCE data, not part of this package. They name the repos an
// estate cares about, so they live with the instance: `<instanceRoot>/harness/*.yaml` by
// default, or wherever `harness.dir` in meta-os.config.json / instance.config.json points.
// This repo ships only the example, so a fresh clone shows the widget's empty state with
// a pointer instead of someone else's repos.
//
// Read-only by design: this reader has no write path, and neither does the widget that
// renders it. It describes declared gates; it does not scan the repos' workflow files.
import fs from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'

// Resolve the declarations directory from config (already var-expanded) and the instance
// root. Returns null when neither is available, which the reader reports as unconfigured.
export function harnessDir(config, instanceRoot) {
  if (config?.harness?.dir) return path.resolve(instanceRoot ?? '.', config.harness.dir)
  return instanceRoot ? path.join(instanceRoot, 'harness') : null
}

const HOWTO = 'add one YAML file per repo under <instanceRoot>/harness/ (or set harness.dir) — see docs/harness.example.yaml'

export async function harness(dir) {
  if (!dir) return { available: false, reason: `no harness directory configured — ${HOWTO}` }
  let entries
  try {
    entries = await fs.readdir(dir)
  } catch (e) {
    // Absent is the normal state of an instance that has not declared any harness yet.
    if (e?.code === 'ENOENT') return { available: false, reason: `no harness declarations yet — ${HOWTO}` }
    return { available: false, reason: `harness directory unreadable: ${e.message}` }
  }
  const files = entries.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort()
  if (!files.length) return { available: false, reason: `no harness declarations yet — ${HOWTO}` }

  const repos = []
  for (const file of files) {
    try {
      const doc = YAML.parse(await fs.readFile(path.join(dir, file), 'utf8'))
      const gates = Array.isArray(doc?.gates) ? doc.gates : []
      repos.push({
        file,
        repo: doc?.repo ?? file,
        visibility: doc?.visibility ?? null,
        profile: doc?.profile ?? null,
        gateCount: gates.length,
        blockingCount: gates.filter((g) => g.blocking).length,
        gates,
      })
    } catch (e) {
      // A malformed declaration should not take the whole widget down — report it as a
      // broken row, same as a lint violation, not a thrown error.
      repos.push({ file, repo: file, error: `unparseable: ${e.message}`, gateCount: 0, blockingCount: 0, gates: [] })
    }
  }

  const totals = repos.reduce((acc, r) => ({
    gates: acc.gates + r.gateCount,
    blocking: acc.blocking + r.blockingCount,
  }), { gates: 0, blocking: 0 })

  return { available: true, repos, totals: { ...totals, repos: repos.length } }
}
