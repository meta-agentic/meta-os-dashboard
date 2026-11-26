import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { loadWidgets } from '../test-support/mount.mjs'
import { openCount } from './poQuestionsShared.js'

// The PO questions have their own tab, with a count badge when questions are open.
const mod = await loadWidgets(['widgets/PoQuestions.jsx', 'TabBar.jsx'])
after(() => mod.close())
const flush = () => new Promise((r) => setTimeout(r, 20))

async function render(Comp, props) {
  const { React, createRoot, act } = mod
  const el = document.createElement('div')
  document.body.appendChild(el)
  await act(async () => { createRoot(el).render(React.createElement(Comp, props)); await flush() })
  return el
}

const Q = (id) => ({ space: 'aaa', id, question: `question ${id}`, raised: '2026-11-20', ageDays: 6, blocks: [], options: [], recommendation: '' })
const TABS = [
  { id: 'sprint', name: 'Sprint', ids: ['a', 'b'] },
  { id: 'backlog', name: 'Backlog', ids: ['c'] },
  { id: 'flow', name: 'Flow', ids: ['d'] },
  { id: 'questions', name: 'PO questions', ids: ['po-questions'] },
]
const tabOf = (el, name) => [...el.querySelectorAll('.tab-name')].find((b) => b.textContent.startsWith(name))

const COUNTS = [
  ['an unreadable register', null, null],
  ['a register that says it is unavailable', { available: false, reason: 'x' }, null],
  ['a register with none open', { available: true, decisions: [] }, 0],
  ['a register with two open', { available: true, decisions: [Q('D-1'), Q('D-2')] }, 2],
]
for (const [name, state, want] of COUNTS) {
  test(`openCount: ${name} → ${want}`, () => assert.equal(openCount(state), want))
}

test('the questions widget lists the open questions from the state it is given', async () => {
  const el = await render(mod.W0, { state: { available: true, decisions: [Q('D-1'), Q('D-2')] } })
  assert.equal(el.querySelectorAll('.poq-row').length, 2)
})

test('the questions widget renders nothing when the register is unavailable', async () => {
  const el = await render(mod.W0, { state: { available: false } })
  assert.equal(el.querySelector('.poq'), null)
})

test('the questions tab shows a badge with the open count', async () => {
  const el = await render(mod.W1, { tabs: TABS, activeId: 'sprint', onShow() {}, badges: { questions: 3 } })
  assert.equal(tabOf(el, 'PO questions').querySelector('.tab-badge')?.textContent, '3')
})

test('with no question open the questions tab shows no badge', async () => {
  const el = await render(mod.W1, { tabs: TABS, activeId: 'sprint', onShow() {}, badges: { questions: 0 } })
  assert.equal(tabOf(el, 'PO questions').querySelector('.tab-badge'), null)
})

test('a tab without a badge shows its widget count', async () => {
  const el = await render(mod.W1, { tabs: TABS, activeId: 'sprint', onShow() {}, badges: { questions: 3 } })
  assert.equal(tabOf(el, 'Sprint').querySelector('.tab-n')?.textContent, '2')
})

test('the tab bar renders the tabs in the order given', async () => {
  const el = await render(mod.W1, { tabs: TABS, activeId: 'sprint', onShow() {} })
  assert.deepEqual([...el.querySelectorAll('.tab-name')].map((b) => b.firstChild.textContent), ['Sprint', 'Backlog', 'Flow', 'PO questions'])
})

test('clicking a tab asks to show it', async () => {
  const got = []
  const el = await render(mod.W1, { tabs: TABS, activeId: 'sprint', onShow: (id) => got.push(id) })
  await mod.act(async () => { tabOf(el, 'PO questions').click() })
  assert.deepEqual(got, ['questions'])
})
