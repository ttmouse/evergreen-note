#!/usr/bin/env python3
"""对比 RoamEdit 两批导出的数据格式（V1 库导出 vs V2 数组导出）。

只读，不修改任何文件。
"""
import collections
import json
import sys

D = "/Users/douba/Library/Mobile Documents/com~apple~CloudDocs/Roamedit"
V1 = f"{D}/V1 数据库/nk16106.rdb"
V2 = f"{D}/V2 数据库/20221125105410-roamedit.json"

v1 = json.load(open(V1, encoding="utf-8"))
v2 = json.load(open(V2, encoding="utf-8"))

list1 = v1["list"]
list2 = v2

print("=" * 78)
print("外层结构")
print("=" * 78)
print(f"V1: 对象，键 = {list(v1.keys())}")
for k in v1:
    if k != "list":
        print(f"      {k} = {v1[k]!r}")
print(f"      list = {len(list1)} 个节点")
print(f"V2: 数组，{len(list2)} 个节点（无外层包装，无库元信息）")

print()
print("=" * 78)
print("字段频次对比（按出现率）")
print("=" * 78)
f1 = collections.Counter()
for n in list1:
    for k in n:
        f1[k] += 1
f2 = collections.Counter()
for n in list2:
    for k in n:
        f2[k] += 1

keys = sorted(set(f1) | set(f2), key=lambda k: -(f1.get(k, 0) / len(list1) + f2.get(k, 0) / len(list2)))
print(f"{'字段':<18} {'V1 出现率':>12} {'V2 出现率':>12}   仅在")
for k in keys:
    r1 = f1.get(k, 0) / len(list1)
    r2 = f2.get(k, 0) / len(list2)
    only = "V1" if r2 == 0 else ("V2" if r1 == 0 else "")
    print(f"{k:<18} {r1 * 100:>11.1f}% {r2 * 100:>11.1f}%   {only}")

print()
print("=" * 78)
print("样本对照：两边各取一个「主题节点」")
print("=" * 78)


def sample(lst, pred, label):
    for n in lst:
        if pred(n):
            print(f"--- {label}")
            print(json.dumps(n, ensure_ascii=False)[:420])
            return
    print(f"--- {label}: 未找到")


sample(list1, lambda n: n.get("isTopic") and n.get("leaves"), "V1 主题节点")
sample(list2, lambda n: n.get("isTopic") and n.get("leaves"), "V2 主题节点")

print()
print("=" * 78)
print("时间字段单位")
print("=" * 78)
for label, lst in (("V1", list1), ("V2", list2)):
    ts = [n.get("created") for n in lst if isinstance(n.get("created"), int) and n.get("created")]
    if ts:
        import time
        print(f"{label}: created 最小={min(ts)} 最大={max(ts)}")
        print(f"     对应时间 {time.strftime('%Y-%m-%d', time.localtime(min(ts)))} ~ "
              f"{time.strftime('%Y-%m-%d', time.localtime(max(ts)))}  → {'秒' if max(ts) < 10**11 else '毫秒'}")

print()
print("=" * 78)
print("ky 主键形态")
print("=" * 78)
for label, lst in (("V1", list1), ("V2", list2)):
    pref = collections.Counter()
    for n in lst[:20000]:
        ky = str(n.get("ky", ""))
        pref[ky.split("-")[0][:12] if "-" in ky else ky[:12]] += 1
    print(f"{label} 前 20000 个 ky 前缀分布（前 6）:")
    for k, c in pref.most_common(6):
        print(f"      {k:<16} {c}")