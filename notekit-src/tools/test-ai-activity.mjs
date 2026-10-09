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
  buildPhases, groupBlocks, phaseKindOf, phaseKindOfName, phaseLabel, rowForTool,
  countUnits, allThinking, MAX_VISIBLE_PHASES,
} = await import(pathToFileURL(phasesPath).href)

const seq = { n: 0 }
const th = (text) => ({ kind: 'thought', at: ++seq.n, text, open: false })
const tool = (title, toolKind, status = 'completed', rawInput) =>
  ({ kind: 'tool', at: ++seq.n, id: 't' + seq.n, title, status, toolKind, rawInput })

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
  // ⚠️ 真机实测：DSH 对所有工具都发 kind="other"，所以分类必须看工具名。
  // 下面第一组全是 other，只有名字能区分 —— 这正是回归点。
  eq('分类：bash + kind=other → running', phaseKindOf(tool('bash', 'other')), 'running')
  eq('分类：shell + other → running', phaseKindOf(tool('shell', 'other')), 'running')
  eq('分类：read_file + other → exploring', phaseKindOf(tool('read_file', 'other')), 'exploring')
  eq('分类：web_search + other → exploring', phaseKindOf(tool('web_search', 'other')), 'exploring')
  eq('分类：str_replace_editor + other → making', phaseKindOf(tool('str_replace_editor', 'other')), 'making')
  eq('分类：todowrite + other → making', phaseKindOf(tool('todowrite', 'other')), 'making')
  eq('分类：工具名识别不出时用 kind 兜底', phaseKindOf(tool('zzz_unknown', 'read')), 'exploring')
  eq('分类：名字和 kind 都不认 → generic', phaseKindOf(tool('zzz_unknown', 'other')), 'generic')
  eq('分类：kind 缺省 + 名字不认 → generic', phaseKindOf(tool('zzz', undefined)), 'generic')
  eq('分类：thought → thinking', phaseKindOf(th('x')), 'thinking')
  eq('分类：名字优先于 kind（bash + kind=read 仍算 running）', phaseKindOf(tool('bash', 'read')), 'running')
}

{
  const p = buildPhases([tool('a', 'execute'), tool('b', 'execute')])[0]
  eq('文案：执行中（live）', phaseLabel(p, true), { verb: '执行中', rest: '2 条命令' })
  eq('文案：已执行（settled）', phaseLabel(p, false), { verb: '已执行', rest: '2 条命令' })
  eq('文案：思考中', phaseLabel(buildPhases([th('a')])[0], true), { verb: '思考中', rest: '' })
  eq('文案：已思考', phaseLabel(buildPhases([th('a')])[0], false), { verb: '已思考', rest: '' })
  eq('文案：探索中', phaseLabel(buildPhases([tool('a', 'read')])[0], true), { verb: '探索中', rest: '1 处' })
  eq('文案：修改中', phaseLabel(buildPhases([tool('a', 'edit')])[0], true), { verb: '修改中', rest: '编辑 1' })
  eq('文案：generic live', phaseLabel(buildPhases([tool('a', 'weird')])[0], true), { verb: '使用中', rest: '' })
}

{
  // 与 Alma 对齐的两条细分（2026-10-09）
  const f = (t, raw) => tool(t, 'other', 'completed', raw)
  eq('文案：全是读文件 → 「N 个文件」',
    phaseLabel(buildPhases([
      f('read_file', { file_path: '/a/1.md' }),
      f('read_file', { file_path: '/a/2.md' }),
    ])[0], false),
    { verb: '已探索', rest: '2 个文件' })
  eq('文案：混了非读文件 → 「N 处」',
    phaseLabel(buildPhases([
      f('read_file', { file_path: '/a/1.md' }),
      f('grep', { pattern: 'TODO' }),
    ])[0], false),
    { verb: '已探索', rest: '2 处' })
  eq('文案：读文件但没有 file_path → 仍是「N 处」',
    phaseLabel(buildPhases([f('read_file', {})])[0], false),
    { verb: '已探索', rest: '1 处' })
  eq('文案：新建与编辑分开计',
    phaseLabel(buildPhases([
      f('write_file', { file_path: '/a/new.md' }),
      f('edit_file', { file_path: '/a/old.md' }),
      f('edit_file', { file_path: '/a/old2.md' }),
    ])[0], false),
    { verb: '已修改', rest: '新建 1 · 编辑 2' })
  eq('文案：只有新建',
    phaseLabel(buildPhases([f('write_file', { file_path: '/a/new.md' })])[0], false),
    { verb: '已修改', rest: '新建 1' })
  eq('文案：删除单独报，不混进「编辑」',
    phaseLabel(buildPhases([
      f('edit_file', { file_path: '/a/1.md' }),
      f('delete_file', { file_path: '/a/2.md' }),
      f('delete_file', { file_path: '/a/3.md' }),
    ])[0], false),
    { verb: '已修改', rest: '编辑 1 · 删除 2' })
  eq('文案：移动单独报',
    phaseLabel(buildPhases([f('move_file', { file_path: '/a/1.md' })])[0], false),
    { verb: '已修改', rest: '移动 1' })
  eq('文案：四类齐全的顺序是 新建/编辑/删除/移动',
    phaseLabel(buildPhases([
      f('write_file', { file_path: '/a/n.md' }),
      f('edit_file', { file_path: '/a/e.md' }),
      f('delete_file', { file_path: '/a/d.md' }),
      f('move_file', { file_path: '/a/m.md' }),
    ])[0], false),
    { verb: '已修改', rest: '新建 1 · 编辑 1 · 删除 1 · 移动 1' })
  eq('文案：只有编辑',
    phaseLabel(buildPhases([f('edit_file', { file_path: '/a/old.md' })])[0], false),
    { verb: '已修改', rest: '编辑 1' })
}

{
  // ---- 负面用例：证明「猜错」不会发生（旧版是子串匹配，下面这些全会判错）----
  eq('无子串猜：renew_license 不是「修改」', phaseKindOf(tool('renew_license', 'other')), 'generic')
  eq('无子串猜：budget_report 不是「探索」', phaseKindOf(tool('budget_report', 'other')), 'generic')
  eq('无子串猜：spreadsheet 不是「探索」', phaseKindOf(tool('spreadsheet', 'other')), 'generic')
  eq('无子串猜：category_sync 不触发「查看」动词', rowForTool(tool('category_sync', 'other')).verb, '调用')
  eq('无子串猜：target_deploy 不触发「查看」动词', rowForTool(tool('target_deploy', 'other')).verb, '调用')
  eq('无子串猜：forget 不触发「查看」动词', rowForTool(tool('forget_cache', 'other')).verb, '调用')

  // 非法 / 认不出的输入：不猜、不炸
  eq('中文工具名 → 认不出，返回 null（不猜）', phaseKindOfName('查看文件'), null)
  eq('空名 → null', phaseKindOfName(''), null)
  eq('undefined → null', phaseKindOfName(undefined), null)
  eq('数字名 → null（不炸）', phaseKindOfName(123), null)
  eq('对象名 → null（不炸）', phaseKindOfName({ a: 1 }), null)
  eq('认不出的工具 → generic（诚实显示为「调用」）', phaseKindOf(tool('zzz_yolo', 'other')), 'generic')
  eq('下划线连写名走别名表', phaseKindOf(tool('web_search', 'other')), 'exploring')
  eq('camelCase 走别名表', phaseKindOf(tool('webSearch', 'other')), 'exploring')

  // rawInput 形状异常：一律退回工具名，不崩
  eq('rawInput 是字符串 → 退回工具名', rowForTool(tool('bash', 'other', 'completed', 'oops')).object, 'bash')
  eq('rawInput 是 null → 退回工具名', rowForTool(tool('bash', 'other', 'completed', null)).object, 'bash')
  eq('rawInput 是数组 → 不炸且退回工具名', rowForTool(tool('bash', 'other', 'completed', [1, 2])).object, 'bash')
  eq('command 是数字 → 视为无内容', rowForTool(tool('bash', 'other', 'completed', { command: 42 })).object, 'bash')
  eq('title 缺失 → 宾语兜底', rowForTool(tool('', 'other')).object, '…')

  // 路径：只折叠，不篡改
  eq('1 段路径原样', rowForTool(tool('read_file', 'other', 'completed', { file_path: '/a' })).object, '/a')
  eq('3 段路径原样（保留前导 /）', rowForTool(tool('read_file', 'other', 'completed', { file_path: '/a/b/c' })).object, '/a/b/c')
  eq('4 段路径折叠中间', rowForTool(tool('read_file', 'other', 'completed', { file_path: '/a/b/c/d' })).object, '/…/b/c/d')
  eq('相对深路径也折叠', rowForTool(tool('read_file', 'other', 'completed', { file_path: 'x/y/z/w' })).object, '…/y/z/w')
  eq('带空格的命令不当路径处理', rowForTool(tool('bash', 'other', 'completed', { command: 'ls /a /b' })).object, 'ls /a /b')
  eq('多行命令挤成单行', rowForTool(tool('bash', 'other', 'completed', { command: 'a\n\n  b' })).object, 'a b')
}

{
  // ---- 表不漂：**能分类就必须有动词** ----
  // 旧版是五张并行表（token→相位 / 连写名→相位 / token→动词 / 连写名→动词 / 子类 token 集合），
  // 给 grep 补了分类却忘了补动词，行里就显示「调用」——而且不报错。这条用例专盯它。
  const names = [
    'bash', 'shell', 'run_script', 'bash_output', 'kill_shell', 'my_custom_bash', 'terminal',
    'read_file', 'readfile', 'read_thread', 'view', 'cat', 'ls', 'list', 'tasklist', 'todoread',
    'grep', 'glob', 'web_search', 'search_thread', 'find', 'web_fetch', 'fetch', 'browse',
    'write_file', 'create', 'mkdir', 'edit_file', 'patch', 'str_replace_editor', 'todowrite',
    'delete_file', 'remove', 'move_file', 'rename', 'skill',
  ]
  for (const nm of names) {
    const kind = phaseKindOfName(nm)
    const verb = rowForTool(tool(nm, 'other')).verb
    ok(`表不漂：${nm} 能分类就必须有动词`, kind === null || verb !== '调用', `kind=${kind} verb=${verb}`)
  }
}

{
  // ---- 子类计数与行动词**同源**（同一张表的两个属性，改一个必须改另一个）----
  const only = (nm) => phaseLabel(buildPhases([tool(nm, 'other')])[0], false)
  eq('同源：write_file 行动词「新建」', rowForTool(tool('write_file', 'other')).verb, '新建')
  eq('同源：write_file 计入「新建 1」', only('write_file'), { verb: '已修改', rest: '新建 1' })
  eq('同源：delete_file 行动词「删除」', rowForTool(tool('delete_file', 'other')).verb, '删除')
  eq('同源：delete_file 计入「删除 1」', only('delete_file'), { verb: '已修改', rest: '删除 1' })
  eq('同源：move_file 行动词「移动」', rowForTool(tool('move_file', 'other')).verb, '移动')
  eq('同源：move_file 计入「移动 1」', only('move_file'), { verb: '已修改', rest: '移动 1' })
  eq('同源：edit_file 落在兜底的「编辑」', [rowForTool(tool('edit_file', 'other')).verb, only('edit_file')],
    ['编辑', { verb: '已修改', rest: '编辑 1' }])
  // skill 归 generic（不影响轨道分相位），但行上动词必须具体
  eq('skill 相位是 generic', phaseKindOfName('skill'), 'generic')
  eq('skill 行动词具体', rowForTool(tool('skill', 'other')).verb, '用了技能')
  eq('skill 相位文案', only('skill'), { verb: '已使用', rest: '' })
}

{
  // 真机形状：DSH 的 title 只有工具名，内容在 rawInput 里
  eq('行：bash + rawInput.command → 执行 <命令>',
    rowForTool(tool('bash', 'other', 'in_progress', { command: 'pwd && ls -la' })),
    { verb: '执行', object: 'pwd && ls -la', running: true, error: false })
  eq('行：rawInput 取不到时退回工具名',
    rowForTool(tool('bash', 'other')),
    { verb: '执行', object: 'bash', running: false, error: false })
  eq('行：深路径折叠中间段，保留前导 /',
    rowForTool(tool('read_file', 'other', 'completed', { file_path: '/Users/x/a/b/c/d/e.txt' })).object,
    '/…/c/d/e.txt')
  eq('行：浅路径原样不动（不篡改数据）',
    rowForTool(tool('read_file', 'other', 'completed', { file_path: '/a/b/c.md' })).object,
    '/a/b/c.md')
  eq('行：command 优先于 description（DSH 的 description 是英文样板）',
    rowForTool(tool('bash', 'other', 'completed', {
      command: 'pnpm test',
      description: 'List all files in current directory',
    })).object,
    'pnpm test')
  eq('行：兼容嵌套 args', rowForTool(tool('bash', 'other', 'completed', { args: { command: 'echo hi' } })).object, 'echo hi')
  eq('行：grep + pattern', rowForTool(tool('grep', 'other', 'completed', { pattern: 'TODO' })).object, 'TODO')
  eq('行：超长文本截断到 80 字',
    rowForTool(tool('bash', 'other', 'completed', { command: 'x'.repeat(200) })).object.length, 80)
  eq('行：completed 不算 running', rowForTool(tool('bash', 'other')).running, false)
  ok('行：failed → error', rowForTool(tool('bash', 'other', 'failed')).error === true)
  eq('行：pending 也算 running', rowForTool(tool('bash', 'other', 'pending')).running, true)
  eq('行：无 title 无 rawInput 兜底', rowForTool(tool('   ', 'other')).object, '…')
  eq('行：名字不认时动词用 kind 兜底', rowForTool(tool('zzz', 'read')).verb, '查看')
  eq('行：名字和 kind 都不认 → 调用', rowForTool(tool('zzz', 'other')).verb, '调用')
}

{
  const ps = buildPhases([th('想'), th('再想'), tool('a', 'execute')])
  eq('计数：thinking 相位按 1 计', countUnits(ps), 2)
  ok('汇总：非全思考', allThinking(ps) === false)
  ok('汇总：全思考', allThinking(buildPhases([th('a'), th('b')])) === true)
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

// 事件形状照抄真机抓到的：DSH 的 title 是工具名、kind 一律 "other"、内容在 rawInput
S.apply({ type: 'turn_start', at: 1, text: '合并重复的两条' })
S.apply({ type: 'thought', at: 2, text: '先看看' })
S.apply({
  type: 'tool', at: 3, toolCallId: 'call_1',
  title: 'read_file', kind: 'other', status: 'pending',
  rawInput: { file_path: '/Users/x/a/b/c/d.txt' }, locations: [{ path: 'k1' }],
})
S.apply({
  type: 'tool', at: 4, toolCallId: 'call_2',
  title: 'bash', kind: 'other', status: 'in_progress',
  rawInput: { command: 'ev get --ky k123' },
})

const t1 = S.items.find((x) => x.kind === 'tool' && x.id === 'call_1')
const t2 = S.items.find((x) => x.kind === 'tool' && x.id === 'call_2')
eq('store：tool 事件收下 toolKind', t1.toolKind, 'other')
eq('store：tool 事件收下 rawInput', t1.rawInput, { file_path: '/Users/x/a/b/c/d.txt' })
eq('store：title 原样保留', t1.title, 'read_file')
eq('store：locations 保留', t1.locations, [{ path: 'k1' }])
eq('store：初始 status', t1.status, 'pending')

S.apply({ type: 'tool_update', at: 5, toolCallId: 'call_1', status: 'completed' })
const t1b = S.items.find((x) => x.kind === 'tool' && x.id === 'call_1')
eq('store：状态跟随 update', t1b.status, 'completed')
eq('store：update 不带 kind 时不清空 toolKind', t1b.toolKind, 'other')
eq('store：update 不带 title 时不清空 title', t1b.title, 'read_file')
eq('store：update 不带 rawInput 时不清空 rawInput', t1b.rawInput, { file_path: '/Users/x/a/b/c/d.txt' })

S.apply({ type: 'tool_update', at: 6, toolCallId: 'call_2', status: 'completed', rawInput: { command: 'ls -la' } })
const t2b = S.items.find((x) => x.kind === 'tool' && x.id === 'call_2')
eq('store：update 里的 rawInput 覆盖', t2b.rawInput, { command: 'ls -la' })

{
  // 两条接缝合起来：store 出来的流水能直接折成相位
  const ps = buildPhases(S.items)
  eq('接缝：store items → 相位种类', ps.map((p) => p.kind), ['thinking', 'exploring', 'running'])
  eq('接缝：活标签', phaseLabel(ps[2], true), { verb: '执行中', rest: '1 条命令' })
  eq('接缝：行 = 动词 + rawInput 宾语', rowForTool(t2b), { verb: '执行', object: 'ls -la', running: false, error: false })
  eq('接缝：深路径缩略保留前导 /', rowForTool(t1b).object, '/…/b/c/d.txt')
}

rmSync(work, { recursive: true, force: true })

console.log(fails.length === 0 ? `全部通过：${pass}/${pass}` : `失败 ${fails.length}/${pass + fails.length}:\n - ` + fails.join('\n - '))
process.exit(fails.length === 0 ? 0 : 1)
