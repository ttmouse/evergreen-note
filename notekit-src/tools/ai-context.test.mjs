/** AiContext（AI 面板上下文解析）纯函数单测。
 * 运行：node --test tools/ai-context.test.mjs
 * （用 tsc 把 AiContext.ts 编到临时目录后 import，避免引入 TS 运行时依赖 ——
 *   同 tools/dialog-constrain.test.mjs 的做法。）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))
const srcFile = path.join(root, 'src', 'slate-item', 'addons', 'AI', 'AiPanel', 'AiContext.ts')

const withCompiled = async fn => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'ai-context-'))
  try {
    await execFileAsync(path.join(root, 'node_modules', '.bin', 'tsc'), [
      srcFile,
      '--outDir',
      outDir,
      '--module',
      'esnext',
      '--target',
      'es2020',
      '--moduleResolution',
      'bundler',
    ])
    const mod = await import(path.join(outDir, 'AiContext.js'))
    return await fn(mod)
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}

test('优先级：选中块 > 页面 > 无', async t => {
  await withCompiled(({ resolveAiContext }) => {
    const sel = resolveAiContext({
      pageKy: 'p1',
      pageTitle: '页',
      blocks: [{ ky: 'b1', text: '内容' }],
    })
    assert.equal(sel.mode, 'selection')
    assert.equal(sel.blocks.length, 1)
    assert.equal(sel.pageKy, 'p1')

    const page = resolveAiContext({ pageKy: 'p1', pageTitle: '页', blocks: [] })
    assert.deepEqual(page, { mode: 'page', pageKy: 'p1', pageTitle: '页' })

    assert.equal(resolveAiContext({ blocks: [] }), null)
    assert.equal(resolveAiContext({ pageKy: null, blocks: [] }), null)
  })
})

test('空文本块被丢弃；全空退回 page', async t => {
  await withCompiled(({ resolveAiContext }) => {
    const ctx = resolveAiContext({ pageKy: 'p1', blocks: [{ text: '  ' }, {}, null] })
    assert.equal(ctx.mode, 'page')
  })
})

test('标签：选中块在前、页面为辅；无标题页面给「当前页面」', async t => {
  await withCompiled(({ resolveAiContext, contextLabel }) => {
    assert.equal(
      contextLabel(resolveAiContext({ pageKy: 'p', pageTitle: '读书', blocks: [{ text: 'a' }, { text: 'b' }] })),
      '2 个选中块 · 页「读书」'
    )
    assert.equal(contextLabel(resolveAiContext({ blocks: [{ text: 'a' }] })), '1 个选中块')
    assert.equal(contextLabel(resolveAiContext({ pageKy: 'p', pageTitle: '读书' })), '页「读书」')
    assert.equal(contextLabel(resolveAiContext({ pageKy: 'p' })), '当前页面')
  })
})

test('操作提示词：说人话，带块数，归纳与建议各一句', async t => {
  await withCompiled(({ resolveAiContext, operationPrompt }) => {
    const sel = resolveAiContext({ blocks: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] })
    assert.equal(operationPrompt(sel, 'summarize'), '请归纳我选中的这 3 个块：核心要点是什么，整体在讲什么。')
    assert.match(operationPrompt(sel, 'suggest'), /基于我选中的这 3 个块/)
    const page = resolveAiContext({ pageKy: 'p', pageTitle: '页' })
    assert.equal(operationPrompt(page, 'summarize'), '请归纳当前这篇笔记：核心要点是什么，整体在讲什么。')
    assert.match(operationPrompt(page, 'suggest'), /基于当前这篇笔记/)
  })
})

test('page 模式 note 只带 ky+标题（维持 v1 约定，不内联正文）', async t => {
  await withCompiled(({ resolveAiContext, contextNote }) => {
    const note = contextNote(resolveAiContext({ pageKy: 'p1', pageTitle: '页' }))
    assert.deepEqual(note, { ky: 'p1', title: '页' })
  })
})

test('selection 模式 note 内联块原文，单块与总量截断都生效', async t => {
  await withCompiled(async ({ resolveAiContext, contextNote, MAX_BLOCK_CHARS, MAX_SELECTION_CHARS }) => {
    // 单块超限：截断并打标（标记算进上限，不破账）
    const long = '字'.repeat(MAX_BLOCK_CHARS + 100)
    const one = contextNote(resolveAiContext({ pageKy: 'p', blocks: [{ ky: 'b1', text: long }] }))
    assert.equal(one.selection.blocks.length, 1)
    assert.ok(one.selection.blocks[0].text.endsWith('……（超长截断）'))
    assert.equal(one.selection.blocks[0].text.length, MAX_BLOCK_CHARS)

    // 总量超限：装不下的块整块舍弃（不是塞半块）
    const blocks = Array.from({ length: 10 }, (_, i) => ({ ky: `b${i}`, text: '字'.repeat(2000) }))
    const many = contextNote(resolveAiContext({ blocks }))
    const total = many.selection.blocks.reduce((s, b) => s + b.text.length, 0)
    assert.ok(total <= MAX_SELECTION_CHARS)
    assert.ok(many.selection.blocks.length < 10)
    // 装下的块保持完整语义：要么原文要么截断标记，不会出现无标记的半截
    for (const b of many.selection.blocks) {
      assert.ok(b.text.length <= MAX_BLOCK_CHARS)
      if (b.text.length === MAX_BLOCK_CHARS) assert.ok(b.text.endsWith('……（超长截断）'))
    }
  })
})
