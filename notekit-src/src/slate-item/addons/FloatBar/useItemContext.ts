import React from 'react'
import { ItemDOM } from '../../components/ItemView'
import { usePubState, PUB_STATES, getPubState } from '../../hooks/usePubState'
import { atLater } from '../../utils/atLater'
import { getSelectionText } from '../../utils/dom/getSelectionText'

export function getItemContext(ctxKey: string) {
  return getPubState(ctxKey)
}

export function useItemContext(ctxKey: string) {
  const [, setContext] = usePubState<any>(ctxKey, null)
  React.useEffect(() => {
    document.addEventListener('selectionchange', (e) => {
      atLater(() => {
        const sel = window.getSelection()
        if (
          sel &&
          !sel.isCollapsed &&
          sel.anchorNode?.parentElement?.matches('.node[data-ky] *')
        ) {
          const dom = sel.anchorNode.parentElement.closest('.node') as ItemDOM
          setContext({
            item: dom.$item,
            editor: dom.$editor,
            itemDom: dom,
            selectedText: getSelectionText(),
          })
        }
      }, `useItemContent-${ctxKey}`)
    })
  }, [ctxKey, setContext])
}
