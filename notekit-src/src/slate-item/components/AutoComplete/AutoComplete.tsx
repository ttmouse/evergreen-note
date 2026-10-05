/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react'
import ReactDOM from 'react-dom'
import { UnitMode, UnitProps } from '../../interfaces/unit'
import { createTmpDom } from '../../utils/dom/createTmpDom'
import { pub } from '../../utils/pub'
import { PopupMenu } from '../Menu'
import { getSelectionRect } from '../../utils/dom/getSelectionRect'
import { useAddons } from '../../hooks/useAddons'
import { CommandParams } from '../../engine/App'
import { atom, cls, px } from '../../styles'
import { Transforms, ReactEditor } from '../../slate.inc'
import { SlashHanlderParams } from '../../addons/SlashMenu/SlashMenu'
import { useEditor } from '../../hooks/useEditor'
import { ItemNode } from '../../interfaces/item'
import { ContextWhenParams } from '../../hooks/hookContexts'
import { MAX_Z_INDEX, useTopZIndex } from '../../hooks/useTopZIndex'
import { notEmpty } from '../../utils/isEmpty'
import { checkCaret } from '../../addons/EventHandler/checkCaret'
import { mkid } from '@/slate-item/utils/string/mkid'

export type AutoCompleteParams = Partial<UnitProps> & {
  autoRule: () => RegExpExecArray | null
  recoverKey?: string
}

const styles = cls`
  .node-body {
    max-height: ${px(300)};
    overflow-y: auto;

    .crumbs-outer {
      display: none;
      min-width: 100%;
      margin-bottom: 8px;

      display: block;
      font-size: 12px;
      height: 14px;

      .crumbs-item {
        ${atom.text.truncate({ maxWidth: 120 })}
      }
    }

    .node[data-selected='true'],
    .node:hover {
      .crumbs-outer {
        display: block;
        font-size: 12px;
        height: 14px;

        .crumbs-item {
          ${atom.text.truncate({ maxWidth: 120 })}
        }
      }
    }
  }
`

let globalAutoCompleteId: string | undefined = undefined

export const AutoComplete = (props: AutoCompleteParams) => {
  const id = React.useMemo(() => {
    return mkid()
  }, [])
  const { editorView } = useAddons()
  const editor = useEditor()

  const [isOpen, openMenu] = React.useState(false)
  const ref = React.useRef(null)
  const manuallyClosedFor = React.useRef<ItemNode | null>(null)
  const recoverKeyListener = React.useRef<
    ((event: KeyboardEvent) => void) | null
  >(null)
  const [targetBox, setBaseBox] = React.useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  })

  const clearRecoverKeyListener = React.useCallback(() => {
    if (recoverKeyListener.current) {
      document.removeEventListener('keydown', recoverKeyListener.current)
      recoverKeyListener.current = null
    }
  }, [])

  const setupRecoverKeyListener = React.useCallback(() => {
    if (!props.recoverKey) return

    // 先清除旧的监听器
    if (recoverKeyListener.current) {
      document.removeEventListener('keydown', recoverKeyListener.current)
    }

    const listener = (event: KeyboardEvent) => {
      if (event.key === props.recoverKey) {
        manuallyClosedFor.current = null
        // 清除自己
        document.removeEventListener('keydown', listener)
        recoverKeyListener.current = null
      }
    }

    recoverKeyListener.current = listener
    document.addEventListener('keydown', listener)
  }, [props.recoverKey])

  const closeMenu = React.useCallback(() => {
    if (globalAutoCompleteId === id) {
      globalAutoCompleteId = undefined
    }
    openMenu(false)
    manuallyClosedFor.current = editor.itemSelection().anchor.item
    setupRecoverKeyListener()
    if (typeof props.closeMenu === 'function') {
      props.closeMenu()
    }
  }, [props, editor, setupRecoverKeyListener])

  // Candidate lists can span the whole library. Read them only after autoRule
  // matches in the editorChanged handler, rather than on every editor mount.
  const [subitems, setSubitems] = React.useState<UnitProps[]>([])

  React.useEffect(() => {
    const fn = ({ opType }) => {
      let activeItem: ItemNode | null
      try {
        activeItem = editor.itemSelection().anchor.item
      } catch (e) {
        activeItem = null
      }

      // 检查 activeItem 是否发生变化
      const previousItem = manuallyClosedFor.current
      if (previousItem && previousItem.ky !== activeItem?.ky) {
        manuallyClosedFor.current = null
        clearRecoverKeyListener() // 非按键解除时清除监听器
      }

      // 限制不能在 quote 中打开
      if (checkCaret(editor).atQuote()) {
        return
      }

      if (
        !['insert_text', 'remove_text', 'insert_node', 'remove_node'].includes(
          opType
        )
      ) {
        return
      }

      const willOpen = props.autoRule()
      if (
        willOpen &&
        (manuallyClosedFor.current === null ||
          manuallyClosedFor.current?.ky !== activeItem?.ky)
      ) {
        if (globalAutoCompleteId && globalAutoCompleteId !== id) return // 已有其他 AutoComplete 打开
        const theList =
          typeof props.body === 'function' ? (props as any).body() : props.body

        const items = props
          .filter({ items: theList })
          .filter((item: any) => item.ky !== activeItem?.ky)

        setSubitems(items)
        const rect = getSelectionRect()

        const shouldOpen = !isOpen

        if (rect && shouldOpen) {
          globalAutoCompleteId = id
          openMenu(true)
          setBaseBox({
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          })
        }
      } else {
        openMenu(false)
        if (globalAutoCompleteId === id) {
          globalAutoCompleteId = undefined
        }
        // 当条件不满足时自动关闭，不算手动关闭
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        event.preventDefault()
        closeMenu()
      }
    }

    pub.on(pub.evt.editorChanged, fn)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      editorView.setAutoCompleteStatus(false)
      pub.off(pub.evt.editorChanged, fn)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, closeMenu])

  // 单独的 useEffect 用于在组件卸载时清除恢复键监听器
  React.useEffect(() => {
    return () => {
      clearRecoverKeyListener()
    }
  }, [])

  useTopZIndex(ref, MAX_Z_INDEX.AUTO_COMPLETE)

  editorView.setAutoCompleteStatus(notEmpty(subitems) && isOpen)

  const newProps = {
    ...props,
    body: (isOpen ? subitems.slice(0, 50) : []).map((item) => {
      if (typeof props.map === 'function') {
        item = props.map(item)
      }
      return {
        ...item,
        onClick(params: CommandParams) {
          item.handle({ editor } as SlashHanlderParams)
          const at = editor.selection
          ReactEditor.focus(editor as any)
          at && Transforms.select(editor as any, at)
          if ((params as any).closeMenu) {
            ;(params as any).closeMenu(true)
          }
        },
      } as any
    }),
  }

  return !isOpen
    ? null
    : ReactDOM.createPortal(
        <ContextWhenParams.Provider value={{ closeMenu }}>
          <div ref={ref} className={`autocomplete-comp ${styles}`}>
            <PopupMenu
              clickaway="true"
              PopupProps={{ targetBox, place: ['right-out', 'bottom-out'] }}
              closeMenu={closeMenu}
              handle={props.handleSelect}
              defaultSelected={0}
              {...newProps}
            />
          </div>
        </ContextWhenParams.Provider>,
        createTmpDom('auto-complete-0')
      )
}
