#!/usr/bin/env python3
"""为“目录存在但缺入口文件”的 import 生成 index.ts barrel。

依据：rollup/vite 会把「只做 re-export、编译后不产生代码」的中间模块优化掉，
所以它们不在 source map 的 sources 里。这类文件可以按目录内容机械重建。

用法: gen_barrels.py <src 根> [--write]
不加 --write 只报告。
"""
import os
import re
import sys

root = sys.argv[1]
write = "--write" in sys.argv
SRC = os.path.join(root, "src")
IMP = re.compile(r"""(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]""")
EXTS = ["", ".ts", ".tsx", ".js", ".jsx"]

files = [os.path.join(d, n) for d, _, ns in os.walk(root) for n in ns]

targets = set()
for f in files:
    c = open(f, encoding="utf-8", errors="replace").read()
    for m in IMP.finditer(c):
        spec = m.group(1).split("?")[0]
        if spec.startswith("@/"):
            t = os.path.join(SRC, spec[2:])
        elif spec == "@":
            t = SRC
        elif spec.startswith("."):
            t = os.path.normpath(os.path.join(os.path.dirname(f), spec))
        else:
            continue
        if any(os.path.isfile(t + e) for e in EXTS):
            continue
        if any(os.path.isfile(os.path.join(t, i)) for i in ("index.ts", "index.tsx", "index.js")):
            continue
        if os.path.isdir(t):
            targets.add(t)

print(f"# 需要生成 barrel 的目录: {len(targets)}")
made = 0
for t in sorted(targets):
    siblings = sorted(
        n for n in os.listdir(t)
        if n.endswith((".ts", ".tsx")) and n not in ("index.ts", "index.tsx")
        and not n.endswith(".d.ts")
    )
    lines = [f"// 自动重建的 barrel：原文件中只做 re-export，编译后被 rollup 消除，故不在 source map 中",
             f"// 生成时间 2026-10-01；若原 barrel 是有选择的导出，这里用 export * 覆盖，可能需要按需收紧"]
    for n in siblings:
        mod = "./" + os.path.splitext(n)[0]
        lines.append(f"export * from '{mod}'")
    if not siblings:
        lines.append("export {}")
    body = "\n".join(lines) + "\n"
    rel = os.path.relpath(os.path.join(t, "index.ts"), root)
    print(f"   {rel:<58} ({len(siblings)} 个兄弟模块)")
    if write:
        with open(os.path.join(t, "index.ts"), "w", encoding="utf-8") as fh:
            fh.write(body)
        made += 1
print(f"# 已写入 {made} 个" if write else "# 未写入（加 --write 生效）")

# slate.inc 的符号清单（另行处理）
names = set()
for f in files:
    c = open(f, encoding="utf-8", errors="replace").read()
    for m in re.finditer(r"import\s*\{([^}]*)\}\s*from\s*['\"][^'\"]*slate\.inc['\"]", c):
        for n in m.group(1).split(","):
            n = n.strip().split(" as ")[0].strip()
            if n:
                names.add(n)
print(f"\n# slate.inc 被引用的符号 {len(names)} 个:")
print("   " + ", ".join(sorted(names)))