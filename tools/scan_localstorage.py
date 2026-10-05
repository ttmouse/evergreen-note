#!/usr/bin/env python3
"""扫描各 Electron profile 的 Local Storage leveldb，判断里面是真笔记还是测试占位。

Chromium 的 Local Storage 用 leveldb 存放，值可能是 UTF-8 或 UTF-16LE，
且键带 origin 前缀。这里只做「有没有笔记特征」的粗判，不做解析。
"""
import glob
import os
import re
import sys

PROFILES = sys.argv[1:] or ["RoamEditMerged", "RoamEdit", "roamedit", "Notekit"]
BASE = os.path.expanduser("~/Library/Application Support")

MARKERS = [b"leaves", b'"ky"', b"pky", b"topic", b"dailyNote"]


def scan(path):
    hits = {m.decode(): 0 for m in MARKERS}
    placeholder = 0
    total = 0
    for f in sorted(glob.glob(os.path.join(path, "*"))):
        if not os.path.isfile(f):
            continue
        total += os.path.getsize(f)
        blob = open(f, "rb").read()
        for m in MARKERS:
            hits[m.decode()] += blob.count(m)
            # UTF-16LE 形式
            hits[m.decode()] += blob.count(m.decode().encode("utf-16-le"))
        if b"aaaaaaaaaa" in blob:
            placeholder += 1
    return total, hits, placeholder


for p in PROFILES:
    d = os.path.join(BASE, p, "Local Storage", "leveldb")
    print(f"########## {p}")
    if not os.path.isdir(d):
        print("   无 Local Storage/leveldb")
        continue
    total, hits, placeholder = scan(d)
    print(f"   字节={total}  含'a'占位的文件数={placeholder}/{len(glob.glob(os.path.join(d,'*')))}")
    print("   标记命中: " + "  ".join(f"{k}={v}" for k, v in hits.items() if v))
    if not any(hits.values()):
        print("   → 没有任何笔记特征串")