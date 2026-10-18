/**
 * ai-acp-routes.mjs 的 ACP update → SSE 事件映射单测。
 * 重点：tool_call / tool_call_update 在 UI 最小字段之上转发 content（原样）与
 * rawOutput（超长截断 + rawOutputTruncated 标记）——扩展侧 bridge-adapter 依赖这两项。
 * 运行：node --test server/tests/ai-acp-routes.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { acpUpdateToEvent, clipToolOutput, MAX_TOOL_OUTPUT_CHARS } from '../ai-acp-routes.mjs'

test('tool_call_update：超长 rawOutput 被截断到上限且带 rawOutputTruncated 标记', () => {
  const ev = acpUpdateToEvent('s1', {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'call_1',
    status: 'completed',
    title: 'bash',
    rawOutput: 'x'.repeat(MAX_TOOL_OUTPUT_CHARS * 3),
    content: [{ type: 'text', text: '{"datas":[]}' }],
  })
  assert.equal(ev.type, 'tool_update')
  assert.equal(ev.payload.sessionId, 's1')
  assert.equal(ev.payload.toolCallId, 'call_1')
  assert.equal(ev.payload.rawOutput.length, MAX_TOOL_OUTPUT_CHARS)
  assert.equal(ev.payload.rawOutput, 'x'.repeat(MAX_TOOL_OUTPUT_CHARS))
  assert.equal(ev.payload.rawOutputTruncated, true, '超长必须打截断标记')
  assert.deepEqual(ev.payload.content, [{ type: 'text', text: '{"datas":[]}' }], 'content 原样转发')
})

test('tool_call_update：上限内的 rawOutput 原样转发、不打截断标', () => {
  const ev = acpUpdateToEvent('s1', {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'call_2',
    status: 'completed',
    rawOutput: 'done',
  })
  assert.equal(ev.payload.rawOutput, 'done')
  assert.equal(ev.payload.rawOutputTruncated, false)
  assert.equal(ev.payload.content, null, '没带 content 也要给字段，老消费方不炸')
})

test('tool_call / tool_call_update：对象 rawOutput 先 JSON.stringify 再截断', () => {
  const obj = { stdout: 'y'.repeat(MAX_TOOL_OUTPUT_CHARS * 2), code: 0 }
  const asJson = JSON.stringify(obj)
  for (const k of ['tool_call', 'tool_call_update']) {
    const ev = acpUpdateToEvent('s1', { sessionUpdate: k, toolCallId: 'c', rawOutput: obj })
    assert.equal(ev.payload.rawOutput.length, MAX_TOOL_OUTPUT_CHARS)
    assert.ok(asJson.startsWith(ev.payload.rawOutput), '截断的是 JSON.stringify 前缀')
    assert.equal(ev.payload.rawOutputTruncated, true)
  }
})

test('clipToolOutput：null/undefined → rawOutput null；循环引用兜底 String 不抛', () => {
  assert.deepEqual(clipToolOutput(null), { rawOutput: null, rawOutputTruncated: false })
  assert.deepEqual(clipToolOutput(undefined), { rawOutput: null, rawOutputTruncated: false })
  const cyc = {}
  cyc.self = cyc
  const clipped = clipToolOutput(cyc)
  assert.equal(typeof clipped.rawOutput, 'string')
  assert.equal(clipped.rawOutputTruncated, false)
})

test('tool_call：既有最小字段不回归（title 兜底、status 默认 pending）', () => {
  const ev = acpUpdateToEvent('s1', { sessionUpdate: 'tool_call', toolCallId: 'c1' })
  assert.equal(ev.type, 'tool')
  assert.equal(ev.payload.title, 'tool')
  assert.equal(ev.payload.status, 'pending')
  assert.equal(ev.payload.rawOutput, null)
  assert.equal(ev.payload.rawOutputTruncated, false)
})

test('其余 update 照旧映射；未知 sessionUpdate 返回 null（不广播）', () => {
  assert.equal(acpUpdateToEvent('s', { sessionUpdate: 'agent_message_chunk', content: { text: 'hi' } }).type, 'text')
  assert.equal(acpUpdateToEvent('s', { sessionUpdate: 'agent_thought_chunk', content: { text: 'hmm' } }).type, 'thought')
  assert.equal(acpUpdateToEvent('s', { sessionUpdate: 'usage_update', used: 1, size: 2 }).type, 'usage')
  assert.equal(acpUpdateToEvent('s', { sessionUpdate: 'config_option_update', configOptions: [] }).type, 'config')
  assert.equal(acpUpdateToEvent('s', { sessionUpdate: 'something_new' }), null)
  assert.equal(acpUpdateToEvent('s', {}), null)
})
