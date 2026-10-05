import fs from "fs";
const [, , name, srcPath] = process.argv;
const s = fs.readFileSync(srcPath, "utf8");
const key = `register("${name}"`;
const regIdx = s.indexOf(key);
if (regIdx < 0) { console.error("REGISTER_NOT_FOUND"); process.exit(1); }
let i = regIdx + key.length;
while (s[i] !== ",") { i++; if (i - regIdx > 80) { console.error("NO_COMMA"); process.exit(1); } }
i++;
while (/\s/.test(s[i])) i++;
if (s[i] !== "{") { console.error("NO_BRACE:" + s.slice(regIdx, i + 30)); process.exit(1); }
const start = i;
let depth = 0;
const prevCode = () => { let j = i - 1; while (j >= 0 && /\s/.test(s[j])) j--; return s[j]; };
for (; i < s.length; i++) {
  const c = s[i];
  if (c === '"' || c === "'" || c === "`") {
    const q = c; i++;
    while (i < s.length) {
      if (s[i] === "\\") { i += 2; continue; }
      if (s[i] === q) break;
      i++;
    }
    continue;
  }
  if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") i++; continue; }
  if (c === "/" && s[i + 1] === "*") { i += 2; while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++; i++; continue; }
  // 正则字面量：前一有效字符是运算符/括号/逗号/return 等
  if (c === "/" && /[=(:,[!&|?{};+*%<>~^\-]|return/.test(prevCode() || "")) {
    i++;
    let inClass = false;
    while (i < s.length) {
      if (s[i] === "\\") { i += 2; continue; }
      if (s[i] === "[") inClass = true;
      else if (s[i] === "]") inClass = false;
      else if (s[i] === "/" && !inClass) break;
      else if (s[i] === "\n") break;
      i++;
    }
    continue;
  }
  if (c === "{") depth++;
  else if (c === "}") { depth--; if (depth === 0) { i++; break; } }
}
if (depth !== 0) { console.error("UNBALANCED"); process.exit(1); }
const body = s.slice(start, i);
fs.writeFileSync(`/tmp/roamedit-port/${name}.obj.js`, body);
console.log(JSON.stringify({ ok: true, len: body.length, start, end: i }));
