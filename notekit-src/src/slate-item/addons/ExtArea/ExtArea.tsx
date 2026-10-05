import { browser } from '@/slate-item/utils/browser'
import { icons } from '../../../components/SvgIcon'
import { $t } from '../../../i18n'
import { App, NewAddonParams, IAddon } from '../../engine/App'
import { before, cover } from '../../engine/helper'
import { KyString } from '../../interfaces/unit'
import { getUserKeys } from '../Hotkey/helper'
import { ExtAreaComp } from './ExtAreaComp'
import { ExtAreaItem } from './ExtAreaStore'

export interface ExtAreaStates {
  extAreaFoldup?: boolean
  extAreaItems?: ExtAreaItem[]
}

declare global {
  interface AppStates extends ExtAreaStates {}
}

/**
 * Right sidebar
 */
export function createExtAreaAddon({ app, $ }: NewAddonParams) {
  app.setStateSchemes('extAreaFoldup', {
    default: true,
    cache: true,
  })('extAreaItems', {
    default: [],
    cache: true,
  })

  class ExtArea implements IAddon {
    app!: App
    config = {}

    getItem(ky: KyString) {
      return $.dbMemory.getItem(ky, { isRecur: true })
    }

    add(extItem: ExtAreaItem) {
      this.remove(extItem.key)
      app.states.extAreaItems = [extItem, ...(app.states.extAreaItems ?? [])]
      $.extArea.show()
    }

    toggle() {
      app.setState('extAreaFoldup', !app.getState('extAreaFoldup'))
    }

    foldup(willFoldup = true) {
      app.setState('extAreaFoldup', willFoldup)
    }

    remove(key: string) {
      app.setState(
        'extAreaItems',
        app.states.extAreaItems?.filter((item) => item.key !== key) ?? []
      )
    }

    show() {
      // $.extArea.store.setFoldup(false);
      $.extArea.foldup(false)
    }

    clear() {
      app.setState('extAreaItems', [])
      $.extArea.foldup()
    }

    addonCommands() {
      return {
        extArea: {
          title: $t`extArea.editor_dropdown_title`,
          icon: icons.svg_extarea,
          hotkey: 'mod+o',
          context: 'global',
          handle() {
            $.extArea.show()
          },
        },
      }
    }

    handleReferIconClick(item: UnitPersist) {
      // $.extArea.add({
      //   type: 'item',
      //   key: item.ky,
      // });
      $.router.to(item)
    }

    addonInfo() {
      return {
        title: $t`extArea.title`,
        quote: $t`extArea.quote`,
        type: 'fieldset',
        defaultValue: 'on',
      }
    }

    addonBeforeRun() {
      before($.floatMenu.addonRun, () => {
        ;($.floatMenu.items.others as any).foot = {
          extArea: {
            title: $t`extArea.editor_dropdown_title`,
            icon: icons.svg_extarea,
            order: 100,
            onClick() {
              const { item } = $.floatMenu.getContext()
              $.extArea.add({
                type: 'topic',
                key: item.ky,
              })
            },
          },
          ...($.floatMenu.items.others as any).foot,
        }
      })
    }

    addonRun() {
      if(!browser.isMobile) {
        $.editorView.addDropdown({
          rightOpen: {
            icon: icons.svg_extarea,
            title: $t`extArea.editor_dropdown_title`,
            hotkey: 'mod+o',
            onClick(e, { item }) {
              $.extArea.add({
                type: 'topic',
                key: item.ky,
              })
            },
          },
        })
  
        $.floatMenu?.addItems({
          rightOpen: {
            icon: icons.svg_extarea,
            title: $t`extArea.editor_dropdown_title`,
            hotkey: 'mod+o',
            onClick(e) {
              const { item } = $.floatMenu.getContext()
              $.extArea.add({
                type: 'topic',
                key: item.ky,
              })
            },
          },
        })
      }

      cover($.refer.handleReferIconClick, $.extArea.handleReferIconClick)

      $.ui.pushComponent(ExtAreaComp)

      document.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement
        if (
          e.shiftKey &&
          target.matches('.element-bilink, .element-bilink *')
        ) {
          const sel = window.getSelection()
          const el = target.closest('.element-bilink') as HTMLElement
          const topicStr = $.topic.refine(el.innerText)
          const topicItem = $.topic.createTopic(topicStr)
          topicItem && $.extArea.add({ key: topicItem.ky, type: 'topic' })
          sel?.collapse(el)
        }
      })

      document.addEventListener('keydown', (e) => {
        if (getUserKeys(e) === 'mod+.') {
          $.extArea.foldup(!app.states.extAreaFoldup)
        }
      })
    }
  }

  return { extArea: new ExtArea() }
}
