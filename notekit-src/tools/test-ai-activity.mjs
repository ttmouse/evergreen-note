/**
 * AI 面板「活动轨道」的两处接缝实测（脱 UI，可单跑）：
 *
 *   ① phases.ts      —— 相位推导：相邻同类合并、不跨段合并、文案两态、行映射、分块
 *   ② AiPanelStore   —— 事件→条目映射：tool_call.kind 收进 toolKind、tool_update 空值不覆盖
 *
 * 用法：node tools/test-ai-activity.mjs
 *
 * 两个被测模块都是 TS，先用 esbuild 打到 os.tmpdir() 再动态 import —— 不污染仓库目录，
 * 也避免在 src 下留构建产物。
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const work = mkdtempSync(path.join(tmpdir(), 'nk-ai-activity-'))

async function bundle(entry, name) {
  const outfile = path.join(work, name)
  await build({
    entryPoints: [path.join(root, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'warning',
  })
  return outfile
}

let pass = 0
const fails = []
const ok = (name, cond, extra = '') => (cond ? pass++ : fails.push(`${name}${extra ? ' → ' + extra : ''}`))
const eq = (name, got, want) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)

// ------------------------------------------------------------------ ① phases

const phasesPath = await bundle('src/slate-item/addons/AI/AiPanel/phases.ts', 'phases.mjs')
const {
  buildPhases, groupBlocks, phaseKindOf, phaseLabel, rowForTool,
  countUnits, allThinking, phaseSettled, MAX_VISIBLE_PHASES,
} = await import(pathToFileURL(phasesPath).href)

const seq = { n: 0 }
const th = (text) => ({ kind: 'thought', at: ++seq.n, text, open: false })
const tool = (title, toolKind, status = 'completed') =>
  ({ kind: 'tool', at: ++seq.n, id: 't' + seq.n, title, status, toolKind })

{
  // 切分：思考 → 读 → 执行 = 三个相位
  const ps = buildPhases([th('嗯'), tool('查看 A', 'read'), tool('跑一下', 'execute')])
  eq('切分：三种相位按序', ps.map((p) => p.kind), ['thinking', 'exploring', 'running'])
  eq('切分：每相位条目数', ps.map((p) => p.items.length), [1, 1, 1])
}

{
  // 相邻同类合并
  const ps = buildPhases([tool('a', 'execute'), tool('b', 'execute'), tool('c', 'execute')])
  eq('合并：相邻同类并成一个相位', ps.length, 1)
  eq('合并：条目数', ps[0].items.length, 3)
}

{
  // 非相邻【不】合并 —— 顺序即时间顺序
  const ps = buildPhases([tool('a', 'read'), tool('b', 'execute'), tool('c', 'read')])
  eq('不跨段合并：种类序列', ps.map((p) => p.kind), ['exploring', 'running', 'exploring'])
  eq('不跨段合并：相位个数', ps.length, 3)
}

{
  // 只收 thought + tool
  const ps = buildPhases([
    { kind: 'user', at: 1, text: '改一下' },
    th('想'),
    { kind: 'text', at: 2, text: '好的' },
    tool('写 x', 'edit'),
    { kind: 'permission', at: 3, requestId: 'p', toolCall: null },
    { kind: 'error', at: 4, text: '崩了' },
  ])
  eq('只收 thought+tool：正文/权限/报错不进轨道', ps.map((p) => p.kind), ['thinking', 'making'])
}

{
  eq('kind 映射：未知 → generic', phaseKindOf(tool('x', 'teleport')), 'generic')
  eq('kind 映射：缺省 → generic', phaseKindOf(tool('x', undefined)), 'generic')
  eq('kind 映射：think → thinking', phaseKindOf(tool('x', 'think')), 'thinking')
  eq('kind 映射：thought → thinking', phaseKindOf(th('x')), 'thinking')
  eq('kind 映射：search → exploring', phaseKindOf(tool('x', 'search')), 'exploring')
  eq('kind 映射：delete → making', phaseKindOf(tool('x', 'delete')), 'making')
}

{
  const p = buildPhases([tool('a', 'execute'), tool('b', 'execute')])[0]
  eq('文案：执行中（live）', phaseLabel(p, true), { verb: '执行中', rest: '2 条命令' })
  eq('文案：已执行（settled）', phaseLabel(p, false), { verb: '已执行', rest: '2 条命令' })
  eq('文案：思考中', phaseLabel(buildPhases([th('a')])[0], true), { verb: '思考中', rest: '' })
  eq('文案：已思考', phaseLabel(buildPhases([th('a')])[0], false), { verb: '已思考', rest: '' })
  eq('文案：探索中', phaseLabel(buildPhases([tool('a', 'read')])[0], true), { verb: '探索中', rest: '1 处' })
  eq('文案：修改中', phaseLabel(buildPhases([tool('a', 'edit')])[0], true), { verb: '修改中', rest: '1 处改动' })
  eq('文案：generic live', phaseLabel(buildPhases([tool('a', 'weird')])[0], true), { verb: '使用中', rest: '' })
}

{
  eq('行：动词+宾语（宾语取 ACP title）',
    rowForTool(tool('查看 Alma 应用资源目录', 'read', 'in_progress')),
    { verb: '查看', object: '查看 Alma 应用资源目录', running: true, error: false })
  const r2 = rowForTool(tool('跑测试', 'execute'))
  eq('行：completed 不算 running', [r2.verb, r2.object, r2.running, r2.error], ['执行', '跑测试', false, false])
  ok('行：failed → error', rowForTool(tool('炸了', 'execute', 'failed')).error === true)
  eq('行：pending 也算 running', rowForTool(tool('排队', 'read', 'pending')).running, true)
  eq('行：空 title 兜底', rowForTool(tool('   ', 'read')).object, '…')
  eq('行：无 kind 动词兜底', rowForTool(tool('x', undefined)).verb, '调用')
}

{
  const ps = buildPhases([th('想'), th('再想'), tool('a', 'execute')])
  eq('计数：thinking 相位按 1 计', countUnits(ps), 2)
  ok('汇总：非全思考', allThinking(ps) === false)
  ok('汇总：全思考', allThinking(buildPhases([th('a'), th('b')])) === true)
  ok('收尾：全 completed → settled', phaseSettled(buildPhases([tool('a', 'execute')])[0]) === true)
  ok('收尾：有 in_progress → 未 settled', phaseSettled(buildPhases([tool('a', 'execute', 'in_progress')])[0]) === false)
  ok('收尾：thinking 相位不阻塞', phaseSettled(buildPhases([th('a')])[0]) === true)
  eq('常量：最多显示 8 个头像', MAX_VISIBLE_PHASES, 8)
}

{
  const items = [
    th('想'), tool('a', 'execute'),
    { kind: 'text', at: 9, text: '先查一下' },
    tool('b', 'read'),
    { kind: 'user', at: 10, text: '继续' },
  ]
  const bs = groupBlocks(items)
  eq('分块：正文把轨道切开', bs.map((b) => b.type), ['activity', 'flow', 'activity', 'flow'])
  eq('分块：第一块两个相位', bs[0].phases.map((p) => p.kind), ['thinking', 'running'])
  eq('分块：第二块一个相位', bs[2].phases.map((p) => p.kind), ['exploring'])
  eq('分块：空输入', groupBlocks([]), [])
  eq('分块：纯文本全是 flow', groupBlocks([{ kind: 'text', at: 1, text: 'a' }]).map((b) => b.type), ['flow'])
}

// ------------------------------------------------------------------ ② store

const storePath = await bundle('src/slate-item/addons/AI/AiPanel/AiPanelStore.ts', 'store.mjs')

// store 在模块顶层读 window / localStorage，先补齐宿主再 import
const mem = {}
globalThis.window = globalThis
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => (mem[k] = String(v)),
  removeItem: (k) => delete mem[k],
}
globalThis.EventSource = class {
  close() {}
}

const { AiPanelStore } = await import(pathToFileURL(storePath).href)
const S = new AiPanelStore()

S.apply({ type: 'turn_start', at: 1, text: '合并重复的两条' })
S.apply({ type: 'thought', at: 2, text: '先看看' })
S.apply({
  type: 'tool', at: 3, toolCallId: 'call_1',
  title: '查看 Evergreen note 主题列表', kind: 'read', status: 'pending', locations: [{ path: 'k1' }],
})
S.apply({
  type: 'tool', at: 4, toolCallId: 'call_2',
  title: '跑一下 ev get --ky k123', kind: 'execute', status: 'in_progress',
})

const t1 = S.items.find((x) => x.kind === 'tool' && x.id === 'call_1')
const t2 = S.items.find((x) => x.kind === 'tool' && x.id === 'call_2')
eq('store：tool 事件收下 kind（read）', t1.toolKind, 'read')
eq('store：tool 事件收下 kind（execute）', t2.toolKind, 'execute')
eq('store：title 原样保留', t1.title, '查看 Evergreen note 主题列表')
eq('store：locations 保留', t1.locations, [{ path: 'k1' }])
eq('store：初始 status', t1.status, 'pending')

S.apply({ type: 'tool_update', at: 5, toolCallId: 'call_1', status: 'completed' })
const t1b = S.items.find((x) => x.kind === 'tool' && x.id === 'call_1')
eq('store：状态跟随 update', t1b.status, 'completed')
eq('store：update 不带 kind 时不清空 toolKind', t1b.toolKind, 'read')
eq('store：update 不带 title 时不清空 title', t1b.title, '查看 Evergreen note 主题列表')

S.apply({ type: 'tool_update', at: 6, toolCallId: 'call_2', status: 'completed', kind: 'execute', title: '解析线程引用卡片' })
const t2b = S.items.find((x) => x.kind === 'tool' && x.id === 'call_2')
eq('store：update 里的 title 覆盖', t2b.title, '解析线程引用卡片')
eq('store：update 里的 kind 覆盖', t2b.toolKind, 'execute')

{
  // 两条接缝合起来：store 出来的流水能直接折成相位
  const ps = buildPhases(S.items)
  eq('接缝：store items → 相位种类', ps.map((p) => p.kind), ['thinking', 'exploring', 'running'])
  eq('接缝：活标签', phaseLabel(ps[2], true), { verb: '执行中', rest: '1 条命令' })
}

rmSync(work, { recursive: true, force: true })

console.log(fails.length === 0 ? `全部通过：${pass}/${pass}` : `失败 ${fails.length}/${pass + fails.length}:\n - ` + fails.join('\n - '))
process.exit(fails.length === 0 ? 0 : 1)
