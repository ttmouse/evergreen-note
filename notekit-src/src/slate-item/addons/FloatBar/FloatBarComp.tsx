import React from 'react'
import { IconList } from '../../components/IconList'
import { cls } from '../../styles'
import { getSelectionRect } from '../../utils/dom/getSelectionRect'
import { atLater } from '../../utils/atLater'
import { isEmpty } from '../../utils/isEmpty'
import { usePubState } from '../../hooks/usePubState'
import { useAddons } from '../../hooks/useAddons'
import { PUB_KEY_FLOATBAR } from './FloatBar'
import { useItemContext } from './useItemContext'
import { funcKey, ZIndexManager } from '../UI/helper'
import { trim } from '../../utils/string/trim'
import { createPortal } from 'react-dom'
import { useTopZIndex } from '../../hooks/useTopZIndex'
import { useConf } from '../../hooks/useApp'
import { browser } from '@/slate-item/utils/browser'

export const floatBarStyle = cls`
  padding: 4px;
  position: fixed;
  top: 0px;
  left: 0px;
  z-index: 1000;
  border-radius: 4px;
  background-color: var(--body-bg-color);
  box-shadow: 0 1px 1px 1.2px var(--cl-slate-300);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
`

export function FloatBarComp() {
  const ref = React.useRef<HTMLDivElement>(null)
  const { floatBar, ui, mobileEditBar } = useAddons()
  const [, setCxt] = usePubState<any>(PUB_KEY_FLOATBAR, null)

  useItemContext(PUB_KEY_FLOATBAR)
  const conf = useConf()

  React.useEffect(() => {
    const handleSelection = () => {
      atLater(
        () => {
          if (!ref.current) {
            return
          }
          const sel = window.getSelection()
          if (
            sel &&
            !sel.isCollapsed &&
            sel.toString().length > 0 &&
            sel?.anchorNode?.parentElement?.matches(
              '.node[data-ky] .node-text *'
            ) &&
            !sel?.anchorNode?.parentElement?.closest('.inline-element') &&
            sel?.anchorNode?.parentElement?.closest('.node') ===
              sel?.focusNode?.parentElement?.closest('.node')
          ) {
            const selRect = getSelectionRect()!
            const barRect = ref.current.getBoundingClientRect()

            let top, left

            if (browser.isMobile) {
              left = '0'
              const bottomNum = browser.isAppleMobile
                ? mobileEditBar.appleKeyboardHeight
                : ((navigator as any).virtualKeyboard?.boundingRect?.height ??
                  0)
              Object.assign(ref.current.style, {
                left,
                right: '0',
                bottom: `${bottomNum + 40}px`,
                top: 'unset',
                display: 'flex',
                justifyContent: 'center',
              })
            } else {
              const placement = conf.floatBarPlacement ?? 'above'
              let topOffset = placement === 'above'
                ? selRect.top - barRect.height - 8
                : selRect.bottom + 8
              if (topOffset < 0) topOffset = 0
              else if (topOffset + barRect.height > window.innerHeight) {
                topOffset = window.innerHeight - barRect.height
              }
              top = `${topOffset}px`
              let leftOffset = selRect.left + selRect.width / 2 - barRect.width / 2
              if (leftOffset < 0) leftOffset = 0
              else if (leftOffset + barRect.width > window.innerWidth) {
                leftOffset = window.innerWidth - barRect.width
              }
              left = `${leftOffset}px`

              Object.assign(ref.current.style, {
                top,
                left,
              })
            }

            Object.assign(ref.current.style, {
              visibility: 'visible',
              opacity: 1,
              'pointer-events': 'all',
            })
          }
        },
        'floatbar',
        100
      )
    }
    document.addEventListener('selectionchange', handleSelection)

    const handleClick = (e: MouseEvent) => {
      const sel = window.getSelection()
      if (
        sel &&
        sel.isCollapsed &&
        !(e.target as HTMLElement).matches('.float-bar *')
      ) {
        floatBar.close()
      }
    }
    document.addEventListener('click', handleClick)

    const handleKeydown = (e) => !funcKey(e) && floatBar.close()
    document.addEventListener('keydown', handleKeydown)

    return () => {
      document.removeEventListener('selectionchange', handleSelection)
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeydown)
    }
  }, [conf.floatBarPlacement, floatBar, setCxt])
  useTopZIndex(ref)

  const items = Object.values(floatBar.items)

  return isEmpty(items)
    ? null
    : createPortal(
        <div
          id={floatBar.floatBarId}
          className={[floatBarStyle, 'float-bar'].join(' ')}
          ref={ref}
          style={{ zIndex: ui.zIndexManager.groups.floatBar }}
        >
          <IconList body={items} />
        </div>,
        document.body
      )
}
