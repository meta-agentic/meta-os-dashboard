// Discipline surface: which skill packs this instance declares, and whether the
// machine's skill mounts actually agree with that declaration.
//
// The capability layer is the largest thing an instance mounts and the least
// visible: skills are discovered through a symlink directory the OS never reads
// back, so a pack can sit mounted-but-undeclared (or declared-from-the-wrong
// source) for weeks without anything noticing. This reader exists to make that
// class of drift observable — it compares two independent sources and reports
// the disagreement rather than either one alone:
//
//   declared  — instance .packs.yaml (packs[].name/source/skills)
//   mounted   — the skill-discovery dir's symlinks (claudeHome/skills)
//
// It reads only. Mount/unmount is the engine's job (observability before
// triggers), and per-skill metadata comes from each SKILL.md's front-matter.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import matter from 'gray-matter'
import YAML from 'yaml'

const run = promisify(execFile)

// Mount states. `drifted` is the interesting one — the reason it exists.
const MOUNTED = 'mounted'
const DRIFTED = 'drifted'
const MISSING = 'missing'

async function readSkillMeta(dir) {
  // A skill is a directory holding SKILL.md; name/description live in its
  // front-matter. Missing file or unparseable front-matter degrades to nulls —
  // the skill still exists on disk and should still be listed.
  try {
    const fm = matter(await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8')).data ?? {}
    return { title: fm.name ?? null, description: fm.description ?? null }
  } catch {
    return { title: null, description: null }
  }
}

async function gitHead(repoDir) {
  // Best-effort provenance. A pack may be a plain directory or an unfetched
  // URL — both are legitimate, so failure returns nulls, never an error.
  try {
    const { stdout } = await run('git', ['-C', repoDir, 'log', '-1', '--format=%h%n%cI'], { timeout: 3000 })
    const [sha, date] = stdout.trim().split('\n')
    return { sha: sha || null, date: date || null }
  } catch {
    return { sha: null, date: null }
  }
}

// Where the machine actually discovers skills. Same resolution as the usage
// reader (server/usage.mjs): configured claudeHome, else the engine's default
// under the home directory — so no instance path is hardcoded in this public repo.
const skillsDir = (claudeHome) => path.join(claudeHome ?? path.join(os.homedir(), '.claude'), 'skills')

async function readMounts(dir) {
  // Map skill name -> { target, real } for every symlink in the discovery dir,
  // plus the real directories (framework-owned skills mounted as folders).
  const mounts = new Map()
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (e) {
    return { mounts, reason: `skills dir unreadable: ${e.message}` }
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    let target = null
    try {
      const st = await fs.lstat(full)
      if (st.isSymbolicLink()) target = await fs.readlink(full)
      else if (st.isDirectory()) target = full // a real dir: framework-owned
      else continue
    } catch { continue }
    let real = null
    try { real = await fs.realpath(full) } catch { /* broken link — target kept, real null */ }
    mounts.set(entry.name, { target, real })
  }
  return { mounts, reason: null }
}

export async function packs(instanceRoot, frameworkRoot, claudeHome) {
  let doc
  try {
    doc = YAML.parse(await fs.readFile(path.join(instanceRoot, '.packs.yaml'), 'utf8'))
  } catch (e) {
    return { available: false, reason: `.packs.yaml not readable under instanceRoot: ${e.message}` }
  }
  const declared = Array.isArray(doc?.packs) ? doc.packs : []
  if (!declared.length) return { available: false, reason: '.packs.yaml declares no packs' }

  // If the discovery dir is unreadable we can still report what is DECLARED, but
  // every mount verdict would be a guess — say so rather than showing false health.
  const dir = skillsDir(claudeHome)
  const { mounts, reason: mountReason } = await readMounts(dir)
  const mountsKnown = !mountReason

  const claimed = new Set()
  const packRows = []
  for (const p of declared) {
    const source = p.source ?? null
    const local = source && !/^[a-z]+:\/\//i.test(source) ? source : null
    const git = local ? await gitHead(local) : { sha: null, date: null }
    const skills = []
    for (const name of p.skills ?? []) {
      claimed.add(name)
      const meta = local ? await readSkillMeta(path.join(local, 'skills', name)) : { title: null, description: null }
      const m = mounts.get(name)
      let state = MISSING
      if (!mountsKnown) state = null
      else if (m) {
        // Mounted — but does it resolve into the pack this instance declared?
        state = local && m.real && m.real.startsWith(path.resolve(local)) ? MOUNTED : DRIFTED
      }
      skills.push({
        name, state,
        ...meta,
        mountedFrom: m?.real ?? null,
      })
    }
    const counts = { mounted: 0, drifted: 0, missing: 0 }
    for (const s of skills) if (s.state) counts[s.state]++
    packRows.push({
      name: p.name, source, local: Boolean(local),
      head: git.sha, headDate: git.date,
      declaredSkills: skills.length, counts, skills,
    })
  }

  // The other half of the drift picture: mounted skills nothing declares.
  // These are how the agents pack sat invisible for two weeks.
  const undeclared = []
  if (mountsKnown) {
    for (const [name, m] of mounts) {
      if (claimed.has(name)) continue
      const real = m.real
      const framework = real && frameworkRoot && real.startsWith(path.join(frameworkRoot, 'skills'))
      undeclared.push({
        name,
        origin: framework ? 'framework' : 'unknown',
        mountedFrom: real,
        ...(real ? await readSkillMeta(real) : { title: null, description: null }),
      })
    }
    undeclared.sort((a, b) => a.name.localeCompare(b.name))
  }

  const totals = packRows.reduce((acc, p) => ({
    mounted: acc.mounted + p.counts.mounted,
    drifted: acc.drifted + p.counts.drifted,
    missing: acc.missing + p.counts.missing,
  }), { mounted: 0, drifted: 0, missing: 0 })

  return {
    available: true,
    packs: packRows,
    undeclared,
    totals: { ...totals, packs: packRows.length, declaredSkills: claimed.size },
    // Null, not zero: an unknown mount state must not read as a clean bill of health.
    mountsKnown,
    mountReason,
    skillsDir: mountsKnown ? dir : null,
  }
}
