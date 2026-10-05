/* eslint-disable react-hooks/exhaustive-deps */

import React from 'react'
import { ElementComponentProps } from '../EditorView/EditorView'
import { useItem } from '../../hooks/useItem'
import { useItemLayoutStyle } from '../../hooks/useItemLayoutStyle'
import { useIsTop } from '../../hooks/useIsTop'
import { nodeStyleTop } from '../LayoutFactory/default.style'
import { Item } from '../../interfaces/item'
import {
  ContextEditorInfo,
  ContextEditorInline,
} from '../EditorView/EditorViewContexts'
import { NodeBtn } from '../../components/ItemView/NodeBtn'
import { isEmpty } from '../../utils/isEmpty'
import { useAddons } from '../../hooks/useAddons'
import { Icon } from '../../../components/MaterialIcon'
import ReactDOM from 'react-dom'
import { useEditor } from '../../hooks/useEditor'
import { appendStyle } from '../../utils/dom/appendStyle'
import { isAllVisibleWhenOverflow } from '../../utils/dom/isVisibleWhenOverflow'
import { useTopZIndex } from '../../hooks/useTopZIndex'
import { ContextEditor } from '../EditorView/EditorViewContexts'
import { ItemDOM } from '../../components/ItemView'
import { updateItemProxyElement } from '../../utils/dom/createItemProxy'

appendStyle(`
  .float-item-tools {
    z-index: 10000;
  }
  .float-item-tools .node-btn {
    visibility: hidden;
  }
  .float-item-tools .tool-item {
    opacity: 1 !important;
  }
`)

// Context for providing original item DOM reference to float toolbar
export const ContextItemToolbarDOM = React.createContext<HTMLDivElement | null>(
  null
)

export function ItemToolbarComp(
  props: ElementComponentProps<any> & {
    id?: string
    isFloat?: boolean
    style?: any
    classNames?: string[]
  }
) {
  const item = useItem()
  const {
    isFloat = false,
    style = {},
    id = `node-tools-${item.$id}`,
    classNames = [],
    ...rest
  } = props

  const itemStyle = useItemLayoutStyle()
  const editor = useEditor()
  const cssClass = [itemStyle.tools, 'node-tools', ...classNames]
  const isTop = useIsTop()
  const $ = useAddons()
  const ctxEditorInfo = React.useContext(ContextEditorInfo)
  const isReferCxt = React.useContext(ContextEditorInline)
  if (isReferCxt) return null
  if (isTop && !ctxEditorInfo.props.topNodeToolVisible) {
    cssClass.unshift(nodeStyleTop.tools)
  }

  /* ------------------------------- */
  /*
  当节点的 <Body> 的 overflow 为 hidden 时，原本的工具栏的图标也会被隐藏了，
  为了解决这个问题，额外添加一个浮动的工具栏，将它挂到 document.body 之下，
  当鼠标移动到节点上时，显示浮动工具栏。
  */

  const floatId = `float-item-tools-${item.$id}`
  const [floatVisible, setFloatVisible] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  let mosueover = false
  const onMouseEnter = () => {
    mosueover = true

    document.body
      .querySelectorAll(':scope > .float-item-tools')
      ?.forEach((el) => {
        if (el.id !== floatId) {
          ;(el as HTMLElement).style.display = 'none'
        }
      })

    if (!isFloat) {
      setFloatVisible(true)

      setTimeout(() => {
        const rect = ref
          .current!.querySelector('.node-btn')
          ?.getBoundingClientRect()
        const el = document.getElementById(floatId)
        if (rect && el) {
          Object.assign(el.style, {
            left: `${rect.left - 8}px`,
            top: `${rect.top}px`,
          })
        }
      }, 10)
    }
  }

  const onMouseLeave = () => {
    if (!isFloat) {
      setTimeout(() => {
        if (!mosueover) {
          setFloatVisible(false)
        }
        mosueover = false
      }, 300)
    }
  }

  const [floater, setFloater] = React.useState<JSX.Element>(<></>)

  React.useEffect(() => {
    updateItemProxyElement(ref.current! as ItemDOM, item, editor, $.app)

    document.addEventListener('wheel', () => {
      setFloatVisible(false)
    })

    if (!isFloat) {
      setFloater(
        ReactDOM.createPortal(
          <ContextItemToolbarDOM.Provider value={ref.current}>
            <ItemToolbarComp
              {...rest}
              id={floatId}
              style={{
                position: 'fixed',
              }}
              isFloat
              classNames={['float-item-tools']}
            />
          </ContextItemToolbarDOM.Provider>,
          $.ui.container
        )
      )
    }
  }, [])

  useTopZIndex(ref, 10000)

  /* --------------------------------- */

  return (
    <div
      ref={ref}
      className={cssClass.join(' ')}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      contentEditable={false}
      style={style}
      id={id}
    >
      <div className="tool-list">
        <>
          {isFloat &&
            !Item.isTmpItem(item) &&
            !isEmpty($.itemToolbar.items) &&
            Object.entries($.itemToolbar.items).map(([k, Comp]: any) => {
              if (typeof Comp === 'function') {
                return <Comp key={k} {...props} />
              }
              return <Icon key={k} {...Comp} size={12} />
            })}
        </>
        {!isFloat && <NodeBtn {...props} id={`btn${item.$id}`} />}
      </div>
      {!isFloat && floatVisible && floater}
    </div>
  )
}
