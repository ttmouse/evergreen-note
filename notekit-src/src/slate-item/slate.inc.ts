/**
 * 自动重建的 slate.inc
 *
 * 原文件只做 re-export，编译后不产生代码，因此不在 source map 的 sources 里。
 * 依据是被引用到的 94 个符号，它们**全部**是 slate / slate-react / slate-history 的导出。
 *
 * ⚠️ 曾经踩过的坑（勿改回去）：
 * 一开始写成 `export const { hasInlines, above, ... } = Editor`（从 Editor 命名空间解构），
 * 结果是死循环 —— Slate 里同名函数有两套：
 *   - `Editor.hasInlines(editor, el)` → 转调实例方法 `editor.hasInlines(el)`
 *   - 顶层 `hasInlines(editor, el)`   → 真正的核心实现
 * 应用自己的 ItemEditor 实现 `hasInlines` 时调用的是**顶层**那个，
 * 若解构自 Editor 就会「转调 → 实例 → 再转调」无限递归
 * （栈表现为 slate/dist/index.es.js 与 EditorFactory/ItemEditor.ts 互相调用）。
 *
 * 正确做法：只做星号转发，让这些名字直接落到 slate 自己的顶层导出上。
 */
export * from 'slate'
export * from 'slate-react'
export * from 'slate-history'