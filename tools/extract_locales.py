#!/usr/bin/env python3
"""从压缩后的构建产物里还原 i18n 语言包（en / zh）。

产物里资源是一棵**压缩常量的引用树**：
    kPe={common:L9e,editor:j9e,...}    lDe={common:SPe,...}
所以要按引用递归解析。这里实现一个只覆盖「字面量 + 标识符引用 + 展开」的
小型解析器，**不执行任何产物代码**。

用法: extract_locales.py <bundle.js> <输出目录>
"""
import json
import re
import sys

WS = " \t\r\n"
IDENT_START = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$")
IDENT_CHAR = IDENT_START | set("0123456789")


class Parser:
    def __init__(self, src: str):
        self.s = src      # 当前解析缓冲区（解析子串时会被临时替换）
        self.full = src   # 完整产物文本：查标识符定义**始终**用它，不能被子串替换
        self.cache = {}
        self.resolving = set()

    # ---------- 工具 ----------
    def skip_ws(self, i):
        while i < len(self.s) and self.s[i] in WS:
            i += 1
        return i

    def read_ident(self, i):
        j = i
        if j < len(self.s) and self.s[j] in IDENT_START:
            j += 1
            while j < len(self.s) and self.s[j] in IDENT_CHAR:
                j += 1
        return self.s[i:j], j

    def match_brace(self, i, open_ch, close_ch):
        """从 open_ch 位置起配对，返回闭括号下标（跳过字符串/模板/注释）"""
        depth = 0
        while i < len(self.s):
            c = self.s[i]
            if c in "'\"`":
                i = self.skip_string(i)
                continue
            if c == "/" and i + 1 < len(self.s) and self.s[i + 1] in "/*":
                i = self.skip_comment(i)
                continue
            if c == open_ch:
                depth += 1
            elif c == close_ch:
                depth -= 1
                if depth == 0:
                    return i
            i += 1
        raise ValueError("括号未配对")

    def skip_string(self, i):
        q = self.s[i]
        i += 1
        while i < len(self.s):
            c = self.s[i]
            if c == "\\":
                i += 2
                continue
            if c == q:
                return i + 1
            i += 1
        raise ValueError("字符串未闭合")

    def skip_comment(self, i):
        if self.s[i + 1] == "/":
            j = self.s.find("\n", i)
            return len(self.s) if j < 0 else j
        j = self.s.find("*/", i)
        return len(self.s) if j < 0 else j + 2

    def unescape(self, raw):
        """把 JS 字符串字面量内容转成 Python 字符串"""
        out = []
        i = 0
        while i < len(raw):
            c = raw[i]
            if c == "\\" and i + 1 < len(raw):
                n = raw[i + 1]
                simple = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f",
                          "v": "\v", "0": "\0", "\\": "\\", "'": "'", '"': '"',
                          "`": "`", "\n": ""}
                if n in simple:
                    out.append(simple[n])
                    i += 2
                    continue
                if n == "u":
                    if raw[i + 2:i + 3] == "{":
                        j = raw.index("}", i + 3)
                        out.append(chr(int(raw[i + 3:j], 16)))
                        i = j + 1
                        continue
                    out.append(chr(int(raw[i + 2:i + 6], 16)))
                    i += 6
                    continue
                if n == "x":
                    out.append(chr(int(raw[i + 2:i + 4], 16)))
                    i += 4
                    continue
                out.append(n)
                i += 2
                continue
            out.append(c)
            i += 1
        return "".join(out)

    # ---------- 解析 ----------
    def parse_value(self, i):
        i = self.skip_ws(i)
        if i >= len(self.s):
            raise ValueError("表达式意外结束")
        c = self.s[i]
        if c == "{":
            return self.parse_object(i)
        if c == "[":
            return self.parse_array(i)
        if c in "'\"`":
            end = self.skip_string(i)
            return self.unescape(self.s[i + 1:end - 1]), end
        if c == "-" or c.isdigit():
            m = re.match(r"-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?", self.s[i:])
            return float(m.group(0)) if ("." in m.group(0) or "e" in m.group(0)) else int(m.group(0)), i + m.end()
        if c in IDENT_START:
            name, j = self.read_ident(i)
            if name in ("true", "false", "null"):
                return {"true": True, "false": False, "null": None}[name], j
            val = self.resolve(name, j)
            return val, j
        raise ValueError(f"无法解析的字符 {c!r} @ {i}")

    def parse_object(self, i):
        end = self.match_brace(i, "{", "}")
        body = self.s[i + 1:end]
        out = {}
        k = 0
        n = len(body)
        while k < n:
            while k < n and body[k] in WS + ",":
                k += 1
            if k >= n:
                break
            if body.startswith("...", k):
                v, k2 = self.parse_value_in(body, k + 3)
                if isinstance(v, dict):
                    out.update(v)
                k = self.skip_sep(body, k2)
                continue
            # key
            if body[k] in "'\"`":
                q = body[k]
                if q == "`":
                    raise ValueError("模板作为 key 不支持")
                e = self.skip_string_in(body, k)
                key = self.unescape(body[k + 1:e - 1])
                k = e
            else:
                key, k = self.read_ident_in(body, k)
            k = self.skip_ws_in(body, k)
            if k < n and body[k] == ":":
                k += 1
            v, k = self.parse_value_in(body, k)
            out[key] = v
            k = self.skip_sep(body, k)
        return out, end + 1

    def parse_array(self, i):
        end = self.match_brace(i, "[", "]")
        body = self.s[i + 1:end]
        out = []
        k = 0
        while True:
            k = self.skip_sep(body, k)
            if k >= len(body):
                break
            v, k = self.parse_value_in(body, k)
            out.append(v)
        return out, end + 1

    # 在子串上复用同一套跳读逻辑（把子串当独立 buffer 处理）
    def _sub(self, body):
        return body

    def parse_value_in(self, body, i):
        # 复用 parse_value：临时切换 buffer
        saved = self.s
        self.s = body
        try:
            return self.parse_value(i)
        finally:
            self.s = saved

    def skip_ws_in(self, body, i):
        while i < len(body) and body[i] in WS:
            i += 1
        return i

    def skip_sep(self, body, i):
        i = self.skip_ws_in(body, i)
        if i < len(body) and body[i] == ",":
            i += 1
        return self.skip_ws_in(body, i)

    def skip_string_in(self, body, i):
        q = body[i]
        i += 1
        while i < len(body):
            if body[i] == "\\":
                i += 2
                continue
            if body[i] == q:
                return i + 1
            i += 1
        raise ValueError("字符串未闭合")

    def read_ident_in(self, body, i):
        j = i
        while j < len(body) and body[j] in IDENT_CHAR:
            j += 1
        return body[i:j], j

    # ---------- 解析标识符引用 ----------
    def resolve(self, name, after):
        if name in self.cache:
            return self.cache[name]
        if name in self.resolving:
            raise ValueError(f"循环引用: {name}")
        m = re.search(r"(?<![A-Za-z0-9_$.])" + re.escape(name) + r"\s*=", self.full)
        if not m:
            raise ValueError(f"找不到定义: {name}")
        start = m.end()
        while start < len(self.full) and self.full[start] in WS:
            start += 1
        if self.full[start] not in "{[ '\"`":
            raise ValueError(f"{name} 的定义不是字面量（可能是表达式）")
        # 切回完整产物文本解析该定义
        saved, self.s = self.s, self.full
        try:
            self.resolving.add(name)
            val, _ = self.parse_value(start)
        finally:
            self.s = saved
            self.resolving.discard(name)
        self.cache[name] = val
        return val


def main():
    bundle, outdir = sys.argv[1], sys.argv[2]
    src = open(bundle, encoding="utf-8", errors="replace").read()

    m = re.search(r"translation:([A-Za-z_$][\w$]*)\}\s*,\s*zh:\s*\{translation:([A-Za-z_$][\w$]*)", src)
    if not m:
        m = re.search(r"en:\s*\{\s*translation:\s*([A-Za-z_$][\w$]*)\s*\}\s*,\s*zh:\s*\{\s*translation:\s*([A-Za-z_$][\w$]*)", src)
    if not m:
        raise SystemExit("未能在产物中定位 en/zh 资源常量")
    en_name, zh_name = m.group(1), m.group(2)
    print(f"资源常量: en={en_name}  zh={zh_name}")

    p = Parser(src)
    en = p.resolve(en_name, 0)
    zh = p.resolve(zh_name, 0)

    for name, data in (("en", en), ("zh", zh)):
        path = f"{outdir}/{name}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        n = sum(1 for _ in _walk(data))
        print(f"  写入 {path}  （顶层分组 {len(data)} 个，键合计 {n} 个）")


def _walk(d):
    if isinstance(d, dict):
        for v in d.values():
            yield from _walk(v)
        if not d:
            yield None
    else:
        yield d


if __name__ == "__main__":
    main()