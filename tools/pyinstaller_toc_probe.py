#!/usr/bin/env python3
"""诊断 PyInstaller CArchive 的 cookie 与 TOC（只读）。

本机这个 macOS 二进制被 codesign 签名，签名块追加在 CArchive cookie 之后，
所以「文件末尾 24 字节」不是 cookie，且 toc 区可能被压缩。
这里不做不变量假设，逐个试各种压缩形式。
"""
import lzma
import struct
import sys
import zlib

MAGIC = b"MEI\014\013\012\013\016"
path = sys.argv[1]
raw = open(path, "rb").read()
print(f"file_size={len(raw)}")

pos = raw.rfind(MAGIC)
magic, pkg_len, toc_pos, toc_len, pyver = struct.unpack("!8sIIII", raw[pos:pos + 24])
print(f"cookie@{pos}  pkg_len={pkg_len}  toc_pos={toc_pos}  toc_len={toc_len}  pyver={pyver}")
print(f"toc 结束={toc_pos + toc_len}  cookie-toc结束={pos - (toc_pos + toc_len)}")
print(f"cookie 之后（签名块）={len(raw) - pos}")

toc = raw[toc_pos:toc_pos + toc_len]
print(f"\nTOC 区前 48 字节: {toc[:48].hex(' ')}")

print("\n--- 解压尝试 ---")
attempts = [
    ("zlib", lambda b: zlib.decompress(b)),
    ("raw-deflate", lambda b: zlib.decompress(b, -15)),
    ("gzip,hdr", lambda b: zlib.decompress(b, 16 + 15)),
    ("xz", lambda b: lzma.decompress(b)),
]
for name, fn in attempts:
    try:
        d = fn(toc)
        print(f"{name}: OK  out={len(d)}  first64={d[:64]!r}")
    except Exception as e:
        print(f"{name}: {e}")

print("\n--- 若未压缩，按 PyInstaller TOC 解析 ---")
p = 0
ok = 0
while p + 18 <= len(toc) and ok < 5:
    (entry_len,) = struct.unpack("!I", toc[p:p + 4])
    if entry_len < 18 or entry_len > 4096:
        print(f"  第 {ok} 项长度不合理({entry_len})，停止")
        break
    off, cmprsd, uncmprsd = struct.unpack("!III", toc[p + 4:p + 16])
    flag = toc[p + 16]
    typ = toc[p + 17:p + 18]
    name = toc[p + 18:p + entry_len]
    print(f"  len={entry_len} off={off} c={cmprsd} u={uncmprsd} z={flag} t={typ!r} name={name[:60]!r}")
    p += entry_len
    ok += 1