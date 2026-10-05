#!/usr/bin/env python3
"""比较 Notekit 的 SQLite 库与 merged 写出的单文件 JSON 库，判断是否同源/谁包含谁。

两者都以 ky 作为节点主键，所以可以直接做集合运算。
只读：SQLite 以 mode=ro 打开，JSON 只读。
"""
import json
import os
import sqlite3
import sys

HOME = os.path.expanduser("~")
SQLITE = os.path.join(
    HOME, "Library/Application Support/Notekit/library/data/user/1.db"
)
JSONF = (
    "/Users/douba/Library/Mobile Documents/com~apple~CloudDocs/"
    "Roamedit/221116092057-RE-json/roamedit-nk18888-node.json"
)
if len(sys.argv) > 1:
    SQLITE = sys.argv[1]
if len(sys.argv) > 2:
    JSONF = sys.argv[2]

# --- Notekit SQLite ---
con = sqlite3.connect(f"file:{SQLITE}?mode=ro", uri=True)
tbl = con.execute(
    "select name from sqlite_master where type='table' and name like '%-node'"
).fetchone()[0]
sq_rows = con.execute(f'select ky, data from "{tbl}"').fetchall()
sq = {r[0] for r in sq_rows}
sq_titles = {}
for ky, data in sq_rows:
    try:
        sq_titles[ky] = (json.loads(data) or {}).get("ori", "")
    except Exception:
        sq_titles[ky] = ""

# --- merged 写出的 JSON ---
js = json.load(open(JSONF, encoding="utf-8"))
js_arr = [x for x in js if isinstance(x, dict)]
js_set = {x.get("ky") for x in js_arr if x.get("ky")}
js_titles = {x.get("ky"): x.get("ori", "") for x in js_arr if x.get("ky")}

print(f"Notekit  表={tbl}  节点={len(sq)}")
print(f"merged   {os.path.basename(JSONF)}  节点={len(js_set)}")
inter = sq & js_set
print(f"\n交集 = {len(inter)}")
print(f"仅 Notekit 有 = {len(sq - js_set)}")
print(f"仅 merged 有  = {len(js_set - sq)}")

print("\n仅 merged 有的样本（前 12，看是不是新写的内容）：")
for ky in list(js_set - sq)[:12]:
    print(f"   {ky[:44]:<46} {js_titles.get(ky, '')[:40]}")

print("\n仅 Notekit 有的样本（前 12）：")
for ky in list(sq - js_set)[:12]:
    print(f"   {ky[:44]:<46} {sq_titles.get(ky, '')[:40]}")

# 交集里内容是否有差异
diff = 0
sample = []
for ky, data in sq_rows:
    if ky in js_set and len(sample) < 3:
        jn = next(x for x in js_arr if x.get("ky") == ky)
        if set(jn.keys()) != set((json.loads(data) or {}).keys()):
            diff += 1
            sample.append((ky, sorted(set(json.loads(data) or {}) - set(jn))[:6],
                           sorted(set(jn) - set(json.loads(data) or {}))[:6]))
print(f"\n交集中字段结构不同的样本数（抽样 3 个内的差异）: {len(sample)}")
for ky, only_a, only_b in sample:
    print(f"   {ky[:40]}: 仅SQLite多={only_a}  仅JSON多={only_b}")