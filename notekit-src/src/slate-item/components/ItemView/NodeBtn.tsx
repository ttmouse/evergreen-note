/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react'
import { ElementComponentProps } from '../../addons/EditorView/EditorView'
import { useAddons } from '../../hooks/useAddons'
import { useIsTop } from '../../hooks/useIsTop'
import { useItemLayoutStyle } from '../../hooks/useItemLayoutStyle'
import { selectNone } from '../../utils/dom/selectNone'
import {
  layoutStyleDefault,
  nodeStyleTop,
} from '../../addons/LayoutFactory/default.style'
import { cls, colorBase, getColor } from '../../styles'
import { createTmpDom } from '../../utils/dom/createTmpDom'
import { atLater } from '../../utils/atLater'
import { Item, ItemNode } from '../../interfaces/item'
import { ItemDOM } from './ItemView'
import { ItemTransforms } from '../../transforms/item'
import { ItemEditor } from '../../addons/EditorFactory/ItemEditor'
import { Icon, PrimitiveIcon } from '../../../components/MaterialIcon'
import { Editor, Path } from '../../slate.inc'
import { appendStyle } from '../../utils/dom/appendStyle'
import { isEmpty } from '../../utils/isEmpty'
import { reactRender } from '../../utils/common'
import { useEditor } from '../../hooks/useEditor'
import { Tip } from '../Tip/Tip'
import { datekit, fromNow } from '../../utils/date/datekit'
import { useHookable } from '../../hooks/useApp'
import { time } from '@/slate-item/utils/date/time'
import dayjs from 'dayjs'
import { browser } from '@/slate-item/utils/browser'
import { $t } from '@/i18n'
import { foldupWithDOM } from './FoldupBtn'
import { updateItemProxyElement } from '../../utils/dom/createItemProxy'
import { showSnack } from '@/slate-item/utils/msg/showSnack'

const color = getColor(colorBase.primary, 600)

function DragHelper() {
  const [s] = layoutStyleDefault
  return (
    <div
      id="drag-helper"
      className={cls`
        ${s.outer};
        left: -20px;
        height: 4px;
        position: absolute;
        width: 100%;
        flex-basis: 100%;
        align-items: center;
        height: 16px;
        z-index: 1000;
        /* pointer-events: none; */
      `}
    >
      <div
        className={`
          ${cls`
            ${s.icon};
            display: flex;
            align-items: center;
            color: ${color};
            margin-left: 8px;
          `}
          helper-dot
        `}
      >
        <Icon name="svg_dot" size={12} />
      </div>
      <div
        className={`
          ${cls`
            ${s.head};
            border-radius: 10px;
            height: 4px;
            margin-left: 8px;
            background-color: ${color};
          }`}
          helper-line
        `}
      />
    </div>
  )
}

const beforeClass = cls`top: -8px;`
const afterClass = cls`top: calc(100% - 8px);`
const indentClass = cls`margin-left: 30px;`

appendStyle(`
  .item-dragging {
    opacity: 0.7;
    outline: 1px dashed rgba(0, 0, 0, 0.3);
  }
`)

type DragResult = {
  toItem: ItemNode
  placement: 'before' | 'after'
  indent: boolean
}

let dragResult: DragResult = {} as any

function getItemFromElement(ele: Element): ItemNode {
  return (ele as ItemDOM).$item ?? (ele.closest('.node') as ItemDOM)?.$item
}

function getDirectChild(parent: Element, selector: string): HTMLElement | null {
  for (const child of parent.children) {
    if (child.matches(selector)) return child as HTMLElement
  }
  return null
}

function insertBefore(ele: Element) {
  const h = document.getElementById('drag-helper')!
  h.classList.remove(afterClass, indentClass, 'drag-mode-after', 'drag-mode-indent')
  h.classList.add(beforeClass, 'drag-mode-before')
  ele.appendChild(h)
  Object.assign(dragResult, {
    toItem: getItemFromElement(ele),
    placement: 'before',
    indent: false,
  })
}

function insertAfter(ele: Element, indent = false) {
  const h = document.getElementById('drag-helper')!
  h.classList.remove(beforeClass, indentClass, 'drag-mode-before')
  h.classList.add(afterClass, indent ? 'drag-mode-indent' : 'drag-mode-after')
  if (indent) {
    h.classList.add(indentClass)
  }
  ele.appendChild(h)

  Object.assign(dragResult, {
    toItem: getItemFromElement(ele),
    placement: 'after',
    indent,
  })
}

setTimeout(() => {
  reactRender(createTmpDom(), <DragHelper />)
}, 1000)

let mousemove = false
let mousedown: { left: number; top: number } | null = null
let touchdown: boolean = false
let movedItemDom: ItemDOM = null as any
let draggingDoms: HTMLElement[] = []

function addDraggingClassForSelection(editor: ItemEditor) {
  draggingDoms = []
  try {
    const itemSel = editor.itemSelection()
    if (!itemSel.isMulti) return
    const entries = editor.itemsFromSelection()
    for (const [node] of entries) {
      const item = node as ItemNode
      if (item.$id === movedItemDom.$item?.$id) continue
      const dom = document.getElementById(item.$id)
      if (dom) {
        dom.classList.add('item-dragging')
        draggingDoms.push(dom)
      }
    }
  } catch {}
}

function removeDraggingClassForSelection() {
  for (const dom of draggingDoms) {
    dom.classList.remove('item-dragging')
  }
  draggingDoms = []
}

function mouseup(props: { editor: ItemEditor }) {
  const { editor } = props
  const { refer } = editor.app().addons
  mousedown = null
  touchdown = false
  movedItemDom?.classList.remove('item-dragging')
  removeDraggingClassForSelection()

  if (mousemove) {
    mousemove = false
    selectNone(false)

    const elHelper = document.getElementById('drag-helper')!
    document.body.appendChild(elHelper)
    elHelper.style.visibility = 'hidden'

    const { toItem, placement, indent } = dragResult
    dragResult = {} as any

    const movedItem = movedItemDom?.$item
    if (!toItem || !movedItem) {
      return
    }

    if (movedItem.ky === toItem.ky) {
      console.warn('Can not move an item to itself.')
      return
    }

    // tmp 处理
    const toEditor = toItem.GetEditor()
    const sameEditor = toEditor === editor
    const movedItemParentsInfo = Item.isParentsTmpByDom(movedItem)
    const toItemParentsInfo = Item.isParentsTmpByDom(toItem)

    if (movedItem.$isTmp || (sameEditor && movedItemParentsInfo.parentIsTmp))
      return showSnack({ content: 'Cannot move temporary item', severity: 'error' })
    if (indent && toItem.$isTmp)
      return showSnack({ content: 'Cannot indent under temporary item', severity: 'error' })
    if (!indent && toItemParentsInfo.parentIsTmp)
      return showSnack({ content: 'Cannot move to temporary item', severity: 'error' })

    // 跨编辑器移动
    if (toEditor !== editor) {
      const newItem = refer.makeItem({
        refky: movedItem.ky,
        editor: toEditor,
      })
      const toPath = toItem.GetSlPath()
      if (placement === 'before') {
        ItemTransforms.insertPrevItems(toEditor, {
          items: newItem,
          at: toPath,
        })
      } else {
        if (indent) {
          ItemTransforms.insertItems(toEditor, {
            items: newItem,
            at: toPath,
          })
        } else {
          ItemTransforms.insertNextItems(toEditor, {
            items: newItem,
            at: toPath,
          })
        }
      }
      return
    }

    const { isMulti } = (editor.selection && editor.itemSelection()) ?? {}

    try {
      if (placement === 'before') {
        const at = movedItem.GetSlPath()
        if (isMulti) {
          const beforeRef = Editor.pathRef(editor, toItem.GetSlPath())
          editor.itemsBatch(
            (_e: ItemEditor, p: { at: Path }) => {
              ItemTransforms.moveBeforeItemsForDrag(editor, {
                at: p.at,
                before: beforeRef.current!,
              })
            },
            { reverse: false }
          )
          beforeRef.unref()
        } else {
          ItemTransforms.moveBeforeItemsForDrag(editor, { at, before: toItem.GetSlPath() })
        }
      } else {
        const at = movedItem.GetSlPath()
        if (indent) {
          if (isMulti) {
            const toRef = Editor.pathRef(editor, toItem.GetSlPath())
            editor.itemsBatch((_e: ItemEditor, p: { at: Path }) => {
              ItemTransforms.appendItems(editor, {
                at: p.at,
                to: toRef.current!,
              })
            }, { reverse: false })
            toRef.unref()
          } else {
            ItemTransforms.appendItems(editor, { at, to: toItem.GetSlPath() })
          }
        } else {
          if (isMulti) {
            const afterRef = Editor.pathRef(editor, toItem.GetSlPath())
            editor.itemsBatch((_e: ItemEditor, p: { at: Path }) => {
              ItemTransforms.moveAfterItemsForDrag(editor, {
                at: p.at,
                after: afterRef.current!,
              })
            }, { reverse: true })
            afterRef.unref()
          } else {
            ItemTransforms.moveAfterItemsForDrag(editor, { at, after: toItem.GetSlPath() })
          }
        }
      }
    } catch (e) {
      console.error('[Drag] Error during move:', e)
    }
  }
}

const distance = (x1: number, y1: number, x2: number, y2: number) =>
  Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

const mouseMoveHandler = (e: MouseEvent | TouchEvent) => {
  if (mousedown && movedItemDom) {
    const clientX =
      (e as MouseEvent).clientX ?? (e as TouchEvent).touches[0].clientX
    const clientY =
      (e as MouseEvent).clientY ?? (e as TouchEvent).touches[0].clientY
    const pageX = (e as MouseEvent).pageX ?? (e as TouchEvent).touches[0].pageX
    const pageY = (e as MouseEvent).pageY ?? (e as TouchEvent).touches[0].pageY
    if (distance(mousedown.left, mousedown.top, clientX, clientY) < 5) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    if (!mousemove) {
      mousemove = true
      movedItemDom.classList.add('item-dragging')
      addDraggingClassForSelection(movedItemDom.$editor)
    }

    atLater(
      () => {
        const currentTarget = (e as TouchEvent).touches
          ? document.elementFromPoint(clientX, clientY)
          : (e.target as HTMLElement)
        if (
          !currentTarget ||
          !currentTarget.matches('.editor-view .node-top .node *') ||
          currentTarget.matches('.item-dragging, .item-dragging *')
        ) {
          return
        }

        const currentNodeDom = currentTarget.closest(
          '.node:not(.element-refer *)'
        ) as HTMLElement
        if (!currentNodeDom) return
        const headDom = getDirectChild(currentNodeDom, '.node-head')
        const itemHover = headDom ? getItemFromElement(headDom) : null

        if (!itemHover || !movedItemDom.$item) return
        if (
          itemHover.ky === movedItemDom.$item.ky ||
          itemHover.path?.includes(movedItemDom.$item.ky)
        ) return

        const bodyDom = getDirectChild(currentNodeDom, '.node-body')
        const subitemsDom = bodyDom ? getDirectChild(bodyDom, '.node-child') : null
        const firstChildNode = subitemsDom?.firstElementChild?.matches('.node') ? subitemsDom.firstElementChild : null
        const headDomOfFirstChild = firstChildNode ? getDirectChild(firstChildNode, '.node-head') : null
        const hasExpandedChildren = !!headDomOfFirstChild && bodyDom && !bodyDom.matches('.node-foldup *')
        const { left, top, height } = headDom.getBoundingClientRect()
        const toolsDom = getDirectChild(currentNodeDom, '.node-tools')
        const toolsWidth = toolsDom ? toolsDom.getBoundingClientRect().width : 30
        const isNearNodeBtn = clientX < left + toolsWidth

        if (isNearNodeBtn) {
          if (pageY < top + height / 2) {
            insertBefore(headDom)
          } else {
            insertAfter(headDom, false)
          }
        } else {
          if (hasExpandedChildren) {
            insertBefore(headDomOfFirstChild!)
          } else {
            insertAfter(headDom, true)
          }
        }

        const helperDom = document.getElementById('drag-helper')!
        helperDom.style.visibility = 'visible'

        headDom.style.position = 'relative'
      },
      'drag-helper',
      10
    )
  }
}

document.addEventListener('mousemove', mouseMoveHandler)

document.addEventListener('mouseup', () => {
  if (mousemove && movedItemDom) {
    mouseup({ editor: movedItemDom.$editor })
  }
})
document.addEventListener('touchend', () => {
  document.removeEventListener('touchmove', mouseMoveHandler)
  if (mousemove && movedItemDom) {
    mouseup({ editor: movedItemDom.$editor })
  }
})

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (mousedown || touchdown || mousemove) {
      mousemove = false
      mousedown = null
      touchdown = false
      movedItemDom?.classList.remove('item-dragging')
      removeDraggingClassForSelection()
      selectNone(false)
      const elHelper = document.getElementById('drag-helper')
      if (elHelper) {
         document.body.appendChild(elHelper)
         elHelper.style.visibility = 'hidden'
      }
      dragResult = {} as any
      movedItemDom = null as any
    }
  }
})

export function NodeBtn(props: ElementComponentProps<any> & { id: string }) {
  const { element: item, id } = props
  const editor = useEditor()
  const isTop = useIsTop(item)
  const $ = useAddons()
  const ref = React.useRef<HTMLDivElement>(null)

  const btnCssClass: string[] = []
  btnCssClass.push(item.foldup ? 'node-btn-foldup' : '')
  const itemStyle = useItemLayoutStyle()
  if (isTop) {
    btnCssClass.push(nodeStyleTop.icon)
  } else {
    btnCssClass.push(itemStyle.icon)
  }

  let iconName: PrimitiveIcon = item.icon
  let iconColor = ''
  if (isEmpty(iconName)) {
    if (item.topic) {
      iconName = 'svg_document'
    } else if ($.snippet.isSnippet(item)) {
      iconName = 'svg_snippet'
      if (!item.foldup) {
        iconColor = getColor('blue', 500)
      }
    } else {
      iconName = 'svg_dot'
    }
  }
  btnCssClass.push('node-btn', 'node-icon', 'tool-item')

  React.useEffect(() => {
    // Listen for the dragstart event
    const btnDom = ref.current as ItemDOM
    updateItemProxyElement(btnDom, item, editor, $.app)

    btnDom.addEventListener('mousedown', (ev) => {
      if (browser.isMobile) return
      if ((ev as MouseEvent).button === 2) {
        return
      }
      mousedown = {
        left: (ev as MouseEvent).clientX,
        top: (ev as MouseEvent).clientY,
      }
      selectNone()
      movedItemDom = btnDom.closest('.node') as ItemDOM
    })
    // for touch devices, we use long-press to trigger the drag event
    let touching = false
    btnDom.addEventListener('contextmenu', (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
    })
    btnDom.addEventListener(
      'touchstart',
      (ev) => {
        if ((ev as TouchEvent).touches.length > 1) {
          return
        }
        touchdown = true
        touching = true
        setTimeout(() => {
          if (touching) {
            // hide all tooltip
            document.body
              .querySelectorAll('.MuiTooltip-popper')
              .forEach((el) => {
                ;(el as HTMLElement).style.display = 'none'
              })
            mousedown = {
              left: (ev as TouchEvent).touches[0].clientX,
              top: (ev as TouchEvent).touches[0].clientY,
            }
            selectNone()
            movedItemDom = btnDom.closest('.node') as ItemDOM
            movedItemDom.classList.add('item-dragging')
            addDraggingClassForSelection(movedItemDom.$editor)
            document.addEventListener('touchmove', mouseMoveHandler, {
              passive: false,
            })
          }
        }, 1500)
      },
      { passive: true }
    )
    btnDom.addEventListener('touchend', (ev) => {
      touching = false
    })
  }, [])

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button === 2) {
      return
    }
    if (!mousedown && !touchdown) return
    const wasDrag = mousemove
    mouseup({ editor })
    if (wasDrag) return
    if (Date.now() - $.editorView.dragged < 100) {
      return
    }
    if (['svg_dot', 'svg_document', 'svg_snippet'].includes(iconName)) {
      if (!item.$isTmp) $.router.to(item)
    } else {
      foldupWithDOM(item, editor, ref.current!)
    }
  }

  let srsDueStr = ''
  if ($.srs?.isCard?.(item) && item.srs && item.srs.card && item.srs.card.due) {
    const n = Math.floor(
      dayjs.duration(item.srs.card.due - time(), 'second').asHours()
    )
    srsDueStr = n > 0 ? `SRS due in ${n} hours` : `SRS due ${-n} hours ago`
  }

  const tip = useHookable('nodeBtnTip', { item }, () => {
    const treeCount = $.counter.countWordsOfTree(item, true, true)
    const words = treeCount.rootItemCount
    const subwords = treeCount.count - words
    const wordsRefer = treeCount.rootItemCountRefer
    const subwordsRefer = treeCount.countRefer - wordsRefer
    return (
      <>
        {/* {$t`editorView.tip_zoom_btn_click`}
        <br />
        {$t`editorView.tip_zoom_btn_shift_click`}
        <br />
        {$t`editorView.tip_zoom_btn_ctrl_click`}
        <br />
        {$t`editorView.tip_zoom_btn_alt_click`}
        <br /><br /> */}
        Created: {fromNow(item.created)}
        <br />
        Updated: {fromNow(item.updated)}
        <br />
        Words: {words} {wordsRefer !== words ? `(${wordsRefer})` : ''}
        {subwords ? <br /> : ''}
        {subwords
          ? `SubItem words: ${treeCount.count - treeCount.rootItemCount} ${subwordsRefer !== subwords ? `(${subwordsRefer})` : ''}`
          : ''}
        {srsDueStr ? <br /> : ''}
        {srsDueStr ? srsDueStr : ''}
      </>
    )
  })

  return (
    <Tip
      interactive={false}
      title={tip}
      enterDelay={500}
      enterNextDelay={500}
      enterTouchDelay={500}
      leaveTouchDelay={3000}
    >
      <div
        id={id}
        ref={ref}
        onMouseUp={handleMouseUp}
        className={btnCssClass.join(' ')}
        contentEditable={false}
      >
        <Icon color={iconColor} name={iconName} size={12} />
      </div>
    </Tip>
  )
}

export function NodeBtnMore() {
  const classList: string[] = []
  classList.push('node-btn-more')
  return <div className={classList.join(' ')}>a</div>
}
