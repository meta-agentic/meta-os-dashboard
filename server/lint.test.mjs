// node --test server/
// The ontology lint must be able to fail. Each test builds a throwaway framework root
// (systems/ontology.yaml) and instance root, so no real instance is read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { lint } from './lint.mjs'

const FRAMEWORK_ONTOLOGY = [
  'version: 1',
  'note_types:',
  '  note:',
  '    required: [type, tags]',
  '  project:',
  '    required: [type, stack]',
].join('\n')

function roots(t, { instanceOntology } = {}) {
  const base = mkdtempSync(path.join(os.tmpdir(), 'lint-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const framework = path.join(base, 'framework')
  const instance = path.join(base, 'instance')
  mkdirSync(path.join(framework, 'systems'), { recursive: true })
  mkdirSync(instance)
  writeFileSync(path.join(framework, 'systems', 'ontology.yaml'), FRAMEWORK_ONTOLOGY)
  if (instanceOntology) writeFileSync(path.join(instance, 'ontology.yaml'), instanceOntology)
  const note = (rel, body) => {
    mkdirSync(path.dirname(path.join(instance, rel)), { recursive: true })
    writeFileSync(path.join(instance, rel), body)
  }
  return { framework, instance, note }
}

test('a conforming note is clean', async (t) => {
  const { framework, instance, note } = roots(t)
  note('memory/a.md', '---\ntype: note\ntags: [one]\n---\nbody\n')
  const r = await lint(instance, framework)
  assert.equal(r.available, true)
  assert.deepEqual({ checked: r.checked, clean: r.clean, violations: r.violations }, { checked: 1, clean: 1, violations: [] })
})

test('an unknown type is a violation: the lint can fail', async (t) => {
  const { framework, instance, note } = roots(t)
  note('memory/seeded.md', '---\ntype: not-in-the-ontology\n---\n')
  const r = await lint(instance, framework)
  assert.equal(r.clean, 0)
  assert.deepEqual(r.violations, [{ file: 'memory/seeded.md', problems: ['unknown type: "not-in-the-ontology" (not in ontology note_types)'] }])
})

test('a missing type, a missing required field and no front-matter are each reported', async (t) => {
  const { framework, instance, note } = roots(t)
  note('a.md', '---\ntags: [x]\n---\n')
  note('b.md', '---\ntype: project\n---\n')
  note('c.md', 'no front-matter at all\n')
  const r = await lint(instance, framework)
  const byFile = Object.fromEntries(r.violations.map((v) => [v.file, v.problems]))
  assert.deepEqual(byFile, {
    'a.md': ['missing required field: type'],
    'b.md': ['missing required field: stack'],
    'c.md': ['no front-matter'],
  })
})

test('an uppercase tag is a violation', async (t) => {
  const { framework, instance, note } = roots(t)
  note('a.md', '---\ntype: note\ntags: [Loud]\n---\n')
  const r = await lint(instance, framework)
  assert.deepEqual(r.violations, [{ file: 'a.md', problems: ['tag not lowercase: "Loud"'] }])
})

test('the instance ontology adds types but cannot redefine a framework one', async (t) => {
  const { framework, instance, note } = roots(t, {
    instanceOntology: 'note_types:\n  retro:\n    required: [type]\n  note:\n    required: [type]\n',
  })
  note('r.md', '---\ntype: retro\n---\n')          // added by the instance: clean
  note('n.md', '---\ntype: note\n---\n')           // framework still requires tags
  const r = await lint(instance, framework)
  assert.deepEqual(r.violations, [{ file: 'n.md', problems: ['missing required field: tags'] }])
})

test('scratch directories, symlinks, dot-folders, CLAUDE.md and README.md are not linted', async (t) => {
  const { framework, instance, note } = roots(t)
  note('automations/swarm/speculation/x.md', 'no front-matter\n')
  note('automations/swarm/speculative/y.md', 'no front-matter\n')
  note('.hidden/z.md', 'no front-matter\n')
  note('CLAUDE.md', 'no front-matter\n')
  note('README.md', 'no front-matter\n')
  const elsewhere = mkdtempSync(path.join(os.tmpdir(), 'lint-link-'))
  t.after(() => rmSync(elsewhere, { recursive: true, force: true }))
  writeFileSync(path.join(elsewhere, 'foreign.md'), 'no front-matter\n')
  symlinkSync(elsewhere, path.join(instance, 'vaults'))
  const r = await lint(instance, framework)
  assert.deepEqual({ checked: r.checked, violations: r.violations }, { checked: 0, violations: [] })
})

test('a missing framework ontology reports unavailable instead of passing', async (t) => {
  const { instance } = roots(t)
  const r = await lint(instance, path.join(instance, 'no-framework-here'))
  assert.equal(r.available, false)
})
