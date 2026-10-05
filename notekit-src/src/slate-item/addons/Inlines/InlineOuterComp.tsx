import React from 'react'
import {
  useFocused,
  useSelected,
  useSlateSelector,
  Element,
  Range,
} from '../../slate.inc'
import { cls, px } from '../../styles'
import { useSlateRef } from '../../hooks/useSlateRef'
import { ElementComponentProps } from '../EditorView/EditorView'

const focusStyle = cls`
  > * {
    outline: 2px solid #B4D5FF !important;
    border-radius: ${px(4)};
  }
`

// 覆盖 focusStyle 的 outline（二者同时挂在同一元素上，靠后声明生效）
const noRingStyle = cls`
  > * {
    outline: none !important;
  }
`

/**
 * 处理 “嵌入块“、”搜索块” 这种 inline block 样式
 */
const inlineBlockCss = cls`
  display: inline-block;
  width: calc(100% - 12px);
  margin: 0 4px 4px 4px;
`

export const InlineOuterComp = <T extends Element>(
  props: ElementComponentProps<T> & {
    inner: JSX.Element
    className?: string
    cssInlineBlock?: boolean
    /** 自绘控件（如 checkbox）自身已有选中态，跳过光标落点 outline，避免多余圆环 */
    noFocusRing?: boolean
    onClick?: (e: React.MouseEvent) => void
    onSelect?: (params: any) => void
    element: T
  }
) => {
  const {
    children,
    attributes,
    inner,
    className = '',
    onClick = () => null,
    onSelect = () => null,
    cssInlineBlock,
    noFocusRing,
  } = props
  const { element } = props

  const classList: string[] = ['inline-rect']
  const { ref: slateRef, ...restAttrs } = attributes
  const [domRef, mergedRef] = useSlateRef(slateRef)
  const selected = useSelected()
  const focused = useFocused()
  // outline 的语义是“光标正塌缩在这个元素上”的可见提示（键盘方向键移动、点选）。
  // 只要选区是展开的（无论端点是否落在元素上——Slate 会把落在元素边缘的
  // 拖选端点归一化到元素路径上），都不画 outline：鼠标拖拽划选时浏览器
  // 原生选区已经给出视觉反馈，不应再叠加圆环。
  const caretCollapsedOnElement = useSlateSelector(
    (ed) => !ed.selection || Range.isCollapsed(ed.selection),
    undefined,
    // 与 useSelected 相同：等 Editable 渲染后再计算
    { deferred: true }
  )
  const isSelected = selected && focused && caretCollapsedOnElement
  if (isSelected) {
    classList.push(noFocusRing ? noRingStyle : focusStyle, 'inline-selected')
    setTimeout(() => onSelect({ ref: domRef }), 1)
  }
  if (cssInlineBlock) {
    classList.push(inlineBlockCss)
  }
  return (
    <span
      {...(restAttrs as any)}
      ref={mergedRef}
      onClick={onClick}
      className={className}
    >
      {children}
      <span className={classList.join(' ')} contentEditable={false}>
        {inner}
      </span>
    </span>
  )
}
