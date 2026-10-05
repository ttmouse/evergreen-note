import React from 'react'
import { ContextTopItem } from '../addons/EditorView/EditorViewContexts'
import { ContextItem } from '../components/ItemView/ItemView'
import { ItemNode } from '../interfaces/item'

/**
 * Check whether an item is the top one in an editor
 * @returns
 */
export function useIsTop(currentItem?: ItemNode) {
  const item = React.useContext(ContextItem)
  const topItem = React.useContext(ContextTopItem)
  currentItem ??= item
  return currentItem.ky === topItem.ky
}
