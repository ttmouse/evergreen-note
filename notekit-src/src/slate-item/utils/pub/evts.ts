/* eslint-disable @typescript-eslint/no-unused-vars */
import { Operation } from 'slate'
import { ItemEditor } from '../../addons/EditorFactory/ItemEditor'
import { EditorInfo } from '../../addons/EditorView/EditorViewContexts'
import { ItemDOM } from '../../components/ItemView'
import { ItemEntry, ItemNode } from '../../interfaces/item'
import { KyString } from '../../interfaces/unit'
import { Element } from '../../slate.inc'
import { App } from '../../engine/App'
import { Indexkey } from '../../addons/DbMemory/DbMemory'

/**
 * 应用用到的所有事件类型，以及这些事件处理函数的参数类型
 */
export const evts = {
  uiMounted: (params: { app: App; container: HTMLElement }) => {},

  editorNormalized: (editor: ItemEditor, entry: ItemEntry) => {},

  editorMounted: (params: {
    editor: ItemEditor
    item: UnitPersist
    info: EditorInfo
  }) => {},
  editorUnmounted: (params: {
    editor: ItemEditor
    item: UnitPersist
    info: EditorInfo
  }) => {},

  dbMemoryInitialized: () => {},

  editorChanged: (params: {
    item: UnitPersist
    editor: ItemEditor
    opType?: Operation['type']
  }) => {},

  editorItemMounted: (params: {
    editor: ItemEditor
    item: ItemNode
    ky: KyString
    itemDom: ItemDOM
    ref: React.MutableRefObject<HTMLElement>
    attributes: { [key: string]: unknown }
  }) => {},

  editorItemUnmounted: (params: {
    editor: ItemEditor
    item: ItemNode
    ky: KyString
    itemDom: ItemDOM
    ref: React.MutableRefObject<HTMLElement>
    attributes: { [key: string]: unknown }
  }) => {},

  editorEnterInline: (params: {
    editor: ItemEditor
    inlineElement: Element
  }) => {},

  topicListDelete: () => {},

  selectionChanged: (params: { editor: ItemEditor; op: Operation }) => {},

  dbIndexChanged: (params: {
    indexName: Indexkey
    indexValue: string
    item: UnitPersist
  }) => {},

  addonInvoke: (params: {
    invoker: string
    addon: string
    method: string
    args: any[]
  }) => {},

  dialogNeedHide: (id: string, isHide: boolean) => {},

  setState: (id: string, nextState: any, more?: any) => {},
  dispatch: <T>(id: string, action: T, more?: any) => {},

  itemFocus: (params: { editor: ItemEditor; item: ItemNode }) => {},
  itemBlur: (params: {
    editor: ItemEditor
    item: ItemNode
    itemDom: ItemDOM
  }) => {},
  itemQuoteFocus: (params: { editor: ItemEditor; item: ItemNode }) => {},
  itemQuoteBlur: (params: {
    editor: ItemEditor
    item: ItemNode
    itemDom: ItemDOM
  }) => {},
  itemChanged: (params: {
    originalData: UnitPersist
    newer: UnitPersist
    freshAdd: boolean
    sourceId?: string
  }) => {},
  itemAdded: (params: { item: UnitPersist }) => {},
  cfgLoaded: (params: { cfg: AppConf }) => {},
  cacheLoaded: (params: { data: { [ky: KyString]: UnitPersist } }) => {},
  navFoldupStateChanged: (fold: boolean) => {},
  dialogResized: (id: string, size: { width: number; height: number }) => {},
}

export type Evts = typeof evts
export type EventObject = {
  on: <K extends keyof Evts>(event: K, callback: Evts[K]) => void
  once: <K extends keyof Evts>(event: K, callback: Evts[K]) => void
  emit: <K extends keyof Evts>(event: K, ...args: Parameters<Evts[K]>) => void
  off: <K extends keyof Evts>(event: K, ...handlerList: any[]) => void
}
