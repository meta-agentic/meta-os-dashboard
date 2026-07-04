// Front-matter linter: validates instance notes against the ontology (framework
// systems/ontology.yaml, additively merged with an optional instance-root ontology.yaml).
// Walks real directories only — vaults/ symlinks are federated repos with their own
// conventions, and skills/systems/templates/agents symlinks are framework-owned.
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import YAML from 'yaml'

const SKIP_FILES = new Set(['CLAUDE.md', 'README.md'])

async function loadOntology(frameworkRoot, instanceRoot) {
  const read = async (p) => {
    try { return YAML.parse(await fs.readFile(p, 'utf8')) } catch { return null }
  }
  const base = await read(path.join(frameworkRoot, 'systems/ontology.yaml'))
  if (!base) return null
  const ext = await read(path.join(instanceRoot, 'ontology.yaml'))
  // Additive merge: instance may add note types, never redefine framework ones.
  if (ext?.note_types) base.note_types = { ...ext.note_types, ...base.note_types }
  return base
}

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if ((await fs.lstat(full)).isSymbolicLink()) continue
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.name.endsWith('.md') && !SKIP_FILES.has(entry.name)) yield full
  }
}

const missing = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0)

export async function lint(instanceRoot, frameworkRoot) {
  const ontology = await loadOntology(frameworkRoot, instanceRoot)
  if (!ontology?.note_types) return { available: false, reason: 'ontology.yaml not found under frameworkRoot' }

  const violations = []
  let checked = 0
  for await (const file of walk(instanceRoot)) {
    checked++
    const rel = path.relative(instanceRoot, file)
    const problems = []
    let data
    try {
      data = matter(await fs.readFile(file, 'utf8')).data
    } catch (e) {
      violations.push({ file: rel, problems: [`unparseable front-matter: ${e.message}`] })
      continue
    }
    if (!data || Object.keys(data).length === 0) {
      violations.push({ file: rel, problems: ['no front-matter'] })
      continue
    }
    const spec = ontology.note_types[data.type]
    if (!data.type) problems.push('missing required field: type')
    else if (!spec) problems.push(`unknown type: "${data.type}" (not in ontology note_types)`)
    if (spec) {
      for (const field of spec.required ?? []) {
        if (missing(data[field])) problems.push(`missing required field: ${field}`)
      }
    }
    for (const tag of Array.isArray(data.tags) ? data.tags : []) {
      if (typeof tag === 'string' && tag !== tag.toLowerCase()) problems.push(`tag not lowercase: "${tag}"`)
    }
    if (problems.length) violations.push({ file: rel, problems })
  }
  return { available: true, checked, clean: checked - violations.length, violations }
}
