import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { loadWidgets } from '../test-support/mount.mjs'

const ITEMS = [
  { id: 'AAA-1', title: 'first thing', status: 'TO DO', flowState: 'todo' },
  { id: 'AAA-2', title: 'second thing', status: 'DONE', flowState: 'done' },
  { id: 'AAA-3', title: 'third thing', status: 'DONE', flowState: 'done' },
]
const flush = () => new Promise((r) => setTimeout(r, 20))

async function mount(props, W) {
  const { React, createRoot, act } = W.mod
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => { root.render(React.createElement(W.mod.W0, props)); await flush() })
  return { el, root, act, React, rerender: (p) => act(async () => { root.render(React.createElement(W.mod.W0, p)); await flush() }) }
}
const api = () => async (p) => (p.startsWith('/api/items')
  ? { items: ITEMS }
  : { item: { ...ITEMS.find((i) => p.includes(i.id)), dependencies: [], parents: [], body: '' } })

const mod = await loadWidgets(['widgets/WorkItems.jsx', 'widgets/Lanes.jsx', 'widgets/SprintSummary.jsx'])
const W = { mod }
after(() => mod.close())
const focus = (id, n = 1) => ({ label: id, spaces: ['aaa'], selectProject: true, open: { id, space: 'aaa' }, n })

test('an open deferred until the project loads still shows the item', async () => {
  globalThis.__api = api()
  const m = await mount({ spaces: ['aaa'], selected: new Set(), focus: null }, W)
  await m.rerender({ spaces: ['aaa'], selected: new Set(), focus: focus('AAA-2') })
  await m.rerender({ spaces: ['aaa'], selected: new Set(['aaa']), focus: focus('AAA-2') })
  assert.match(m.el.textContent, /second thing/)
})

test('a focus-open on first mount is not wiped by the project reset', async () => {
  globalThis.__api = api()
  const m = await mount({ spaces: ['aaa'], selected: new Set(['aaa']), focus: focus('AAA-3') }, W)
  assert.match(m.el.querySelector('.wi-crumb.cur')?.textContent ?? '', /AAA-3/)
})

test('going back from an opened item shows a table narrowed to that item', async () => {
  globalThis.__api = api()
  const m = await mount({ spaces: ['aaa'], selected: new Set(['aaa']), focus: focus('AAA-2') }, W)
  await m.act(async () => { m.el.querySelector('.fp-btn').click(); await flush() })
  const ids = [...m.el.querySelectorAll('.wi-row .wi-id')].map((n) => n.textContent)
  assert.deepEqual(ids, ['AAA-2'])
})

test('the opened item row is selected', async () => {
  globalThis.__api = api()
  const m = await mount({ spaces: ['aaa'], selected: new Set(['aaa']), focus: focus('AAA-2') }, W)
  await m.act(async () => { m.el.querySelector('.fp-btn').click(); await flush() })
  const row = m.el.querySelector('.wi-row')
  assert.equal(row.getAttribute('aria-selected'), 'true')
  assert.ok(row.classList.contains('sel'))
})

test('the selected row is scrolled into view', async () => {
  globalThis.__api = api()
  globalThis.__scrolled = []
  const m = await mount({ spaces: ['aaa'], selected: new Set(['aaa']), focus: focus('AAA-2') }, W)
  await m.act(async () => { m.el.querySelector('.fp-btn').click(); await flush() })
  assert.ok(globalThis.__scrolled.some((n) => n.getAttribute('aria-selected') === 'true'))
})

test('a hidden opened item shows a hint that clears the filter', async () => {
  globalThis.__api = api()
  const m = await mount({ spaces: ['aaa'], selected: new Set(['aaa']), focus: focus('AAA-2') }, W)
  await m.act(async () => { m.el.querySelector('.fp-btn').click(); await flush() })
  const sel = m.el.querySelector('select')
  await m.act(async () => {
    const set = Object.getOwnPropertyDescriptor(sel.ownerDocument.defaultView.HTMLSelectElement.prototype, 'value').set
    set.call(sel, 'todo'); sel.dispatchEvent(new sel.ownerDocument.defaultView.Event('change', { bubbles: true })); await flush()
  })
  const hint = m.el.querySelector('.wi-hint')
  assert.ok(hint, 'hint visible')
  await m.act(async () => { hint.querySelector('button').click(); await flush() })
  assert.equal(m.el.querySelector('.wi-hint'), null)
  assert.equal(m.el.querySelectorAll('.wi-row').length, 1)
})

test('an item chip tooltip carries the item title', async () => {
  const data = { spaces: [{ space: 'aaa', available: true, sprintActive: true, sprint: [{ name: 'S1' }], forecast: { basis: 'b', cycleTimeReason: 'r' }, lanes: [{
    lane: 'l', wip: 0, depth: 1, done: 0, blocked: 0, points: {},
    queues: { todo: [{ id: 'AAA-1', title: 'first thing' }], 'in-progress': [], done: [] } }] }] }
  const { React, createRoot, act } = mod
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(React.createElement(mod.W1, { data, onOpenItem() {} })); await flush() })
  assert.match(el.querySelector('.qchip').getAttribute('title'), /AAA-1 · first thing/)
})

test('a blocked-item chip in the sprint summary opens that item and names its title', async () => {
  const data = { spaces: [{ space: 'aaa', available: true, sprintActive: true, sprint: [{ name: 'S1' }], lanes: [{
    lane: 'l', wip: 0, depth: 1, done: 0, blocked: 1, points: {},
    queues: { todo: [{ id: 'AAA-1', title: 'first thing', blockedBy: ['AAA-9'] }], 'in-progress': [], done: [] } }] }] }
  const { React, createRoot, act } = mod
  const el = document.createElement('div'); document.body.appendChild(el)
  const got = []
  await act(async () => { createRoot(el).render(React.createElement(mod.W2, { data, onOpenItem: (p) => got.push(p) })); await flush() })
  const chip = el.querySelector('.qchip')
  assert.match(chip.getAttribute('title'), /AAA-1 · first thing/)
  await act(async () => { chip.click() })
  assert.deepEqual(got[0].open, { id: 'AAA-1', space: 'aaa' })
})
