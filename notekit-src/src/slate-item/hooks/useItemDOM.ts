import React from 'react'
import { ContextItem, ItemDOM } from '../components/ItemView/ItemView'
import { updateItemProxyElement } from '../utils/dom/createItemProxy'
import { useAddons } from './useAddons'
import { ContextEditor } from '../addons/EditorView/EditorViewContexts'

export function useItemDOM(ref: React.RefObject<HTMLElement>) {
  const item = React.useContext(ContextItem)
  const editor = React.useContext(ContextEditor)
  const { app } = useAddons()
  React.useEffect(() => {
    if (ref.current) {
      updateItemProxyElement(ref.current as ItemDOM, item, editor, app)
    }
  }, [item, ref])
}
