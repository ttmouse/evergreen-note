#!/usr/bin/env python3
"""从 Electron profile 的 Local Storage leveldb 里挖出疑似路径 / workDir 值。

用字节级搜索，避免 ugrep 对长 UTF-8 模式的复杂度限制。
"""
import glob
import os
import re
import sys

BASE = os.path.expanduser("~/Library/Application Support")
PROFILES = sys.argv[1:] or ["RoamEditMerged", "RoamEdit", "roamedit"]

PATH_RE = re.compile(rb"/Users/douba[\x20-\x7e]{0,90}")
KEY_RE = re.compile(rb"work[Dd]ir[\x00-\x7f]{0,80}", re.I)

for p in PROFILES:
    d = os.path.join(BASE, p, "Local Storage", "leveldb")
    print(f"########## {p}")
    if not os.path.isdir(d):
        print("   无 leveldb")
        continue
    paths, keys = set(), set()
    for f in glob.glob(os.path.join(d, "*")):
        if not os.path.isfile(f):
            continue
        try:
            blob = open(f, "rb").read()
        except OSError:
            continue
        for m in PATH_RE.findall(blob):
            s = m.decode("utf-8", "replace").replace("\x00", "")
            if "/leveldb" in s or s.endswith("MANIFEST-000001"):
                continue
            paths.add(s)
        for m in KEY_RE.findall(blob):
            keys.add(m.decode("utf-8", "replace").replace("\x00", ""))
        # 常见笔记文件名
        for name in (b"roamedit-", b"-node.json", b"databases.json", b"assets"):
            if name in blob:
                keys.add("含字节: " + name.decode())
    print("   疑似路径:")
    for s in sorted(paths)[:10]:
        print("     ", s)
    print("   疑似键/文件名:")
    for s in sorted(keys)[:10]:
        print("     ", s)