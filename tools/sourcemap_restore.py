#!/usr/bin/env python3
"""把 source map 里的原始源码还原成目录树。

用法:
    sourcemap_restore.py <map 文件> <输出目录> [--all | --app-only]

--app-only（默认）只还原应用自己的代码（路径含 /src/），
跳过 node_modules —— 那些是公开包，从 npm 装即可。

sources 里的路径形如 '../../src/slate-item/xxx.ts'，这里会归一化成 'src/slate-item/xxx.ts'。
"""
import json
import os
import sys

args = sys.argv[1:]
if len(args) < 2:
    raise SystemExit(__doc__)
mp, outdir = args[0], args[1]
mode_all = "--all" in args

m = json.load(open(mp, encoding="utf-8"))
srcs = m.get("sources", [])
conts = m.get("sourcesContent") or []
if len(srcs) != len(conts):
    raise SystemExit(f"sources 与 sourcesContent 数量不一致: {len(srcs)} vs {len(conts)}")


def normalize(s):
    """"../../src/a/b.ts" -> "src/a/b.ts"；"../node_modules/x/y.js" -> "node_modules/x/y.js" """
    s = s.replace("\\", "/")
    while s.startswith("../") or s.startswith("./"):
        s = s[3:] if s.startswith("../") else s[2:]
    return s.lstrip("/")


written = skipped_nonapp = empty = 0
by_ext = {}
seen = {}
for s, c in zip(srcs, conts):
    if c is None:
        empty += 1
        continue
    rel = normalize(s)
    if not mode_all and "/src/" not in "/" + rel:
        skipped_nonapp += 1
        continue
    if rel in seen:
        seen[rel] += 1
        continue
    seen[rel] = 1
    dest = os.path.join(outdir, rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        f.write(c)
    written += 1
    ext = os.path.splitext(rel)[1] or "(无后缀)"
    by_ext[ext] = by_ext.get(ext, 0) + 1

print(f"# 输出目录: {outdir}")
print(f"# 写入 {written} 个文件（跳过 node_modules {skipped_nonapp} 个，空内容 {empty} 个）")
dup = {k: v for k, v in seen.items() if v > 1}
if dup:
    print(f"# 同名重复 {len(dup)} 组（只写了第一份）")
print("# 按后缀:")
for ext, n in sorted(by_ext.items(), key=lambda x: -x[1]):
    print(f"   {n:>5}  {ext}")