import { ItemEditor, ItemNode, UnitProps } from '../..'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { FloatBarComp } from './FloatBarComp'
import { mkid } from '../../utils/string/mkid'
import { ItemDOM } from '../../components/ItemView'
import { getItemContext } from './useItemContext'
import { $t } from '../../../i18n'
import { browser } from '@/slate-item/utils/browser'
import { appendStyle } from '@/slate-item/utils/dom/appendStyle'

export const PUB_KEY_FLOATBAR = 'floatbar-context'

export type FloatBarContext = {
  item: ItemNode
  editor: ItemEditor
  itemDom: ItemDOM
  selectedText: string
  app: App
}

declare global {
  interface AppConf {
    floatBarPlacement?: 'above' | 'below'
  }
}

export type FloatBarItem =
  | { order: number; width: number; cond: () => boolean }
  | Pick<UnitProps, 'title' | 'icon' | 'onClick' | 'render'>
  | Pick<UnitProps, 'title' | 'icon' | 'subitems'>

export type FloatBarItems = {
  [key: string]: FloatBarItem
}

export function createFloatBarAddon({ app, $ }: NewAddonParams) {
  class FloatBar implements IAddon {
    app!: App
    config = {}
    floatBarId = mkid()
    items: FloatBarItems = {}

    addItems(items: FloatBarItems) {
      // 把 onClick 换成 onMouseDown
      for (const k in items) {
        const it = items[k] as any
        if (it.onClick) {
          const onClick = it.onClick
          it.onMouseDown = (e: React.MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            onClick(e)
          }
          delete it.onClick
        }
      }
      Object.assign($.floatBar.items, items)
    }

    createComponent() {
      return FloatBarComp
    }

    getContext() {
      return { ...getItemContext(PUB_KEY_FLOATBAR), app } as FloatBarContext
    }

    addonInfo() {
      return {
        title: $t`floatBar.title`,
        quote: $t`floatBar.quote`,
        defaultValue: 'on',
        type: 'fieldset',
        subitems: {
          floatBarPlacement: {
            title: $t`floatBar.placement`,
            type: 'select',
            options: {
              above: $t`floatBar.placement_above`,
              below: $t`floatBar.placement_below`,
            },
            defualtValue: 'top',
            quote: `If you are using some extensions that may conflict with the float bar, you can try to change the placement to "bottom".`,
          },
        },
      }
    }

    close() {
      const el = document.getElementById($.floatBar.floatBarId)
      if (el) {
        Object.assign(el.style, {
          'pointer-events': 'none',
          opacity: 0,
        })
      }
    }

    addonRun() {
      $.ui.pushComponent($.floatBar.createComponent())
    }
  }

  return { floatBar: new FloatBar() }
}
