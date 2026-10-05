import { BoxInfo } from '../../../utils/calcSnap'

/**
 * 拖动约束要求窗口至少保留在视口内的标题栏宽度。
 * 标题栏右侧的窗体控件（pin/fold/close）宽度不超过该值，
 * 窗口左移出视口时至少保留这么宽的标题栏（含控件）仍可点击。
 */
export const MIN_OPERABLE_HEAD_WIDTH = 120

/**
 * 计算 NUI Dialog 拖动时的位置约束区域（实时调用，随窗口尺寸/视口变化而变化）。
 *
 * 规则（对齐操作系统窗口管理器的惯例，避免浮窗"丢失"）：
 * - 顶部：窗口上缘不允许越过视口上缘，标题栏（含 pin/fold/close 控件）始终完整可见；
 * - 左侧：窗口可以移出视口左缘，但至少保留 MIN_OPERABLE_HEAD_WIDTH 宽的
 *   标题栏（即窗体控件区域）仍在视口内，保证随时可以用鼠标拖回；
 * - 右侧 / 底部：窗口右缘、下缘与视口对齐，保证右下角 resize 手柄始终可达。
 *
 * 返回的 BoxInfo 交给 movable() 夹取位置：
 * - top ∈ [top, top + height - 窗口高]（即 [0, innerHeight - 窗口高]）
 * - left ∈ [left, left + width - 窗口宽]（即 [-(宽-keepWidth), innerWidth - 窗口宽]）
 * 当窗口本身比视口还大（退化情况），配合 movable 的夹取语义固定在左/上边界，
 * 标题栏仍可见。
 */
export function computeDialogMoveConstrainBox(params: {
  innerWidth: number
  innerHeight: number
  width: number
  height: number
}): BoxInfo {
  const { innerWidth, innerHeight, width, height } = params
  const keepWidth = Math.min(MIN_OPERABLE_HEAD_WIDTH, width)
  const left = -(width - keepWidth)
  const top = 0
  return {
    left,
    top,
    width: Math.max(innerWidth - left, 0),
    height: Math.max(innerHeight - top, 0),
  }
}
