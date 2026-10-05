#!/usr/bin/env python3
"""自底向上为所有含源码的目录生成 index.ts barrel。

背景：只做 re-export 的中间模块编译后不产生代码，不进 source map，
所以原 barrel 全部缺失。上一版只覆盖了「被 import 指向的目录」，
但 barrel 内部还会 `export * from './子目录'`，所以要把所有目录都补上。

用法: gen_barrels_all.py <src 根> [--write]
已存在 index.ts 的目录不覆盖（含之前手工调整过的）。
"""
import os
import sys

root = sys.argv[1]
write = "--write" in sys.argv
SRC = os.path.join(root, "src")

HEADER = ("// 自动重建的 barrel：原文件只做 re-export，编译后被 rollup 消除，故不在 source map 中。\n"
          "// `export *` 是全覆盖写法；若原 barrel 有选择地导出，需按报错收紧。\n")


def is_code(name):
    return (name.endswith((".ts", ".tsx"))
            and not name.endswith(".d.ts")
            and not name.startswith("index."))


def is_dir(path):
    return os.path.isdir(path)


dirs = []
for d, subdirs, files in os.walk(SRC):
    if "node_modules" in d:
        continue
    dirs.append(d)
dirs.sort(key=lambda p: -p.count(os.sep))  # 自底向上

made, skipped = 0, 0
for d in dirs:
    entries = sorted(os.listdir(d))
    # 注意：存在名字带 .ts 的**目录**（如 addons/Imports.ts），必须按类型区分，
    # 否则会同时输出 './Imports' 与 './Imports.ts' 造成解析失败。
    files = [n for n in entries if is_code(n) and not is_dir(os.path.join(d, n))]
    subs = [n for n in entries
            if is_dir(os.path.join(d, n)) and n != "node_modules"
            and os.path.isfile(os.path.join(d, n, "index.ts"))]
    if not files and not subs:
        continue
    target = os.path.join(d, "index.ts")
    if os.path.exists(target):
        skipped += 1
        continue
    lines = [HEADER.rstrip()]
    for n in files:
        lines.append(f"export * from './{os.path.splitext(n)[0]}'")
    for n in subs:
        lines.append(f"export * from './{n}'")
    if not write:
        print(f"   {os.path.relpath(target, root)}  ({len(files)} 文件 + {len(subs)} 子目录)")
        made += 1
        continue
    with open(target, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    made += 1

print(f"# 生成 {made} 个 barrel，跳过已存在 {skipped} 个"
      + ("" if write else "（未写入，加 --write 生效）"))