import React from 'react'
import { cls, colorBase } from '../../styles'
import { isEmpty } from '../../utils/isEmpty'
import { getPubState, usePubState } from '../../hooks/usePubState'
import { Menu } from '../../components/Menu/Menu'
import { useSnap } from '../../hooks/useSnap'
import { Placement } from '../../utils/calcSnap'
import { UnitProps } from '../../interfaces/unit'
import { pub } from '../../utils/pub'
import { ItemDOM } from '../../components/ItemView'
import { obj2list } from '../EditorView/helper'
import { FloatMenuContext } from './FloatMenu'
import { extraHotkey } from './helper'
import { useAddons } from '../../hooks/useAddons'
import ReactDOM from 'react-dom'
import { useTopZIndex } from '../../hooks/useTopZIndex'
import { browser } from '@/slate-item/utils/browser'

const cssStyle = [
  cls`
    padding: 4px;
    position: fixed;
    top: -10000px;
    left: -10000px;
    z-index: 1000;

    .node-icon {
      color: var(--cl-slate-500);
    }
  `,
  'float-menu',
].join(' ')

export type FloatMenuItem =
  | Partial<UnitProps>
  | Pick<UnitProps, 'title' | 'icon' | 'onClick'>
  | Pick<UnitProps, 'title' | 'icon' | 'subitems'>

export type FloatMenuItems = {
  [key: string]: FloatMenuItem
}

export type FloatMenuProps<T> = {
  /**
   * 菜单名称，不能与其他菜单名重复
   */
  name: string
  /**
   * 触发元素，点击它会显示菜单
   */
  targetSelector: string
  /**
   * 菜单项
   */
  items: FloatMenuItem[]
  /**
   * 触发事件
   */
  targetEvent?: 'click' | 'contextmenu' | 'mouseover'
  /**
   * 菜单项的提供上下文数据
   */
  context?: (target: HTMLElement, extra?: any) => T
  /**
   * 菜单的位置
   */
  place?: Placement
}

export function setMenuVisible(name: string, isVisible: boolean) {
  pub.setState(`float-menu-visible-${name}`, isVisible)
}

export function isMenuVisible(name: string) {
  return getPubState(`float-menu-visible-${name}`)
}

export function createFloatMenuComp(props: FloatMenuProps<any>) {
  return {
    Comp: () => <FloatMenuComp {...props} />,
  }
}

export function FloatMenuComp(props: FloatMenuProps<any>): JSX.Element | null {
  const {
    name,
    targetSelector,
    items,
    context,
    place = ['left-out', 'top-in'],
    targetEvent = 'click',
  } = props

  const ref = React.useRef<HTMLDivElement>(null)
  const [, setContext] = usePubState<any>(`float-menu-context-${name}`, null)
  const [targetBox, setTargetBox] = React.useState<HTMLElement>(null as any)
  const targetRef = React.useRef<any>(null)
  const [visible, setVisible] = usePubState(`float-menu-visible-${name}`, false)

  React.useEffect(() => {
    document.addEventListener(targetEvent, (e) => {
      const target = e.target as HTMLElement
      const el = target.closest(targetSelector) as HTMLElement
      if (el) {
        if (isMenuVisible(name) && targetRef.current === el) {
          setVisible(false)
          return
        }

        targetRef.current = el
        setContext(context?.(el))
        setVisible(true)
        setTargetBox(el)
        e.preventDefault()
        e.stopPropagation()
      } else if (!browser.isMobile && !ref.current?.contains(target)) {
        setVisible(false)
      }
    })

    document.addEventListener('keydown', (e) => {
      if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        setVisible(false)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useSnap(ref, targetBox ?? document.body, place)
  useTopZIndex(ref)

  const $ = useAddons()
  
  if (browser.isMobile && !isEmpty(items) && items[0].title!=="Close") items.unshift({
    title: "Close", icon: "svg_close", onClick() {
      setVisible(false)
    }
  } as unknown as UnitProps)

  return !  visible || isEmpty(items)
    ? null
    : ReactDOM.createPortal(
        <div className={[cssStyle, `float-menu-${name}`].join(' ')} ref={ref}>
          <Menu body={items} />
        </div>,
        $.ui.container
      )
}

export function ItemFloatMenu(params: {
  name: string
  targetEvent: FloatMenuProps<any>['targetEvent']
  targetSelector: string
}) {
  const $ = useAddons()
  const props: FloatMenuProps<FloatMenuContext> = {
    ...params,
    context: ((el: HTMLElement) => {
      const { $editor, $item } = el.closest('.node-tools') as ItemDOM
      return { editor: $editor, item: $item }
    }) as any,
    items: obj2list($.floatMenu.items, (item) => {
      const { onClick } = item
      if (onClick) {
        item.onClick = (e: React.MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          onClick(e)
          setMenuVisible(params.name, false)
        }
      }
      extraHotkey(item)
      return item
    }),
  }
  return <FloatMenuComp {...props} />
}
