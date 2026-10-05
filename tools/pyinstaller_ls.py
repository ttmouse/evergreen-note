#!/usr/bin/env python3
"""列出 PyInstaller 打包的可执行文件内的 CArchive 目录（只读，不落盘）。

用法:
    pyinstaller_ls.py <binary> [名称过滤关键字]

原因: PyInstaller 把内嵌文件 zlib 压缩后存放，`strings` 扫不到其中的文本资源
（这正是 Notekit-26w15b-mac 扫不出 all.js / 版本号的原因）。

CArchive 结构（PyInstaller 2.1+ / 6.x 同构）:
    文件尾 cookie（24 字节）: MAGIC(8s) lengthofPackage(!I) toc(!I) tocLen(!I) pyver(!I)
    TOC 每项: entrylength(!I) entryoffset(!I) cmprsdDataSize(!I) uncmprsdDataSize(!I)
              cmprsFlag(!B) typeCmprsData(1s) name(entrylength-18 字节)
    数据在文件中的偏移 = 该档案的数据区起点 + entryoffset
"""
import struct
import sys

MAGIC = b"MEI\014\013\012\013\016"


def load(path):
    with open(path, "rb") as f:
        raw = f.read()
    pos = raw.rfind(MAGIC)
    if pos < 0:
        raise SystemExit("未找到 PyInstaller MAGIC，可能不是 PyInstaller 产物")
    if pos + 24 > len(raw):
        raise SystemExit("MAGIC 位置异常（文件被截断？）")
    magic, pkg_len, toc_pos, toc_len, pyver = struct.unpack(
        "!8sIIII", raw[pos:pos + 24]
    )
    # 档案数据区起点：归档总长 pkg_len 从文件开头算起
    entries = []
    p = toc_pos
    end = toc_pos + toc_len
    while p < end:
        (entry_len,) = struct.unpack("!I", raw[p:p + 4])
        entry_off, cmprsd, uncmprsd = struct.unpack("!III", raw[p + 4:p + 16])
        cmprs_flag = raw[p + 16]
        type_byte = raw[p + 17:p + 18]
        name = raw[p + 18:p + entry_len].decode("utf-8", "replace")
        entries.append(
            {
                "name": name,
                "offset": entry_off,
                "cmprsd": cmprsd,
                "uncmprsd": uncmprsd,
                "flag": cmprs_flag,
                "type": type_byte.decode("latin-1", "replace"),
            }
        )
        p += entry_len
    return raw, pkg_len, pyver, entries


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    path = sys.argv[1]
    flt = sys.argv[2] if len(sys.argv) > 2 else ""

    raw, pkg_len, pyver, entries = load(path)
    print(f"# bin={path}")
    print(f"# 文件大小={len(raw)}  包长={pkg_len}  pyver={pyver}  条目={len(entries)}")
    for e in sorted(entries, key=lambda x: x["name"]):
        if flt and flt not in e["name"]:
            continue
        print(
            f"{e['uncmprsd']:>10} {e['cmprsd']:>10} z={e['flag']} t={e['type']:>1} {e['name']}"
        )


if __name__ == "__main__":
    main()