#!/usr/bin/env python3
"""从 asar 里抽取指定文件到目录。用法: asar_extract.py <app.asar> <outdir> [路径...]"""
import json, os, struct, sys

src, outdir = sys.argv[1], sys.argv[2]
wanted = sys.argv[3:]

with open(src, "rb") as f:
    raw = f.read()

_, _, _, json_len = struct.unpack("<4I", raw[:16])
pad = (4 - json_len % 4) % 4
data0 = 16 + json_len + pad
header = json.loads(raw[16:16 + json_len].decode("utf-8"))


def walk(node, prefix=""):
    for name, v in node.get("files", {}).items():
        p = prefix + "/" + name
        if "files" in v:
            yield from walk(v, p)
        else:
            yield p, v


for p, v in walk(header):
    if wanted and p not in wanted:
        continue
    dest = os.path.join(outdir, p.lstrip("/"))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    size = v.get("size", 0)
    if "offset" in v:
        blob = raw[data0 + int(v["offset"]): data0 + int(v["offset"]) + size]
    else:
        blob = b""
    with open(dest, "wb") as f:
        f.write(blob)
    print(f"{size:>10}  {dest}")