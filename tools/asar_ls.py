#!/usr/bin/env python3
"""列出 asar 内文件清单（不落盘）。用法: asar_ls.py <app.asar> [路径前缀过滤]"""
import json, struct, sys

path = sys.argv[1]
flt = sys.argv[2] if len(sys.argv) > 2 else ""

with open(path, "rb") as f:
    raw = f.read()

_, _, _, json_len = struct.unpack("<4I", raw[:16])
pad = (4 - json_len % 4) % 4
data0 = 16 + json_len + pad
header = json.loads(raw[16:16 + json_len].decode("utf-8"))

rows = []


def walk(node, prefix=""):
    for name, v in sorted(node.get("files", {}).items()):
        p = prefix + "/" + name
        if "files" in v:
            walk(v, p)
        else:
            rows.append((v.get("size", 0), v.get("offset", 0), p))


walk(header)
print(f"# asar={path}")
print(f"# json_len={json_len} pad={pad} data_start={data0} files={len(rows)}")
for size, off, p in rows:
    if flt and flt not in p:
        continue
    print(f"{size:>10} {off:>10} {p}")