/**
 * useCreateItemOnClick —— **占位实现，待按原始行为重建**
 *
 * 原文件不在 source map 中，构建产物里也查不到符号，只能从调用方推断用途：
 *   ItemView/Outer.tsx:120     useCreateItemOnClick(domRef)
 *   ItemView/Subitems.tsx:22   useCreateItemOnClick(domRef)
 * 调用点都只传一个 DOM ref，说明它给节点容器挂点击行为 ——
 * 从命名与位置推断：点击节点下方的空白区域时补建一个新节点。
 *
 * 现状：**故意实现为空**，只保证不抛错、不影响既有交互。
 * 不猜实现的原因：它需要应用内部的节点模型（当前 item / path / editor 上下文）
 * 才能正确工作，猜错会**静默改变编辑行为**，比暂时缺这个功能更糟。
 *
 * TODO（重建清单第 1 项）：从 ItemTransforms.insertItems / Item.newItem 的用法反推正确实现。
 */
import type { MutableRefObject } from 'react'

export function useCreateItemOnClick(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _domRef: MutableRefObject<HTMLElement | null>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options?: unknown
): void {
  // 占位：无副作用
}

export default useCreateItemOnClick