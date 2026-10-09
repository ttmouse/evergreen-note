/**
 * AI 面板「会话」模型的接缝实测（脱 UI，可单跑）：
 *
 *   node tools/test-ai-panel-sessions.mjs
 *
 * 覆盖 2026-10-09 那次重构最容易悄悄坏掉的三件事：
 *   ① 旧「只读快照」迁移成会话（两条来路 + 去重 + 绑当前会话）
 *   ② 事件按 sessionId 分流（A 的回复绝不进 B；找不到归属就丢掉）
 *   ③ 切换回旧会话能继续看/继续发，busy 也按会话各算各的
 *
 * 被测模块是 TS 且结尾会在 window 上建单例 —— 用 esbuild 打到 os.tmpdir()，
 * 每个场景换个 import query 拿一个全新实例。不污染仓库目录。
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const work = mkdtempSync(path.join(tmpdir(), 'nk-ai-sessions-'))
const outfile = path.join(work, 'store.mjs')
await build({
  entryPoints: [path.join(root, 'src/slate-item/addons/AI/AiPanel/AiPanelStore.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'warning',
})

// ------------------------------------------------------------------ 宿主桩
let mem = {}
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v) },
  removeItem: (k) => { delete mem[k] },
}
globalThis.window = { location: { origin: 'http://127.0.0.1:11820', href: 'http://127.0.0.1:11820/static/' } }

let fetchCalls = []
globalThis.fetch = async (url, opts = {}) => {
  fetchCalls.push({ url: String(url), body: opts.body })
  const json = (o) => ({ ok: true, json: async () => o })
  if (String(url).endsWith('/session')) return json({ ok: true, sessionId: 'sess-legacy', agent: 'probe v1' })
  if (String(url).endsWith('/session/new')) return json({ ok: true, sessionId: 'sess-new' })
  return json({ ok: true })
}

let v = 0
/** 拿一个全新 store 实例（可先播种 localStorage） */
const freshStore = async (seed = {}) => {
  mem = { ...seed }
  delete globalThis.window.__nkAiPanelStore
  const mod = await import(pathToFileURL(outfile).href + '?v=' + ++v)
  return mod.aiPanelStore
}

let pass = 0
const fails = []
const ok = (name, cond, extra = '') => (cond ? pass++ : fails.push(`${name}${extra ? ' → ' + extra : ''}`))
const eq = (name, got, want) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)

const item = (kind, text, at = 1000) => ({ kind, at, text, ...(kind === 'thought' ? { open: false } : {}) })
const oldSnap = (at, preview, texts) => ({ at, preview, items: texts.map((t, i) => item('text', t, at + i)) })

// ---------------------------------------------------------------- ① 迁移
{
  const S = await freshStore({
    'nk-ai-panel-history': JSON.stringify([oldSnap(2000, '第二段', ['b1', 'b2']), oldSnap(1000, '第一段', ['a1'])]),
    'nk-ai-panel-current': JSON.stringify(oldSnap(3000, '最新段', ['c1'])),
  })
  eq('迁移：三档都进来了', S.list.length, 3)
  eq('迁移：按时间倒序（最新在前）', S.list.map((c) => c.preview), ['最新段', '第二段', '第一段'])
  ok('迁移：都标了 legacy', S.list.every((c) => c.legacy === true))
  ok('迁移：旧档绑定前没有会话 id', S.list.every((c) => c.acpSessionId === null))
  eq('迁移：当前会话 = 最新那段', S.active.preview, '最新段')

  await S.ensureSession()
  eq('迁移：ensureSession 后全部绑上当前会话', [...new Set(S.list.map((c) => c.acpSessionId))], ['sess-legacy'])
  eq('迁移：写入新格式', JSON.parse(mem['nk-ai-panel-conversations']).conversations.length, 3)
}

// ------------------------------------------------- ② 分流 + ③ 切回 + busy
{
  const S = await freshStore({
    'nk-ai-panel-history': JSON.stringify([oldSnap(2000, '旧段', ['old1'])]),
  })
  await S.ensureSession()                       // 旧段 → sess-legacy
  const legacyId = S.list[0].id

  fetchCalls = []
  const fresh = S.newConversation()             // 新的一段（还没有会话）
  ok('新会话：初始没有 acpSessionId', fresh.acpSessionId === null)
  await S.send('新问题', null)
  ok('新会话：发送时新开一条 ACP 会话', fetchCalls.some((c) => c.url.endsWith('/session/new')))
  const promptCall = fetchCalls.find((c) => c.url.endsWith('/prompt'))
  eq('新会话：prompt 带上自己的 sessionId', JSON.parse(promptCall.body).sessionId, 'sess-new')

  // 事件分流：sess-new 的回话进新段；sess-legacy 的回话进旧段，不能串
  S.apply({ type: 'turn_start', at: 10, sessionId: 'sess-new', text: '新问题' })
  ok('busy：新段在跑', S.busy === true)
  S.apply({ type: 'text', at: 11, sessionId: 'sess-new', text: '新答案' })
  S.apply({ type: 'turn_end', at: 12, sessionId: 'sess-new' })
  ok('busy：跑完就落', S.busy === false)

  S.apply({ type: 'turn_start', at: 13, sessionId: 'sess-legacy', text: '（旧段的一轮）' })
  S.apply({ type: 'text', at: 14, sessionId: 'sess-legacy', text: '这是旧段的回话' })
  S.apply({ type: 'turn_end', at: 15, sessionId: 'sess-legacy' })
  eq('分流：旧段的回话没进当前段', S.items.some((x) => x.text === '这是旧段的回话'), false)

  S.switchTo(legacyId)
  eq('切回旧段：看到它自己的行', S.items.some((x) => x.text === '这是旧段的回话'), true)
  eq('切回旧段：看不到新段的行', S.items.some((x) => x.text === '新答案'), false)
  ok('切回旧段：可以直接接着发（不是只读）', S.busy === false && S.active.acpSessionId === 'sess-legacy')

  // 找不到归属的事件必须丢掉，不能落到当前会话里
  S.apply({ type: 'text', at: 16, sessionId: 'sess-unknown', text: '野事件' })
  eq('分流：无归属的事件被丢掉', S.items.some((x) => x.text === '野事件'), false)

  // 服务端换 id（resume 后降级）要能跟着改绑
  S.apply({ type: 'session_remap', from: 'sess-legacy', sessionId: 'sess-legacy-2' })
  eq('remap：旧段改绑新 id', S.active.acpSessionId, 'sess-legacy-2')
}

// ---------------------------------------------------------------- ④ 持久化
{
  const seeded = {
    'nk-ai-panel-conversations': JSON.stringify({
      activeId: 7777,
      conversations: [{ id: 7777, at: 7777, preview: '存过的', acpSessionId: 'sess-x', items: [item('text', 'hi', 7777)] }],
    }),
    'nk-ai-panel-history': JSON.stringify([oldSnap(2000, '旧段', ['old1'])]),
  }
  const S = await freshStore(seeded)
  eq('持久化：新键优先，旧键补齐', S.list.map((c) => c.preview), ['存过的', '旧段'])
  eq('持久化：activeId 保留', S.active.id, 7777)
  // 同一份种子再开一次，旧键不能重复并入
  const S2 = await freshStore({ ...mem })
  eq('持久化：重跑不产生重复', S2.list.length, 2)
}

// ---------------------------------------------------------------- ⑤ 清空
{
  const S = await freshStore({})
  eq('空存储：给一段空白会话', S.list.length, 1)
  const first = S.list[0].id
  S.clear()
  eq('清空：空白段不堆叠', S.list.length, 1)
  await S.send('说句话', null)                 // 首次发送 → 新开一条会话并绑定
  S.apply({ type: 'turn_start', at: 20, sessionId: 'sess-new', text: '说句话' })
  S.apply({ type: 'text', at: 21, sessionId: 'sess-new', text: '答案' })
  S.apply({ type: 'turn_end', at: 22, sessionId: 'sess-new' })
  S.clear()
  eq('清空：有内容才另起一段', S.list.length, 2)
  ok('清空：旧段留在列表里', S.list.some((c) => c.id === first))
}

rmSync(work, { recursive: true, force: true })
console.log(fails.length === 0 ? `全部通过：${pass}/${pass}` : `失败 ${fails.length}/${pass + fails.length}:\n - ` + fails.join('\n - '))
process.exit(fails.length === 0 ? 0 : 1)
