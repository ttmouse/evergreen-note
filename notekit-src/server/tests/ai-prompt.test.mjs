/**
 * composePrompt（ai-prompt.mjs）单测：环境信息的组装与隐私边界。
 * 运行：node --test server/tests/ai-prompt.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { composePrompt } from '../ai-prompt.mjs'

test('无选块：维持 v1 约定，只给 ky + 标题让 agent 自取', () => {
  const out = composePrompt('归纳这篇笔记', { ky: 'abc-1', title: '测试页' })
  assert.ok(out.includes('【环境信息】用户正在 Evergreen note 中查看笔记「测试页」（ky=abc-1）。'))
  assert.ok(out.includes('可用 ev get --ky abc-1 读取或向它追加'))
  assert.ok(out.endsWith('归纳这篇笔记'))
  assert.ok(!out.includes('<块'), '没选块就不该出现块原文')
})

test('无 note：原样透传用户文本', () => {
  assert.equal(composePrompt('你好', null), '你好')
  assert.equal(composePrompt('你好', undefined), '你好')
  assert.equal(composePrompt('你好', {}), '你好')
})

test('有选块：块原文内联、带序号和 ky，页面退居背景', () => {
  const note = {
    ky: 'page-1',
    title: '读书笔记',
    selection: { blocks: [{ ky: 'b1', text: '第一块内容' }, { ky: 'b2', text: '第二块内容' }] },
  }
  const out = composePrompt('请归纳我选中的这 2 个块', note)
  assert.ok(out.includes('选中了其中 2 个块'))
  assert.ok(out.includes('<块 1（ky=b1）>\n第一块内容\n</块 1>'))
  assert.ok(out.includes('<块 2（ky=b2）>\n第二块内容\n</块 2>'))
  assert.ok(out.includes('「读书笔记」（ky=page-1）'))
  assert.ok(out.includes('优先以这些选中块为对象'))
  assert.ok(out.includes('ev get --ky page-1 读取'))
  assert.ok(!out.includes('向它追加'), '选块模式下不再引导 agent 直接改页')
  assert.ok(out.endsWith('请归纳我选中的这 2 个块'))
})

test('有选块但缺 ky/标题：照样内联，不给无效的 ev 提示', () => {
  const out = composePrompt('归纳', { selection: { blocks: [{ text: '只有原文' }] } })
  assert.ok(out.includes('选中了其中 1 个块'))
  assert.ok(out.includes('<块 1>\n只有原文\n</块 1>'))
  assert.ok(!out.includes('ev get --ky undefined'))
})

test('空文本块被丢弃；全空则退回页面引用语义', () => {
  const note = { ky: 'p', title: 't', selection: { blocks: [{ text: '  ' }, { ky: 'x', text: '' }] } }
  const out = composePrompt('问', note)
  assert.ok(!out.includes('<块'), '空块不该渲染')
  assert.ok(out.includes('可用 ev get --ky p 读取'))
})

test('selection 不是数组或形状不对：按无选块处理，不抛错', () => {
  for (const bad of [
    { ky: 'p', selection: 'oops' },
    { ky: 'p', selection: { blocks: 'nope' } },
    { ky: 'p', selection: { blocks: [null, 3, 'txt'] } },
  ]) {
    const out = composePrompt('问', bad)
    assert.ok(!out.includes('<块'), JSON.stringify(bad))
  }
})
