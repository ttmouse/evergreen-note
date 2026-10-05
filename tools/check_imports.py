#!/usr/bin/env python3
"""扫描还原出来的源码，找出无法解析的 import —— 决定能否重建构建。

用法: check_imports.py <src 根目录>

只检查相对路径（./ ../）和别名（@/）；第三方包名不检查（那要靠装依赖）。
会尝试常见后缀补全（.ts .tsx .js .jsx /index.*），并把 .svg?raw 之类的 query 剥掉。
"""
import os
import re
import sys

root = sys.argv[1]
EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".css", ".scss", ".json", ".d.ts", ".inc"]

IMP = re.compile(
    r"""(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]"""
    r"""|(?:^|\n)\s*import\s*['"]([^'"]+)['"]"""
    r"""|require\(\s*['"]([^'"]+)['"]\s*\)"""
)

files = []
for dirpath, _, names in os.walk(root):
    for n in names:
        files.append(os.path.join(dirpath, n))
fileset = set(files)


SRC = os.path.join(root, "src")


def resolve(base_dir, spec):
    spec = spec.split("?")[0].split("#")[0]
    if spec == "@":
        target = SRC
    elif spec.startswith("@/"):
        # 别名 @ 指向 src/（源码里通篇用 @/slate-item/...、@/i18n）
        target = os.path.join(SRC, spec[2:])
    elif spec.startswith("."):
        target = os.path.normpath(os.path.join(base_dir, spec))
    else:
        return "external"
    for e in EXTS:
        if os.path.isfile(target + e):
            return "ok"
    if os.path.isdir(target):
        for idx in ("index.ts", "index.tsx", "index.js", "index.jsx"):
            if os.path.isfile(os.path.join(target, idx)):
                return "ok"
    return "MISSING"


missing = {}
external = set()
for f in files:
    try:
        c = open(f, encoding="utf-8", errors="replace").read()
    except OSError:
        continue
    for m in IMP.finditer(c):
        spec = m.group(1) or m.group(2) or m.group(3)
        if not spec:
            continue
        r = resolve(os.path.dirname(f), spec)
        rel = os.path.relpath(f, root)
        if r == "external":
            if not spec.startswith((".", "@/")):
                external.add(spec.split("/")[0] if not spec.startswith("@") else "/".join(spec.split("/")[:2]))
        elif r == "MISSING":
            missing.setdefault(spec, []).append(rel)

print(f"# 源码文件 {len(files)}")
print(f"# 外部包 {len(external)} 个")
print(f"# 无法解析的相对/别名 import: {len(missing)} 个不同的目标")
for spec, users in sorted(missing.items(), key=lambda x: -len(x[1])):
    print(f"   {len(users):>3}×  {spec}")
    for u in users[:2]:
        print(f"         被 {u} 引用")
print()
print("# 外部包清单:")
print("  " + ", ".join(sorted(external)))