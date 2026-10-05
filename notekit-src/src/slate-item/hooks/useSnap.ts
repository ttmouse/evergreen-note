/**
 * useSnap —— 浮动元素定位（**按用法重建**）
 *
 * 原文件不在 source map 中（也不在构建产物里能查到符号），因此按调用方用法重建：
 *   FloatMenuComp.tsx:129   useSnap(ref, targetBox ?? document.body, place)
 *   showDialog.tsx:187      snap(dom, SnapProps.targetBox, SnapProps.place, SnapProps?.opts)
 * 定位算法本身在 ../utils/calcSnap.ts（该文件完整存在），这里只是它的 React 包装。
 */
import type { MutableRefObject } from 'react'
import { useEffect } from 'react'
import {
  BoxInfo,
  Placement,
  SnapCalcOptions,
  calcSnap,
  getBoxInfo,
  getPosition,
  getRect,
} from '../utils/calcSnap'

/** 可作为吸附基准的东西 */
export type SnapBaseBox = HTMLElement | string | BoxInfo | DOMRect

function toBoxInfo(target: SnapBaseBox): BoxInfo {
  if (!target) {
    return getBoxInfo(document.body.getBoundingClientRect())
  }
  if (typeof target === 'string') {
    return getPosition(target)
  }
  if (typeof (target as HTMLElement).getBoundingClientRect === 'function') {
    return getRect(target as HTMLElement)
  }
  return getBoxInfo(target as BoxInfo)
}

/**
 * 把 dom 按 place 吸附到 targetBox 上。calcSnap 返回的是视口坐标，
 * 所以这里用 position: fixed。
 */
export function snap(
  dom: HTMLElement | null | undefined,
  targetBox: SnapBaseBox,
  place: Placement = ['center', 'middle'],
  opts?: SnapCalcOptions
): BoxInfo | undefined {
  if (!dom) return undefined
  const float = getRect(dom)
  const target = toBoxInfo(targetBox)
  const pos = calcSnap(float, target, place, opts)
  dom.style.position = 'fixed'
  dom.style.margin = '0'
  dom.style.left = `${Math.round(pos.left)}px`
  dom.style.top = `${Math.round(pos.top)}px`
  return pos
}

/** 渲染后重算定位。浮动菜单/弹窗需要在每次渲染后跟着目标走，故不设依赖数组。 */
export function useSnap(
  ref: MutableRefObject<HTMLElement | null>,
  targetBox: SnapBaseBox,
  place: Placement = ['center', 'middle'],
  opts?: SnapCalcOptions
): void {
  useEffect(() => {
    const el = ref?.current
    if (!el) return
    snap(el, targetBox, place, opts)
  })
}

export default useSnap