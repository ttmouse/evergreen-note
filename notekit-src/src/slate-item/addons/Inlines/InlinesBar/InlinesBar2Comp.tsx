import React from 'react'
import { EleIcon, EleOuter } from '../../../components/Ele'
import { Icon } from '../../../../components/MaterialIcon'
import { Tip } from '../../../components/Tip/Tip'
import { cls, preset } from '../../../styles'
import { topZIndex } from '../../../hooks/useTopZIndex'
import { snap } from '../../../hooks/useSnap'
import { ItemDOM } from '../../../components/ItemView'
import { useAddons } from '../../../hooks/useAddons'
import { obj2list } from '../../EditorView/helper'
import { FloatMenuContext } from '../../FloatMenu/FloatMenu'
import {
  FloatMenuProps,
  setMenuVisible,
  FloatMenuComp,
} from '../../FloatMenu/FloatMenuComp'
import { extraHotkey } from '../../FloatMenu/helper'
import { farthest } from '../../../utils/dom/farthest'
import { usePubState } from '../../../hooks/usePubState'
import { InlinesBarContext, PUB_KEY_INLINES_BAR } from './InlinesBar'
import { useClickAway } from '../../../hooks/useClickAway'

/* 悬停链接时弹出的编辑铅笔按钮（D125F26FCF5E-20）。
 * 它浮在正文之上，必须自证是一个能点的圆片：不透明底色 + 可分辨的 1px 边界 +
 * 墨色笔形，两个主题都取 token。原来的两处问题：
 *   ① 底色写的是 background-color: var(--bg-color) —— DESIGN.md §4 已登记待清理
 *      的死变量，浅色下落到 all-styles 的 :root #fff、夜间落到 --nk-surface，
 *      同一按钮逐主题行为不可预期；
 *   ② 更要命的是内层 .node-icon 会被 workspace-theme 的
 *      `body:not(.night-mode) .node-icon:hover` 命中：浅色悬停时把整个底色换成
 *      4.5% 透明度的 --nk-hover（夜间那条带 !important，底色是不透明的
 *      --nk-hover，所以只有浅色犯病）——白底细边当场变成半透明底，正文从圆片里
 *      透出来，正是「悬停时会变成半透明」的现象。
 * 所以底色/边界改挂在外层 .inlines-edit-btn 上（不落 .node-icon 的逐态规则），
 * 内层只承担几何与笔形；两态都是不透明色，1px 边界用 --nk-muted 保证可分辨
 * （§9 已登记的「浮层必须有可分辨边界」语义，比原来的 --cl-slate-300 细线
 * 1.35:1 明显）。 */
const outerStyle = cls`
  position: fixed;
  z-index: 100000;
  visibility: hidden;
  margin-left: 4px !important;
  border-radius: 9999px;
  background-color: var(--nk-surface, #fff);
  box-shadow: 0 0 0 1px var(--nk-muted, #999);
  color: var(--nk-ink, #333);
  transition: background-color 120ms ease-out, box-shadow 120ms ease-out;

  &:hover {
    background-color: var(--nk-line-strong, #ddd);
    box-shadow: 0 0 0 1px var(--nk-ink, #333);
  }
`

/* 内层只留几何：底色归外层圆片，免得被 .node-icon 的逐态底色（夜间那条还是
 * !important）盖掉外层。笔形颜色由外层 color 继承。 */
const iconStyle = cls`
  border-radius: 9999px;
`

let currentInlineDom: HTMLElement | null = null
let currentTarget: HTMLElement | null = null
let isHoveringBar = false
let hideTimeout: NodeJS.Timeout | null = null
let lastMouseX = -1
let lastMouseY = -1

export function InlinesBar2Comp(props: { name: string }) {
  const [, setCxt] = usePubState<InlinesBarContext<any>>(
    PUB_KEY_INLINES_BAR,
    null
  )
  const ref = React.useRef<HTMLDivElement>(null)
  
  const clearHideTimeout = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout)
      hideTimeout = null
    }
  }
  
  const hide = () => {
    const barDom = ref.current
    if (!barDom) return
    Object.assign(barDom.style, {
      opacity: 0,
      visibility: 'hidden',
    })
    isHoveringBar = false
    clearHideTimeout()
  }
  
  const show = () => {
    const barDom = ref.current
    if (!barDom) return
    clearHideTimeout()
    Object.assign(barDom.style, {
      opacity: 1,
      visibility: 'visible',
    })
  }
  
  React.useEffect(() => {
    const barDom = ref.current!
    // checkbox 悬停不弹编辑铅笔：点击本身就是切换勾选，且它没有注册
    // fieldset/编辑表单，铅笔点开也是空菜单。其它行内元素不受影响。
    const selector =
      '.inline-element *:not(.plg-codemirror-wrap *, .nav-area *, element-embed *, .element-checkbox, .element-checkbox *)'

    // 指针是否仍压在按钮或行内元素上（按坐标实探，不只看事件标志）。
    // 笔记保存/节点重挂会在指针静止时换掉行内元素：浏览器为旧节点补一次
    // mouseout，却不会再为指针下方的新节点补 mouseover —— 只看 isHoveringBar
    // 和旧节点的话，300ms 后按钮会在用户正要点的位置被收掉（D125F26FCF5E-20）。
    // 先按矩形判定：按钮自带的 MUI Tooltip 气泡在进场动画里会短暂压在按钮上，
    // elementFromPoint 会命中它而不是按钮，按矩形判才不会被浮层挡住。
    const pointerOnInlineOrBar = () => {
      const rect = barDom.getBoundingClientRect()
      if (
        lastMouseX >= rect.left &&
        lastMouseX <= rect.right &&
        lastMouseY >= rect.top &&
        lastMouseY <= rect.bottom
      ) {
        return true
      }
      const el = document.elementFromPoint(lastMouseX, lastMouseY) as HTMLElement | null
      return !!el && el.matches?.(selector) === true
    }

    const handleMouseMove = (e: MouseEvent) => {
      lastMouseX = e.clientX
      lastMouseY = e.clientY
    }

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.matches(selector)) {
        show()
        currentTarget = target
        currentInlineDom = farthest(target, '.inline-element')!
        barDom.style.visibility = 'visible'
        topZIndex(barDom)
        snap(barDom, currentInlineDom, ['right-out', 'bottom-in'])
      } else if (target === barDom || barDom.contains(target)) {
        isHoveringBar = true
        clearHideTimeout()
        // 指针落在按钮上就补齐显示：否则一旦被隐藏定时器收掉过，之后只有
        // mouseover 的「保持」逻辑、没有 show()，按钮会停在不可见/半透明残留态
        // 点不动（D125F26FCF5E-20）。
        show()
      }
    }

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.matches(selector)) {
        clearHideTimeout()
        hideTimeout = setTimeout(() => {
          if (!isHoveringBar && !pointerOnInlineOrBar()) hide()
        }, 300)
      } else if (target === barDom || barDom.contains(target)) {
        isHoveringBar = false
        clearHideTimeout()
        // 内层 svg/子元素换算也会冒泡出 mouseout；指针仍停在按钮上时不排隐藏，
        // 否则 300ms 后按钮会在指针正下方消失。
        if (!barDom.matches(':hover')) {
          hideTimeout = setTimeout(() => {
            if (!pointerOnInlineOrBar()) hide()
          }, 300)
        }
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseover', handleMouseOver)
    document.addEventListener('mouseout', handleMouseOut)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseover', handleMouseOver)
      document.removeEventListener('mouseout', handleMouseOut)
      clearHideTimeout()
    }
  }, [])

  const $ = useAddons()
  const menuProps: FloatMenuProps<FloatMenuContext> = {
    ...props,
    place: ['left-in', 'top-in'],
    targetSelector: '.inlines-edit-btn',
    targetEvent: 'click',
    context: (() => {
      hide()
      const itemDom = currentInlineDom!.closest('.node') as ItemDOM
      const ctx = {
        item: itemDom?.$item,
        editor: itemDom?.$editor,
        itemDom,
        app: itemDom.$editor.app(),
        evtTarget: currentTarget!,
        elementDom: currentInlineDom!,
        element: (currentInlineDom as any).$element,
        is: () => false,
      }
      setCxt(ctx)
    }) as any,
    items: obj2list($.inlinesBar.items, (item) => {
      const { onClick } = item
      if (onClick) {
        item.onClick = (e: React.MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          onClick(e)
          setMenuVisible(props.name, false)
        }
      }
      extraHotkey(item)
      return item
    }),
  }

  useClickAway(ref as any, () => hide())

  return (
    <>
      {/* interactive=false 必须保留：气泡默认 interactive，MUI 会给它
          pointer-events:auto，进场动画里气泡压在按钮上就会抢走 :hover ——
          按钮当帧失去悬停态、300ms 后连人带按钮被收掉（D125F26FCF5E-20）。
          这条提示只是纯文字，不需要可交互。 */}
      <Tip title="Edit this component" interactive={false}>
        <EleOuter
          ref={ref}
          classOuter={[outerStyle, 'inlines-edit-btn'].join(' ')}
        >
          <EleIcon classIcon={[iconStyle, cls(preset.icon.basic)].join(' ')}>
            <Icon name="svg_edit" />
          </EleIcon>
        </EleOuter>
      </Tip>
      <FloatMenuComp {...menuProps} />
    </>
  )
}
