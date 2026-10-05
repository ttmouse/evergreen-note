import React from 'react'
import { ItemEditor, ItemNode } from '../..'

export * from './Outer'
export * from './Head'
export * from './Text'
export * from './Extra'
export * from './Body'
export * from './Subitems'
export * from './Quote'

export const ContextItem = React.createContext<ItemNode>({} as any)
export const ContextItemStyle = React.createContext({})

export type ItemDOM = (HTMLDivElement | HTMLSpanElement | HTMLElement) & {
  $item: ItemNode
  $editor: ItemEditor
} & {
  __updateElement?: (el: ItemNode) => void
  __isProxy?: boolean
  __ky?: string
}
