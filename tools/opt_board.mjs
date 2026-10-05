#!/usr/bin/env node
/**
 * 优化点看板生成器（零依赖）
 *
 * 从 ops/optimizations.md（正本）渲染出 ops/optimizations.html（浏览/挑选视图）。
 * 用法：node tools/opt_board.mjs   （在 notekit-src/ 或仓库任意位置均可，路径相对仓库根）
 *
 * 正本格式（由 agent 维护，人也可直接读）：
 *   ## OPT-<id> · <标题>
 *   - status: idea|picked|doing|done|rejected
 *   - area / impact(H|M|L) / cost(S|M|L) / date / source / summary / evidence / plan / proof / note
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'ops', 'optimizations.md')
const OUT = path.join(ROOT, 'ops', 'optimizations.html')

const IMPACT = { H: 3, M: 2, L: 1 }
const COST = { S: 1, M: 2, L: 3 }
const STATUS_ORDER = ['idea', 'picked', 'doing', 'done', 'rejected']
const STATUS_LABEL = { idea: '待挑选', picked: '已拍板', doing: '进行中', done: '已完成', rejected: '已拒绝' }

function parse(md) {
  const items = []
  let cur = null
  for (const raw of md.split(/\r?\n/)) {
    const h = raw.match(/^##\s+(OPT-\S+)\s+·\s+(.+)$/)
    if (h) {
      cur = { id: h[1], title: h[2].trim(), fields: {} }
      items.push(cur)
      continue
    }
    if (!cur) continue
    const f = raw.match(/^-\s+(\w+):\s*(.*)$/)
    if (f) cur.fields[f[1]] = f[2].trim()
  }
  for (const it of items) {
    const f = it.fields
    it.area = f.area || '未分类'
    it.impact = (f.impact || 'M').toUpperCase()
    it.cost = (f.cost || 'M').toUpperCase()
    it.status = (f.status || 'idea').toLowerCase()
    it.score = it.impact in IMPACT && it.cost in COST ? (IMPACT[it.impact] / COST[it.cost]) : 0
  }
  return items
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function card(it) {
  const proof = (it.fields.proof || '').trim()
  const proofLink = proof
    ? /\[(.+?)\]\((.+?)\)/.test(proof)
      ? `<a href="${esc(proof.replace(/\[(.+?)\]\((.+?)\)/, '$2'))}">${esc(proof.replace(/\[(.+?)\]\((.+?)\)/, '$1'))}</a>`
      : esc(proof)
    : ''
  return `<article class="card" data-status="${esc(it.status)}" data-area="${esc(it.area)}" data-score="${it.score}">
  <div class="row1"><span class="id">${esc(it.id)}</span><h3>${esc(it.title)}</h3>
    <span class="score" title="impact/cost">${it.score.toFixed(1)}</span></div>
  <div class="badges">
    <span class="b area">${esc(it.area)}</span>
    <span class="b imp-${esc(it.impact)}">impact ${esc(it.impact)}</span>
    <span class="b cost-${esc(it.cost)}">cost ${esc(it.cost)}</span>
    <span class="b st">${esc(STATUS_LABEL[it.status] || it.status)}</span>
    ${it.fields.date ? `<span class="b date">${esc(it.fields.date)}</span>` : ''}
  </div>
  <p class="sum">${esc(it.fields.summary || '')}</p>
  ${it.fields.evidence ? `<p class="ev"><label>证据</label><code>${esc(it.fields.evidence)}</code></p>` : ''}
  ${it.fields.plan ? `<p class="pl"><label>方向</label>${esc(it.fields.plan)}</p>` : ''}
  ${it.fields.note ? `<p class="nt"><label>备注</label>${esc(it.fields.note)}</p>` : ''}
  ${proofLink ? `<p class="pf"><label>证据</label>${proofLink}</p>` : ''}
</article>`
}

function render(items) {
  const areas = [...new Set(items.map(i => i.area))]
  const counts = {}
  for (const s of STATUS_ORDER) counts[s] = items.filter(i => i.status === s).length
  const group = (ss) => items.filter(i => ss.includes(i.status)).sort((a, b) => b.score - a.score).map(card).join('\n')
  const open = group(['idea'])
  const active = group(['picked', 'doing'])
  const done = group(['done'])
  const rejected = group(['rejected'])

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>优化点看板 · roamedit</title>
<style>
:root{--bg:#f6f6f4;--card:#fff;--ink:#222;--mut:#777;--line:#e4e4e0;--acc:#2563eb}
@media(prefers-color-scheme:dark){:root{--bg:#17181a;--card:#1f2124;--ink:#e8e8e6;--mut:#9a9a96;--line:#313338}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 system-ui,-apple-system,"PingFang SC",sans-serif}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:14px 20px 10px;z-index:2}
header h1{margin:0 0 8px;font-size:17px}
header h1 small{color:var(--mut);font-weight:400;margin-left:8px}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
button,select,input{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:4px 10px}
button.on{border-color:var(--acc);color:var(--acc);font-weight:600}
input{flex:1;min-width:140px}
main{max-width:900px;margin:0 auto;padding:16px 20px 60px}
h2{font-size:14px;color:var(--mut);margin:26px 0 10px;font-weight:600}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:10px 0}
.row1{display:flex;align-items:baseline;gap:10px}
.row1 h3{margin:0;font-size:15px;flex:1}
.id{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--mut)}
.score{font-weight:700;color:var(--acc);font-size:15px}
.badges{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
.b{font-size:11px;border-radius:6px;padding:1px 7px;border:1px solid var(--line);color:var(--mut)}
.b.imp-H{color:#dc2626;border-color:#dc2626}.b.cost-S{color:#16a34a;border-color:#16a34a}
.sum{margin:6px 0}
p{margin:4px 0}label{display:inline-block;min-width:36px;color:var(--mut);font-size:12px}
code{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:color-mix(in srgb,var(--ink) 6%,transparent);padding:1px 5px;border-radius:5px}
a{color:var(--acc)}.cnt{color:var(--mut);font-weight:400}
.hide{display:none}
</style></head><body>
<header>
  <h1>优化点看板 · roamedit <small>正本 ops/optimizations.md · 共 ${items.length} 条 · 待挑选 ${counts.idea} / 进行中 ${counts.picked + counts.doing} / 完成 ${counts.done}</small></h1>
  <div class="bar">
    <button class="on" data-f="all">全部 ${items.length}</button>
    <button data-f="idea">待挑选 ${counts.idea}</button>
    <button data-f="active">进行中 ${counts.picked + counts.doing}</button>
    <button data-f="done">完成 ${counts.done}</button>
    <button data-f="rejected">拒绝 ${counts.rejected}</button>
    <select id="area"><option value="">全部领域</option>${areas.map(a => `<option>${esc(a)}</option>`).join('')}</select>
    <input id="q" placeholder="搜索标题/摘要/证据…">
  </div>
</header>
<main>
<h2>待挑选 <span class="cnt">按 score=impact/cost 排序，挑顶部开始</span></h2>
${open || '<p style="color:var(--mut)">（空）</p>'}
<h2>进行中</h2>
${active || '<p style="color:var(--mut)">（空）</p>'}
<h2>已完成</h2>
${done || '<p style="color:var(--mut)">（空）</p>'}
${counts.rejected ? `<h2>已拒绝</h2>${rejected}` : ''}
</main>
<script>
const btns=[...document.querySelectorAll('button[data-f]')];const area=document.getElementById('area');const q=document.getElementById('q');
let f='all';
function apply(){const cards=[...document.querySelectorAll('.card')];for(const c of cards){
  const okF=f==='all'||(f==='active'?['picked','doing'].includes(c.dataset.status):c.dataset.status===f);
  const okA=!area.value||c.dataset.area===area.value;
  const okQ=!q.value||c.textContent.toLowerCase().includes(q.value.toLowerCase());
  c.classList.toggle('hide',!(okF&&okA&&okQ));}
 for(const b of btns)b.classList.toggle('on',b.dataset.f===f);}
btns.forEach(b=>b.onclick=()=>{f=b.dataset.f;apply()});area.onchange=apply;q.oninput=apply;
</script></body></html>`
}

if (!existsSync(SRC)) {
  console.error(`正本不存在: ${SRC}`)
  process.exit(1)
}
const items = parse(readFileSync(SRC, 'utf8'))
const bad = items.filter(i => !STATUS_ORDER.includes(i.status))
if (bad.length) {
  console.error('状态字段非法（应为 ' + STATUS_ORDER.join('|') + '）:', bad.map(i => i.id + '=' + i.status).join(', '))
  process.exit(1)
}
writeFileSync(OUT, render(items))
console.log(`已生成 ${OUT}（${items.length} 条：待挑选 ${items.filter(i => i.status === 'idea').length}）`)
