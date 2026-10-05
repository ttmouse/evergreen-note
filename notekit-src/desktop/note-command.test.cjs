const { test } = require('node:test')
const assert = require('node:assert/strict')
const { runNoteCommand } = require('./note-command.cjs')

function fixture() {
  const rows = new Map([['2026-10-04', { ky: '2026-10-04', status: 1, topic: '2026-10-04' }], ['existing', { ky: 'existing', pky: '2026-10-04', ori: '原有笔记', weight: 1000, status: 1, tags: ['#回退标签'] }],
  ['oldnote', { ky: 'oldnote', pky: '2026-10-04', ori: '无状态老条目', weight: 900, tags: ['#回退标签'] }]])
  const $ = {
    libAdmin: { current: { ky: 'test-db' } },
    dbDisk: { flush: async () => {} },
    dbMemory: {
      nodes: new Proxy(rows, {
        ownKeys: t => [...t.keys()],
        getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
        get: (t, k) => t.get(k),
      }),
      getItem: key => rows.get(key) || {},
      getSubitems: key => [...rows.values()].filter(row => row.pky === key && row.status === 1),
      saveItem: row => { rows.set(row.ky, row); return row },
      deleteItem: (ky, { isRecur = false } = {}) => {
        const row = rows.get(ky)
        if (!row) return false
        row.status = -1
        if (isRecur) for (const sub of [...rows.values()].filter(x => x.pky === ky && x.status === 1)) $.dbMemory.deleteItem(sub.ky, { isRecur: true })
        return false // 真实实现里 reactive has 陷阱会在删除后返回 false
      },
      canSave: () => true,
      getTopic: name => [...rows.values()].find(row => row.topic === String(name).toLowerCase()) || null,
      indexed: { tags: { 重点: { e1: { ky: 'e1', pky: '2026-10-04', ori: '带标签条目', status: 1 }, e2: { ky: 'e2', pky: 'x', ori: '回收站带标签', status: -1 } } } },
    },
    topic: { getTopic: key => rows.get(key) },
    daily: { createTopic: key => { if (!rows.has(key)) rows.set(key, { ky: key, status: 1 }); return rows.get(key) } },
    checkbox: { createElement: ({ value }) => ({ blockType: 'checkbox', value, children: [{ text: '' }] }), verify: v => v?.blockType === 'checkbox' },
  }
  global.window = { __notekitApp: { addons: $ } }
  return { $, rows, input: { action: 'append', date: '2026-10-04', dbid: 'test-db', title: '清单', requestId: 'a'.repeat(64), blocks: [{ text: '第一项', checkbox: true }, { text: '第二项' }] } }
}

test('retry preserves existing notes and later user edits', async () => {
  const { rows, input } = fixture()
  const first = await runNoteCommand(input)
  assert.equal(first.created, 3)
  const edited = rows.get(first.blockKeys[0])
  edited.ori = '用户修改'; edited.leaves[1].value = true
  const second = await runNoteCommand(input)
  assert.equal(second.created, 0)
  assert.equal(second.reused, true)
  assert.equal(rows.get('existing').ori, '原有笔记')
  assert.equal(rows.get(first.blockKeys[0]).ori, '用户修改')
  assert.equal(rows.get(first.blockKeys[0]).leaves[1].value, true)
  assert.equal(rows.size, 6)
})

test('retry completes a partial append without duplicates', async () => {
  const { $, rows, input } = fixture()
  const save = $.dbMemory.saveItem
  let count = 0
  $.dbMemory.saveItem = row => { if (++count === 3) throw new Error('模拟保存中断'); return save(row) }
  await assert.rejects(runNoteCommand(input), /保存中断/)
  $.dbMemory.saveItem = save
  const result = await runNoteCommand(input)
  assert.equal(result.created, 1)
  assert.equal(rows.size, 6)
})

test('invalid dates, payloads and database mismatch cannot mutate notes', async () => {
  const { rows, input } = fixture()
  for (const change of [{ date: '2026-02-30' }, { date: '2026-99-99' }, { dbid: 'another' }, { blocks: [] }, { requestId: 'bad' }]) await assert.rejects(runNoteCommand({ ...input, ...change }))
  assert.equal(rows.size, 3)
  const read = await runNoteCommand({ action: 'read', date: '2099-01-01', dbid: 'test-db' })
  assert.equal(read.exists, false)
  assert.equal(rows.size, 3)
})

test('a conflicting request key cannot overwrite another date', async () => {
  const { rows, input } = fixture()
  await runNoteCommand(input)
  await assert.rejects(runNoteCommand({ ...input, date: '2026-10-05' }), /冲突/)
  assert.equal(rows.get('auto-' + input.requestId).pky, '2026-10-04')
})

test('switching library while awaiting previous saves cannot redirect the append', async () => {
  const { $, rows, input } = fixture()
  $.dbDisk.flush = async () => { $.libAdmin.current.ky = 'another' }
  await assert.rejects(runNoteCommand(input), /切换/)
  assert.equal(rows.size, 3)
})

test('edit updates text and preserves checkbox state by default', async () => {
  const { $, rows, input } = fixture()
  const appended = await runNoteCommand(input)
  const target = rows.get(appended.blockKeys[0])
  assert.equal(target.leaves[1].value, false)
  const result = await runNoteCommand({ action: 'edit', dbid: 'test-db', items: [{ ky: appended.blockKeys[0], text: '改后文字' }] })
  assert.equal(result.edited, 1)
  const after = rows.get(appended.blockKeys[0])
  assert.equal(after.ori, '[ ] 改后文字')
  assert.equal(after.leaves[1].value, false)
  assert.equal(after.leaves[2].text, ' 改后文字')
  assert.equal(rows.get(appended.blockKeys[1]).ori, '第二项')
  const explicit = await runNoteCommand({ action: 'edit', dbid: 'test-db', items: [{ ky: appended.blockKeys[1], text: '改为复选', checkbox: true }] })
  assert.equal(explicit.edited, 1)
  assert.equal(rows.get(appended.blockKeys[1]).ori, '[ ] 改为复选')
  assert.ok($.checkbox.verify(rows.get(appended.blockKeys[1]).leaves[1]))
  const same = await runNoteCommand({ action: 'edit', dbid: 'test-db', items: [{ ky: appended.blockKeys[1], text: '改为复选' }] })
  assert.equal(same.edited, 0)
  assert.equal(same.unchanged, 1)
  await assert.rejects(runNoteCommand({ action: 'edit', dbid: 'test-db', items: [{ ky: 'missing', text: 'x' }] }), /不存在/)
  await assert.rejects(runNoteCommand({ action: 'edit', dbid: 'test-db', items: [{ ky: 'existing', text: '' }] }), /无效/)
  assert.equal(rows.get('existing').ori, '原有笔记')
})

test('delete trashes items, recurses only when asked and refuses topic roots', async () => {
  const { $, rows, input } = fixture()
  const appended = await runNoteCommand(input)
  await assert.rejects(runNoteCommand({ action: 'delete', dbid: 'test-db', kys: ['2026-10-04'] }), /主题节点/)
  assert.equal(rows.get('2026-10-04').status, 1)
  const one = await runNoteCommand({ action: 'delete', dbid: 'test-db', kys: [appended.blockKeys[0]] })
  assert.deepEqual(one.deleted, [appended.blockKeys[0]])
  assert.equal(rows.get(appended.blockKeys[0]).status, -1)
  assert.equal(rows.get(appended.blockKeys[1]).status, 1)
  const all = await runNoteCommand({ action: 'delete', dbid: 'test-db', kys: ['auto-' + input.requestId], recurse: true })
  assert.deepEqual(all.deleted, ['auto-' + input.requestId])
  assert.equal(rows.get(appended.blockKeys[1]).status, -1)
  await assert.rejects(runNoteCommand({ action: 'delete', dbid: 'test-db', kys: ['missing'] }), /不存在/)
})

test('search finds matching text and get returns subtree', async () => {
  const { $, rows, input } = fixture()
  const appended = await runNoteCommand(input)
  const found = await runNoteCommand({ action: 'search', dbid: 'test-db', query: '第一项' })
  assert.equal(found.total, 1)
  assert.equal(found.items[0].ky, appended.blockKeys[0])
  const none = await runNoteCommand({ action: 'search', dbid: 'test-db', query: '不存在词' })
  assert.equal(none.total, 0)
  const tree = await runNoteCommand({ action: 'get', dbid: 'test-db', ky: 'auto-' + input.requestId, depth: 3 })
  assert.equal(tree.item.text, '清单')
  assert.equal(tree.item.subitems.length, 2)
  assert.equal(tree.item.subitems[0].checkbox, true)
  await assert.rejects(runNoteCommand({ action: 'get', dbid: 'test-db', ky: 'missing' }), /不存在/)
  await assert.rejects(runNoteCommand({ action: 'search', dbid: 'test-db', query: '' }), /搜索关键词/)
})

test('topic and tag lookups', async () => {
  const { $, rows, input } = fixture()
  await runNoteCommand(input)
  const found = await runNoteCommand({ action: 'topic', dbid: 'test-db', name: '2026-10-04', depth: 1 })
  assert.equal(found.exists, true)
  assert.equal(found.item.ky, '2026-10-04')
  assert.equal(found.item.subitems.length, 2) // existing + 验收清单（两个 block 是清单的子级）
  const missing = await runNoteCommand({ action: 'topic', dbid: 'test-db', name: '不存在的主题' })
  assert.equal(missing.exists, false)
  await assert.rejects(runNoteCommand({ action: 'topic', dbid: 'test-db', name: '' }), /主题名/)
  const tagged = await runNoteCommand({ action: 'tag', dbid: 'test-db', tag: '重点' })
  assert.deepEqual(tagged.items.map(x => x.ky), ['e1'])
  await assert.rejects(runNoteCommand({ action: 'tag', dbid: 'test-db', tag: '' }), /标签名/)
  const cleaned = await runNoteCommand({ action: 'get', dbid: 'test-db', ky: 'auto-' + input.requestId, depth: 1 })
  assert.equal(cleaned.item.subitems[0].text, '第一项') // 复选框条目输出纯文字，不带 [ ] 标记
  assert.equal(cleaned.item.subitems[0].checkbox, true)

  // 追加到指定父节点（代替日记日期）
  const under = await runNoteCommand({ action: 'append', dbid: 'test-db', under: 'auto-' + input.requestId, title: '子清单', requestId: 'b'.repeat(64), blocks: [{ text: '子项' }] })
  assert.equal(under.created, 2)
  assert.equal(under.parent, 'auto-' + input.requestId)
  await assert.rejects(runNoteCommand({ action: 'append', dbid: 'test-db', under: 'missing', title: 'x', requestId: 'c'.repeat(64), blocks: [{ text: 'y' }] }), /父节点不存在/)

  // 追加到主题页
  const toTopic = await runNoteCommand({ action: 'append', dbid: 'test-db', topicName: '2026-10-04', title: '主题内追加', requestId: 'd'.repeat(64), blocks: [{ text: '内容' }] })
  assert.equal(toTopic.created, 2)
  assert.equal(toTopic.parent, '2026-10-04')
  await assert.rejects(runNoteCommand({ action: 'append', dbid: 'test-db', topicName: '不存在的主题', title: 'x', requestId: 'e'.repeat(64), blocks: [{ text: 'y' }] }), /主题不存在/)

  const fallback = await runNoteCommand({ action: 'tag', dbid: 'test-db', tag: '#回退标签' })
  assert.deepEqual(fallback.items.map(x => x.ky), ['existing', 'oldnote'])
  const legacySearch = await runNoteCommand({ action: 'search', dbid: 'test-db', query: '无状态老条目' })
  assert.equal(legacySearch.total, 1)
})
