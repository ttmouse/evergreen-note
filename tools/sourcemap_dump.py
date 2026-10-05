#!/usr/bin/env python3
"""从 source map 里还原原始源码。

用法:
    sourcemap_dump.py <map 文件> --list [关键字]     列出文件名
    sourcemap_dump.py <map 文件> --show <下标|路径片段> [最多字符数]

source map 若带 sourcesContent，则原始 TS/TSX 源码是**无损**还原，
不是反编译——这正是「能不能逆向成源码」的关键差别。
"""
import json
import sys

args = sys.argv[1:]
if not args:
    raise SystemExit(__doc__)
mp = args[0]
m = json.load(open(mp, encoding="utf-8"))
srcs = m.get("sources", [])
conts = m.get("sourcesContent") or []
print(f"# {mp}")
print(f"# sources={len(srcs)}  sourcesContent={len(conts)}  "
      f"version={m.get('version')}  file={m.get('file')}")

if "--list" in args:
    kw = args[args.index("--list") + 1] if len(args) > args.index("--list") + 1 else ""
    for i, s in enumerate(srcs):
        if kw and kw not in s:
            continue
        n = len(conts[i]) if i < len(conts) and conts[i] else 0
        print(f"{i:>5}  {n:>8}  {s}")
    sys.exit(0)

if "--show" in args:
    key = args[args.index("--show") + 1]
    limit = int(args[args.index("--show") + 2]) if len(args) > args.index("--show") + 2 else 2000
    if key.isdigit():
        idx = [int(key)]
    else:
        idx = [i for i, s in enumerate(srcs) if key in s]
    for i in idx[:1]:
        print(f"\n########## [{i}] {srcs[i]}  ({len(conts[i])} 字符)")
        print(conts[i][:limit])
    sys.exit(0)

raise SystemExit("需要 --list 或 --show")