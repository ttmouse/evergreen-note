import { ItemDOM } from '../../components/ItemView'
import { ItemNode } from '../../interfaces/item'
import { ItemEditor } from '../../addons/EditorFactory/ItemEditor'
import { App } from '../../engine/App'

const VIEW_KEYS = new Set([
  '$id',
  '$isTop',
  '$isTmp',
  '$isRefer',
  '$crumbsContext',
  '$requireChildren',
  'type',
  'children',
  'DoModify',
  'DoFoldup',
  'DoRemove',
  'DoFocus',
  'GetSlPath',
  'GetEditor',
  'GetPlainText',
  'GetPrev',
  'GetNext',
  'GetParent',
  'GetIndex',
  'GetNextAll',
  'GetPrevAll',
  'GetSubitems',
])

const PROXY_META = new WeakMap<
  object,
  { ky: string; editor: ItemEditor; app: App }
>()

export function createItemProxy(
  ky: string,
  element: ItemNode,
  editor: ItemEditor,
  app: App
): ItemNode {
  let currentElement = element

  const meta = { ky, editor, app }
  const handler: ProxyHandler<object> = {
    get(_target, prop, _receiver) {
      if (prop === '__updateElement') {
        return (newElement: ItemNode) => {
          currentElement = newElement
        }
      }
      if (prop === '__isProxy') {
        return true
      }
      if (prop === '$editor') {
        return editor
      }
      if (prop === '__ky') {
        return ky
      }

      if (VIEW_KEYS.has(prop as string)) {
        const val = (currentElement as any)[prop]
        if (typeof val === 'function') {
          return val.bind(currentElement)
        }
        return val
      }

      const dbMemory = app.addons.dbMemory
      if (dbMemory && dbMemory.nodes) {
        const node = dbMemory.nodes[ky]
        if (node && prop in node) {
          const val = (node as any)[prop]
          if (typeof val === 'function') {
            return val.bind(node)
          }
          return val
        }
      }

      const fallback = (currentElement as any)[prop]
      if (typeof fallback === 'function') {
        return fallback.bind(currentElement)
      }
      return fallback
    },

    set() {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(
          '[createItemProxy] Setting properties on $item proxy is not allowed. Use DoModify() or saveItem() instead.'
        )
      }
      return true
    },

    has(_target, prop) {
      if (prop === '$editor' || prop === '__ky' || prop === '__isProxy' || prop === '__updateElement') {
        return true
      }
      if (VIEW_KEYS.has(prop as string)) {
        return prop in currentElement
      }
      const dbMemory = app.addons.dbMemory
      if (dbMemory && dbMemory.nodes) {
        const node = dbMemory.nodes[ky]
        if (node && prop in node) {
          return true
        }
      }
      return prop in currentElement
    },

    ownKeys() {
      const keys = new Set<string | symbol>()
      // keys.add('$editor')
      // keys.add('__ky')
      // keys.add('__isProxy')
      // keys.add('__updateElement')
      for (const key of Object.keys(currentElement)) {
        if (!VIEW_KEYS.has(key)) continue
        keys.add(key)
      }
      const dbMemory = app.addons.dbMemory
      if (dbMemory && dbMemory.nodes) {
        const node = dbMemory.nodes[ky]
        if (node) {
          for (const key of Object.keys(node)) {
            keys.add(key)
          }
        }
      }
      return Array.from(keys)
    },

    getOwnPropertyDescriptor(_target, prop) {
      // if (prop === '$editor' || prop === '__ky' || prop === '__isProxy' || prop === '__updateElement') {
      //   return { configurable: true, enumerable: true }
      // }
      if (VIEW_KEYS.has(prop as string) && prop in currentElement) {
        return { configurable: true, enumerable: true }
      }
      const dbMemory = app.addons.dbMemory
      if (dbMemory && dbMemory.nodes) {
        const node = dbMemory.nodes[ky]
        if (node && prop in node) {
          return { configurable: true, enumerable: true }
        }
      }
      return undefined
    },
  }

  const target = Object.create(null)
  const proxy = new Proxy(target, handler) as unknown as ItemNode
  PROXY_META.set(proxy, meta)
  return proxy
}

export function isItemProxy(value: ItemNode): boolean {
  return PROXY_META.has(value)
}

export function updateItemProxyElement(
  dom: ItemDOM,
  element: ItemNode,
  editor: ItemEditor,
  app: App
) {
  if ((dom.$item as ItemNode)?.__isProxy) {
    ;(dom.$item as ItemNode).__updateElement(element)
  } else {
    dom.$item = createItemProxy(element.ky, element, editor, app)
  }
  dom.$editor = editor
}
