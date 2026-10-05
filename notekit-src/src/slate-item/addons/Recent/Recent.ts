import { icons } from '../../../components/SvgIcon'
import { App, NewAddonParams, IAddon } from '../../engine/App'
import { after } from '../../engine/helper'
import { Item } from '../../interfaces/item'
import { KyString } from '../../interfaces/unit'
import { isEmpty } from '../../utils/isEmpty'
import { EditorProps } from '../EditorView/EditorView'
import { RecentStore } from './RecentStore'
import { appendStyle } from '../../utils/dom/appendStyle'
import { $t } from '../../../i18n'

/**
 * An addon which traces the recent visited items
 */
export function createRecentAddon({ app, $ }: NewAddonParams) {
  class Recent implements IAddon {
    app!: App
    config = {}
    store = new RecentStore()

    /**
     * Display the recent items in the nav sidebar
     */
    addNav() {
      const list = $.recent.store.list.slice(0, $.recent.store.displaySize)

      $.nav?.addItems({
        recent: {
          title: $t`recent.nav_title`,
          size: 18,
          order: 5000,
          icon: icons.svg_recent,
          body: list
            .filter((id) => !isEmpty($.dbMemory.getItem(id)))
            .map((ky) => {
              const item = $.dbMemory.getItem(ky)
              return {
                title: Item.headString(item, { parseRefer: true }),
                icon: 'svg_dot',
                onClick(event) {
                  $.router.to(item)
                  event?.stopPropagation()
                },
              }
            }),
          // onClick() {
          //   $.router.to('/recent')
          // },
        },
      })
    }

    /**
     * Remember an item when it is visited from the router
     * @param ky
     * @param fromRouter
     */
    add(ky: KyString) {
      $.recent.store.add(ky)
      $.recent.addNav()
    }

    addonInfo() {
      return {
        title: $t`recent.title`,
        type: 'fieldset',
        defaultValue: 'on',
        quote: $t`recent.quote`,
      }
    }

    addonRun() {
      appendStyle(`
        #${app.appName}-recent > .node-body {
          margin-left: 2px;
        }
      `)
      $.recent.store.load()
      $.recent.addNav()

      const { getItem } = $.editorView
      after(getItem, (_, ky, options) => {
        if (options.fromRouter) {
          setTimeout(() => $.recent.add(ky))
        }
      })

      after($.dbMemory.deleteItem, (_, ky: KyString) => {
        $.recent.store.list = $.recent.store.list.filter((id) => id !== ky)
      })
    }
  }
  return { recent: new Recent() }
}
