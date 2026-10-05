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

const outerStyle = cls`
  position: fixed;
  z-index: 100000;
  visibility: hidden;
  margin-left: 4px !important;
`

const iconStyle = cls`
  background-color: var(--bg-color);
  border-radius: 100px;
  outline: 1px solid var(--cl-slate-300);
`

let currentInlineDom: HTMLElement | null = null
let currentTarget: HTMLElement | null = null
let isHoveringBar = false
let hideTimeout: NodeJS.Timeout | null = null

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
      }
    }

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.matches(selector)) {
        clearHideTimeout()
        hideTimeout = setTimeout(() => {
          if (!isHoveringBar) {
            hide()
          }
        }, 300)
      } else if (target === barDom || barDom.contains(target)) {
        isHoveringBar = false
        clearHideTimeout()
        hideTimeout = setTimeout(() => {
          hide()
        }, 300)
      }
    }
    
    document.addEventListener('mouseover', handleMouseOver)
    document.addEventListener('mouseout', handleMouseOut)
    
    return () => {
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
      <Tip title="Edit this component">
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
