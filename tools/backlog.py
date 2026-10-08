#!/usr/bin/env python3
"""优化点流水线 CLI —— 管理 backlog/ 下的优化点（与 backlog/README.md、backlog/template.md 配套）。

用法：
  python3 tools/backlog.py add --dim perf --impact 5 --effort 3 --title "标题"
  python3 tools/backlog.py set accepted OP-004 OP-005
  python3 tools/backlog.py set rejected OP-006 -m "无运行时收益"
  python3 tools/backlog.py set deferred OP-007 --until 2026-11-01 -m "等依赖落地"
  python3 tools/backlog.py set done OP-002 --evidence notes/xxx验收20261002.md
  python3 tools/backlog.py dup "回收站"
  python3 tools/backlog.py index
  python3 tools/backlog.py stats

仅标准库。数据即文件：backlog/items/YYYY-MM/OP-NNN-slug.md（flat front-matter）。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKLOG = ROOT / "backlog"
ITEMS_DIR = BACKLOG / "items"
INDEX_HTML = BACKLOG / "INDEX.html"

DIMS = ("perf", "product", "ux", "design", "quality", "security")
DIM_NAMES = {
    "perf": "性能", "product": "产品", "ux": "交互体验", "design": "设计",
    "quality": "工程质量", "security": "安全",
}
STATUSES = ("inbox", "accepted", "doing", "deferred", "rejected", "done")
OPEN_STATUSES = ("inbox", "accepted", "doing", "deferred")
FRONT_KEYS = ("id", "title", "dim", "subtype", "status", "date", "impact", "effort", "source", "evidence", "until", "reason", "dup")

# 二级分类：这条优化点解决的到底是什么问题（枚举清单，新增子类先改这里+README 再使用）
SUBTYPES = {
    "perf": ["启动耗时", "操作卡顿", "加载传输", "内存占用"],
    "product": ["功能缺失", "流程不顺", "数据安全", "集成联动"],
    "ux": ["操作反馈", "快捷键", "导航查找", "信息呈现", "错误恢复"],
    "design": ["视觉层次", "一致性", "布局密度", "主题外观"],
    "quality": ["版本管理", "类型与测试", "依赖清理", "构建产物"],
    "security": ["访问控制", "输入校验", "数据泄露"],
}


def dim_cell(it):
    d = DIM_NAMES.get(it.get("dim"), it.get("dim", ""))
    s = it.get("subtype", "")
    return f"{d}/{s}" if s else d

TODAY = dt.date.today().isoformat()


def warn(msg: str) -> None:
    print(f"⚠  {msg}", file=sys.stderr)


def die(msg: str, code: int = 2) -> None:
    print(f"✗  {msg}", file=sys.stderr)
    sys.exit(code)


# ---------- 解析 ----------

def parse_item(path: Path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
    if not m:
        warn(f"{path.relative_to(ROOT)}：缺 front-matter，跳过")
        return None
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip().strip('"').strip("'")
    if not meta.get("id"):
        warn(f"{path.relative_to(ROOT)}：缺 id，跳过")
        return None
    item = {"path": path, "body": m.group(2)}
    item.update(meta)
    return item


def load_items():
    items = []
    if ITEMS_DIR.exists():
        for p in sorted(ITEMS_DIR.rglob("*.md")):
            it = parse_item(p)
            if it is not None:
                items.append(it)
    items.sort(key=lambda x: x.get("id", ""))
    return items


def load_by_id(ids):
    items = load_items()
    table = {}
    for it in items:
        table[it["id"]] = it
    missing = [i for i in ids if i not in table]
    return table, missing


def norm_id(raw: str) -> str:
    s = raw.strip().upper()
    if not s.startswith("OP-"):
        s = "OP-" + s
    m = re.match(r"^OP-(\d+)$", s)
    if not m:
        die(f"非法 ID：{raw}（应为 OP-NNN）")
    return f"OP-{int(m.group(1)):03d}"


def next_number(items) -> int:
    mx = 0
    for it in items:
        m = re.match(r"^OP-(\d+)$", it.get("id", ""))
        if m:
            mx = max(mx, int(m.group(1)))
    return mx + 1


def slugify(title: str) -> str:
    s = re.sub(r"[\s/\\|:]+", "-", title.strip())
    s = "".join(ch for ch in s if ch.isalnum() or ch in "-_·一-龥")
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return (s[:24] or "untitled").strip("-")


# ---------- 写文件 ----------

def render(item: dict) -> str:
    lines = ["---"]
    for k in FRONT_KEYS:
        if k in item and item[k] != "":
            lines.append(f"{k}: {item[k]}")
    lines += [k + ": " + str(v) for k, v in item.items()
              if k not in FRONT_KEYS and k not in ("path", "body") and v != ""]
    lines.append("---")
    return "\n".join(lines) + "\n" + item["body"]


def append_log(item: dict, line: str) -> None:
    body = item["body"].rstrip("\n")
    entry = f"- {TODAY}: {line}"
    if "## 决策记录" in body:
        item["body"] = body + "\n" + entry + "\n"
    else:
        item["body"] = body + "\n\n## 决策记录\n\n" + entry + "\n"


def maybe_regenerate_index(a) -> None:
    if getattr(a, "no_index", False):
        print("↷ 已跳过面板重生成；稍后可运行 python3 tools/backlog.py index")
        return
    cmd_html(None)


TEMPLATE_BODY = """# {iid} · {title}

## 现状与证据

（文件:行号 / 实测命令与数字 / 用户原话——必须可复核，无证据不入库）

## 建议方向

1.

## 验收标准（草案）

-

## 决策记录

（待筛选）
"""


# ---------- 子命令 ----------

def cmd_add(a):
    if a.dim not in DIMS:
        die(f"dim 非法：{a.dim}，可选 {', '.join(DIMS)}")
    if not a.subtype.strip():
        warn("未填 --subtype（解决什么问题的二级分类），枚举见 README；缺省入库后补")
    elif a.subtype.strip() not in SUBTYPES.get(a.dim, []):
        warn(f"子类 '{a.subtype.strip()}' 不在预设枚举里（{a.dim}: {'/'.join(SUBTYPES[a.dim])}），确属新问题类型请先补 README 清单")
    if not a.title.strip():
        die("title 不能为空")
    for k in ("impact", "effort"):
        v = getattr(a, k)
        if not (1 <= v <= 5):
            die(f"{k} 应为 1-5")
    date = a.date or TODAY
    items = load_items()
    n = next_number(items)
    iid = f"OP-{n:03d}"
    month_dir = ITEMS_DIR / date[:7]
    month_dir.mkdir(parents=True, exist_ok=True)
    path = month_dir / f"{iid}-{slugify(a.title)}.md"
    if path.exists():
        die(f"文件已存在：{path}")
    dup_hits = [it for it in items
                if a.title.strip().lower() in (it.get("title", "") + " " + it.get("dup", "")).lower()]
    meta = {
        "id": iid, "title": a.title.strip(), "dim": a.dim, "subtype": a.subtype.strip(), "status": a.status,
        "date": date, "impact": a.impact, "effort": a.effort,
        "source": a.source, "evidence": "", "dup": a.dup or "",
    }
    body = TEMPLATE_BODY.format(iid=iid, title=a.title.strip())
    item = dict(meta)
    item["body"] = body
    path.write_text(render(item), encoding="utf-8")
    print(f"✓ 新增 {iid} → {path.relative_to(ROOT)}")
    maybe_regenerate_index(a)  # 默认改动即重生成面板，浏览器点「刷新」即可看到
    if dup_hits:
        warn(f"疑似重复 {len(dup_hits)} 条，请核对：" + "、".join(
            f'{h["id"]}[{h.get("status")}]' for h in dup_hits))


def cmd_set(a):
    if a.status not in STATUSES:
        die(f"status 非法：{a.status}，可选 {', '.join(STATUSES)}")
    if a.status == "rejected" and not a.m:
        die("rejected 必须给 -m 否决原因（用于防 AI 重复生成）")
    if a.status == "deferred" and not (a.m and a.until):
        die("deferred 必须给 -m 暂缓原因和 --until 复查日期")
    if a.status == "done" and not a.evidence:
        die("done 必须给 --evidence 验收记录路径（代码改完≠完成）")
    ids = [norm_id(x) for x in a.ids]
    table, missing = load_by_id(ids)
    if missing:
        die("找不到：" + "、".join(missing))
    ok = 0
    for iid in ids:
        it = table[iid]
        old = it.get("status", "?")
        it["status"] = a.status
        if a.evidence:
            it["evidence"] = a.evidence
        if a.until:
            it["until"] = a.until
        if a.m:
            it["reason"] = a.m
        note = f"{old} → {a.status}"
        if a.m:
            note += f"（{a.m}）"
        if a.evidence:
            note += f" 证据：{a.evidence}"
        append_log(it, note)
        it["path"].write_text(render(it), encoding="utf-8")
        print(f"✓ {iid}: {note}")
        ok += 1
    print(f"共 {ok} 条")
    if ok:
        maybe_regenerate_index(a)  # 默认改动即重生成面板


def cmd_dup(a):
    q = a.query.strip().lower()
    if not q:
        die("query 不能为空")
    items = load_items()
    hits = []
    for it in items:
        hay = " ".join([it.get("id", ""), it.get("title", ""), it.get("subtype", ""), it.get("dup", ""),
                        it.get("reason", ""), it["path"].name]).lower()
        if q in hay:
            hits.append(it)
    if not hits:
        print(f"无命中（{len(items)} 条已检索，含 done/rejected）")
        return
    print(f"命中 {len(hits)} 条：")
    for it in hits:
        print(f'  {it["id"]} [{it.get("dim")}/{it.get("status")}] {it.get("title", "")}  ({it["path"].relative_to(ROOT)})')
    warn("生成新条目前先看这些是否已覆盖，同根因合并，不要重复入库")


def _row(cells):
    def c(x):
        return str(x).replace("|", "／")
    return "| " + " | ".join(c(x) for x in cells) + " |"


HTML_TMPL = r'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>优化点面板</title>
<style>
:root{--bg:#f6f6f3;--card:#fdfdfc;--ink:#1e1e1b;--muted:#70706a;--line:#e6e6e0;--line2:#d7d7cf;--accent:#3556c9;--accent-ink:#2a459f;--accent-soft:#edf1fc;--radius:10px;--ease:cubic-bezier(.23,1,.32,1);color-scheme:light}
*{box-sizing:border-box}
body{margin:0;padding:28px 24px 88px;font:14px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--ink)}
.wrap{max-width:1120px;margin:0 auto}
h1{font-size:19px;font-weight:650;letter-spacing:-.01em;margin:0 0 4px}
.sub{color:var(--muted);font-size:12.5px;margin:0 0 16px;max-width:72ch}
.sub code{background:var(--card);border:1px solid var(--line);border-radius:5px;padding:0 5px;font-size:11.5px}
.seg{display:inline-flex;background:#ecece7;border:1px solid var(--line);border-radius:9px;padding:3px;gap:2px;margin-bottom:12px}
.tab{border:0;background:transparent;border-radius:7px;padding:4px 12px;cursor:pointer;font-size:13px;color:var(--muted);transition:background .14s var(--ease),color .14s var(--ease)}
.tab:hover{color:var(--ink)}
.tab.on{background:var(--card);color:var(--ink);font-weight:600;box-shadow:0 1px 2px rgba(20,20,15,.08)}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px}
#subs:empty{display:none}
#dims .chip{order:-1}
.chip{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:3px 12px;cursor:pointer;font-size:12.5px;color:var(--ink);transition:border-color .14s var(--ease),background .14s var(--ease),color .14s var(--ease)}
.chip:hover{border-color:var(--line2)}
.chip.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent-ink);font-weight:550}
input[type=search]{height:32px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:0 12px;font-size:13px;min-width:230px;margin-left:auto;transition:border-color .14s var(--ease)}
input[type=search]::placeholder{color:var(--muted)}
input[type=search]:hover{border-color:var(--line2)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
table{width:100%;border-collapse:separate;border-spacing:0;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
th{font-size:11.5px;font-weight:500;color:var(--muted);text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
th:first-child{width:34px}
td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top;font-size:13px}
tbody tr{transition:background .12s var(--ease)}
tbody tr:hover{background:#f4f4f0}
tbody tr:last-child td{border-bottom:0}
td:first-child{width:34px;white-space:nowrap}
td.cid{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
input[type=checkbox]{width:15px;height:15px;accent-color:var(--accent);cursor:pointer}
.badge{display:inline-block;border-radius:6px;padding:1px 8px;font-size:11.5px;font-weight:500;white-space:nowrap}
.d-perf,.d-product,.d-ux,.d-design,.d-quality,.d-security{background:#f0f0ec;color:var(--ink);position:relative;padding-left:20px}
.d-perf::before,.d-product::before,.d-ux::before,.d-design::before,.d-quality::before,.d-security::before{content:"";position:absolute;left:8px;top:50%;transform:translateY(-50%);width:7px;height:7px;border-radius:50%}
.d-perf::before{background:#3b6fd4}
.d-product::before{background:#7a4fd0}
.d-ux::before{background:#1f8f7a}
.d-design::before{background:#c04f8c}
.d-quality::before{background:#8a8a82}
.d-security::before{background:#c04545}
.s-inbox{background:#f8edd2;color:#7a5205}
.s-accepted{background:#dcefe9;color:#17614c}
.s-doing{background:#e3eafb;color:#2c47a8}
.s-deferred{background:#ececea;color:#5f5f59}
.s-rejected{background:#f6e4e2;color:#96382f}
.s-done{background:#e2f0e4;color:#1f6b3a}
.tit{max-width:560px;position:relative}
.tit>span:first-child{font-weight:600;overflow-wrap:break-word}
.tit:has(.ops button){padding-right:178px}
.reason{color:var(--muted);font-size:12px;margin-top:2px;overflow-wrap:break-word}
.tit .ie{display:inline-block;margin-left:8px;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.ie b{font-weight:600;color:var(--ink)}
.ie i{font-style:normal}
td:nth-child(5){white-space:nowrap}
td:nth-child(6){white-space:nowrap;color:var(--muted);font-size:12.5px;font-variant-numeric:tabular-nums}
.ops{position:absolute;right:10px;top:50%;transform:translateY(-50%);display:flex;gap:6px;padding:3px 4px 3px 14px;opacity:0;pointer-events:none;transition:opacity .12s var(--ease)}
tbody tr:hover .ops,tbody tr:focus-within .ops{opacity:1;pointer-events:auto}
@media(hover:none){.ops{position:static;transform:none;opacity:1;pointer-events:auto;padding:6px 0 0;display:flex}.tit:has(.ops button){padding-right:0}}
/* OP-022 窄屏：六列表格在 ≈860px 以下把标题压到 15 字/行以内（768px 实测 143px）且 ID 换行、
   390px 整页横向溢出（表格最小 705px）。断点取自实测：1024px 标题文本 339px 正常，768px 143px 不可读。
   窄屏改为标题卡堆叠：标题（order:-1）全宽居前，ID/分类/状态/日期作为 flex 行收拢到标题下方；
   卡片内同步复位 OP-023 的 178px 标题预留并把 .ops 转为文档流内一行（否则 390px 标题仅剩 136px），
   「操作不盖标题」语义不变；触控设备继续由 hover:none 分支处理。 */
@media(max-width:860px){
  thead{display:none}
  table,tbody{display:block;width:100%;border:0;background:none;border-radius:0;overflow:visible}
  tbody tr{display:flex;flex-wrap:wrap;align-items:center;border:1px solid var(--line);border-radius:var(--radius);background:var(--card);margin-bottom:10px;padding:10px 12px 10px 38px;position:relative}
  td{display:block;padding:0;border-bottom:0}
  td:first-child{position:absolute;left:13px;top:12px;width:auto}
  td.tit{order:-1;width:100%;max-width:none}
  td.cid,td:nth-child(4),td:nth-child(5),td:nth-child(6){margin-top:7px;margin-right:6px}
  .tit:has(.ops button){padding-right:0}
  .ops{position:static;transform:none;padding:6px 0 0;width:100%}
}
button.act{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:7px;padding:3px 10px;font-size:12px;cursor:pointer;transition:border-color .14s var(--ease),background .14s var(--ease),color .14s var(--ease),transform .1s var(--ease)}
button.act:hover{border-color:var(--accent);color:var(--accent-ink);background:var(--accent-soft)}
button.act:active{transform:scale(.97)}
button.act.danger:hover{border-color:#c04545;color:#96382f;background:#f9ecea}
.selbar{position:fixed;left:0;right:0;bottom:0;z-index:3;background:var(--card);border-top:1px solid var(--line);box-shadow:0 -4px 16px rgba(20,20,15,.06);padding:12px 24px;display:none;align-items:center;gap:12px;font-size:13px}
.selbar.show{display:flex}
.selbar b{color:var(--accent-ink)}
#toast{position:fixed;bottom:68px;left:50%;transform:translate(-50%,6px);background:var(--ink);color:#faf9f6;border-radius:8px;padding:8px 16px;font-size:13px;max-width:80vw;word-break:break-all;opacity:0;pointer-events:none;transition:opacity .18s var(--ease),transform .18s var(--ease);z-index:4}
#toast.show{opacity:.97;transform:translate(-50%,0)}
.refresh{padding:6px 14px;font-size:13px;margin-left:8px}
.refresh svg{vertical-align:-2px;margin-right:4px}
.empty{color:var(--muted);text-align:center;padding:40px 0 8px}
.empty p{margin:0 0 10px}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>
<div class="wrap">
<h1>优化点面板</h1>
<p class="sub">生成于 __TIME__</p>
<div class="seg" id="tabs"></div>
<div class="bar" id="dims"></div>
<div class="bar" id="subs"></div>
<table><thead><tr><th></th><th>标题</th><th>ID</th><th>分类</th><th>状态</th><th>日期</th></tr></thead><tbody id="rows"></tbody></table>
<div class="empty" id="empty" style="display:none"><p>没有匹配的优化点</p><button class="act" id="resetf">清空筛选条件</button></div>
</div>
<div class="selbar" id="selbar">已选 <b id="seln">0</b> 条 <button class="act" id="selgo">复制立项命令</button> <button class="act" id="selgo2">复制否决命令</button></div>
<div id="toast"></div>
<script>
const DATA=__DATA__;
const DIMS={perf:'性能',product:'产品',ux:'交互体验',design:'设计',quality:'工程质量',security:'安全'};
const SL={inbox:'待筛选',accepted:'已立项',doing:'进行中',deferred:'暂缓',rejected:'已否决',done:'已完成'};
const TABS=[['open','未决',i=>['inbox','accepted','doing','deferred'].includes(i.status)],['inbox','待筛',i=>i.status==='inbox'],['accepted','已立项',i=>['accepted','doing'].includes(i.status)],['deferred','暂缓',i=>i.status==='deferred'],['rejected','已否决',i=>i.status==='rejected'],['done','已完成',i=>i.status==='done']];
let tab='open',dims=new Set(),subs=new Set(),q='';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const h=i=>(i.title+' '+i.id+' '+(i.subtype||'')+' '+(i.reason||'')).toLowerCase();
const sel=new Set();
function toast(t){const el=document.getElementById('toast');el.textContent=t;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2500)}
function copy(t){const ok=()=>toast('已复制：'+t);const fb=()=>{const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();ok()};(navigator.clipboard&&navigator.clipboard.writeText)?navigator.clipboard.writeText(t).then(ok,fb):fb()}
function cmd(status,id,extra){return `python3 tools/backlog.py set ${status} ${id}${extra||''}`}
function drawTabs(){const el=document.getElementById('tabs');el.innerHTML='';for(const[k,label,f]of TABS){const n=DATA.filter(i=>f(i)&&h(i).includes(q.toLowerCase())).length;const b=document.createElement('button');b.className='tab'+(tab===k?' on':'');b.textContent=`${label} ${n}`;b.onclick=()=>{tab=k;draw()};el.appendChild(b)}}
function drawDims(){const el=document.getElementById('dims');el.innerHTML='';const s=document.createElement('input');s.type='search';s.placeholder='搜索标题/ID/原因…';s.value=q;s.oninput=()=>{q=s.value;draw(false)};el.appendChild(s);const r=document.createElement('button');r.className='act refresh';r.title='重新读取最新面板数据';r.innerHTML='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>刷新';r.onclick=()=>{location.search='t='+Date.now()};el.appendChild(r);for(const d of Object.keys(DIMS)){if(!DATA.some(i=>i.dim===d))continue;const c=document.createElement('button');c.className='chip'+(dims.has(d)?' on':'');c.textContent=DIMS[d];c.onclick=()=>{dims=new Set(dims.has(d)?[]:[d]);subs.clear();draw()};el.appendChild(c)}}
function drawSubs(){const el=document.getElementById('subs');el.innerHTML='';if(!dims.size)return;const seen=new Map();for(const i of DATA){if(dims.has(i.dim)&&i.subtype&&!seen.has(i.subtype))seen.set(i.subtype,0);if(dims.has(i.dim)&&i.subtype)seen.set(i.subtype,seen.get(i.subtype)+1)}for(const[s,n]of seen){const c=document.createElement('button');c.className='chip'+(subs.has(s)?' on':'');c.textContent=`${s} ${n}`;c.onclick=()=>{subs.has(s)?subs.delete(s):subs.add(s);draw()};el.appendChild(c)}}
function draw(updateFilters=true){drawTabs();if(updateFilters){drawDims();drawSubs()}const tb=document.getElementById('rows');tb.innerHTML='';const f=TABS.find(t=>t[0]===tab)[2];const list=DATA.filter(i=>f(i)&&(!dims.size||dims.has(i.dim))&&(!subs.size||subs.has(i.subtype))&&h(i).includes(q.toLowerCase())).sort((a,b)=>(b.impact-a.impact)||(a.effort-b.effort)||a.id.localeCompare(b.id));const empty=document.getElementById('empty');empty.style.display=list.length?'none':'block';for(const i of list){const tr=document.createElement('tr');tr.innerHTML=`<td>${i.status==='inbox'?`<input type="checkbox" data-id="${i.id}" ${sel.has(i.id)?'checked':''}>`:''}</td><td class="tit"><span title="${esc(i.file)}">${esc(i.title)}</span>${i.reason?`<div class="reason">${esc(i.reason)}</div>`:''}<span class="ie">I<b>${esc(i.impact)}</b><i>/E${esc(i.effort)}</i></span><span class="ops"></span></td><td class="cid">${esc(i.id)}</td><td><span class="badge d-${esc(i.dim)}">${esc(i.subtype||DIMS[i.dim]||i.dim)}</span></td><td><span class="badge s-${esc(i.status)}">${esc(SL[i.status]||i.status)}</span></td><td>${esc(i.date)}${i.until?`<div class="reason">→${esc(i.until)}</div>`:''}</td>`;const td=tr.querySelector('.ops');const add=(t,c)=>{const b=document.createElement('button');b.className='act'+(c==='rejected'?' danger':'');b.textContent=t;b.onclick=()=>copy(cmd(c,i.id,c==='deferred'?' --until 2026-11-01 -m "原因"':c==='rejected'?' -m "原因"':c==='done'?' --evidence notes/xxx验收YYYYMMDD.md':''));td.appendChild(b)};if(i.status==='inbox'){add('立项','accepted');add('暂缓','deferred');add('否决','rejected')}else if(['accepted','doing'].includes(i.status)){add('完成','done');add('否决','rejected')}else if(i.status==='deferred'){add('立项','accepted');add('否决','rejected')}
tb.appendChild(tr)}
tb.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.onchange=()=>{cb.checked?sel.add(cb.dataset.id):sel.delete(cb.dataset.id);drawSel()});drawSel()}
function drawSel(){const bar=document.getElementById('selbar');bar.classList.toggle('show',sel.size>0);document.getElementById('seln').textContent=sel.size}
document.getElementById('selgo').onclick=()=>{if(sel.size)copy([...sel].map(id=>'python3 tools/backlog.py set accepted '+id).join(' && '))};
document.getElementById('selgo2').onclick=()=>{if(sel.size)copy([...sel].map(id=>'python3 tools/backlog.py set rejected '+id+' -m "原因"').join(' && '))};
function resetFilters(){tab='open';dims.clear();subs.clear();q='';const s=document.querySelector('#dims input');if(s)s.value='';draw()}
document.getElementById('resetf').onclick=resetFilters;
draw();
</script>
</body>
</html>
'''


def cmd_html(a):
    items = load_items()
    if not items:
        die("backlog/items/ 下还没有条目")
    data = []
    for it in items:
        data.append({k: it.get(k, "") for k in
                     ("id", "title", "dim", "subtype", "status", "date", "impact", "effort", "until", "reason", "evidence")}
                    | {"file": it["path"].relative_to(ROOT).as_posix()})
    html = (HTML_TMPL.replace("__DATA__", json.dumps(data, ensure_ascii=False))
            .replace("__TIME__", dt.datetime.now().strftime("%Y-%m-%d %H:%M")))
    INDEX_HTML.write_text(html, encoding="utf-8")
    print(f"✓ 已生成 {INDEX_HTML.relative_to(ROOT)}（{len(items)} 条："
          + "、".join(f"{s} {sum(1 for i in items if i.get('status')==s)}"
                      for s in STATUSES if sum(1 for i in items if i.get('status')==s)) + "）")


def cmd_stats(a):
    items = load_items()
    if not items:
        die("backlog/items/ 下还没有条目")
    print(f"共 {len(items)} 条")
    for s in STATUSES:
        n = sum(1 for i in items if i.get("status") == s)
        print(f"  {s:10s} {n}")
    print("按维度：")
    for d in DIMS:
        n = sum(1 for i in items if i.get("dim") == d)
        if n:
            print(f"  {DIM_NAMES[d]}({d})  {n}")
    inbox = [i for i in items if i.get("status") == "inbox" and i.get("date")]
    if inbox:
        old = min(i["date"] for i in inbox)
        age = (dt.date.today() - dt.date.fromisoformat(old)).days
        print(f"最老未筛选：{old}（{age} 天前）")
        if len(inbox) > 100:
            warn(f"inbox {len(inbox)} 条 >100：暂停生成，先筛选")
    nxt = f"OP-{next_number(items):03d}"
    print(f"下一条 ID：{nxt}")


def cmd_export(a):
    import csv
    import io

    items = load_items()
    if not items:
        die("backlog/items/ 下还没有条目")
    sel = items if a.all else [i for i in items if i.get("status") in OPEN_STATUSES]
    cols = ["id", "dim", "subtype", "status", "impact", "effort", "title", "date", "until", "reason", "file"]

    def val(it, k):
        if k == "dim":
            return f'{DIM_NAMES.get(it.get("dim"), it.get("dim", ""))}({it.get("dim", "")})'
        if k == "file":
            return it["path"].relative_to(ROOT).as_posix()
        return it.get(k, "")

    buf = io.StringIO()
    if a.format == "csv":
        w = csv.writer(buf)
        w.writerow(cols)
        for it in sel:
            w.writerow([val(it, k) for k in cols])
    else:
        buf.write(_row(["ID", "维度", "子类", "状态", "I", "E", "标题", "入库", "复查", "原因/备注"]) + "\n")
        buf.write(_row(["---"] * 10) + "\n")
        for it in sel:
            buf.write(_row([it["id"], val(it, "dim"), it.get("subtype", ""), it.get("status", ""),
                            it.get("impact", ""), it.get("effort", ""), it.get("title", ""),
                            it.get("date", ""), it.get("until", ""), it.get("reason", "")]) + "\n")
        buf.write("\n")
    text = buf.getvalue()
    if a.out:
        Path(a.out).write_text(text, encoding="utf-8")
        print(f"✓ 导出 {len(sel)} 条 → {a.out}")
    else:
        sys.stdout.write(text)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("add", help="新增一条优化点（自动编号，默认 status=inbox）")
    p.add_argument("--dim", required=True, help="维度：" + "/".join(DIMS))
    p.add_argument("--impact", type=int, required=True, help="1-5 用户可感知收益")
    p.add_argument("--effort", type=int, required=True, help="1-5 实现成本")
    p.add_argument("--title", required=True, help="一句话标题：现状+代价")
    p.add_argument("--subtype", default="", help="二级分类：具体解决什么问题，枚举见 README")
    p.add_argument("--dup", default="", help="查重关键词（空格分隔，写同义词/代码符号）")
    p.add_argument("--date", default="", help="入库日期 YYYY-MM-DD，默认今天")
    p.add_argument("--source", default="ai", help="ai|user")
    p.add_argument("--no-index", action="store_true", help="只写条目，不重生成 backlog/INDEX.html")
    p.add_argument("--status", default="inbox", help=argparse.SUPPRESS)
    p.set_defaults(fn=cmd_add)

    p = sub.add_parser("set", help="批量改状态：set STATUS ID [ID...]")
    p.add_argument("status", choices=STATUSES)
    p.add_argument("ids", nargs="+")
    p.add_argument("-m", default="", help="原因（rejected/deferred 必填）")
    p.add_argument("--until", default="", help="deferred 复查日期 YYYY-MM-DD")
    p.add_argument("--evidence", default="", help="done 必填：验收记录路径")
    p.add_argument("--no-index", action="store_true", help="只写条目，不重生成 backlog/INDEX.html")
    p.set_defaults(fn=cmd_set)

    p = sub.add_parser("dup", help="查重：标题/dup 关键词/否决原因 子串检索（含 done/rejected）")
    p.add_argument("query")
    p.set_defaults(fn=cmd_dup)

    p = sub.add_parser("index", help="重新生成 backlog/INDEX.html 面板（与 html 同义）")
    p.set_defaults(fn=cmd_html)

    p = sub.add_parser("html", help="同 index")
    p.set_defaults(fn=cmd_html)

    p = sub.add_parser("stats", help="打印统计")
    p.set_defaults(fn=cmd_stats)

    p = sub.add_parser("export", help="导出表格（csv 可建库导入，md 可直接粘贴进 Notion/飞书自动转表格）")
    p.add_argument("--format", choices=("md", "csv"), default="md")
    p.add_argument("--all", action="store_true", help="含 done/rejected（默认只导未决）")
    p.add_argument("--out", default="", help="写入文件，缺省打印到 stdout")
    p.set_defaults(fn=cmd_export)

    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
