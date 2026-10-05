import { $t } from '../../../i18n'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { after, cover } from '../../engine/helper'
import { KyString, UnitCrumbs, UnitPersist } from '../../interfaces/unit'
import { isEmpty } from '../../utils/isEmpty'
import { Item } from '../../interfaces/item'

declare global {
  interface AppConf {
    documentCrumbsPosition?:
      | 'topBar' // 在页面顶部工具条显示
      | 'topDoc' // 在文档顶部显示

    blockRefCrumbsVisible?: 'yes' | 'no'
  }
}

export function createCrumbsAddon({ app, $ }: NewAddonParams) {
  class Crumbs implements IAddon {
    app!: App
    config = {
      documentCrumbsPosition: 'topBar',
      blockRefCrumbsVisible: 'no',
    }

    getCrumbs(item: UnitPersist | KyString): UnitCrumbs {
      if (typeof item === 'string') {
        item = $.dbMemory.getItem(item)
      }
      // if (!isEmpty(item.crumbs)) {
      //   return item.crumbs!
      // }
      const crumbs = this.getPath(item)
        .map((one) => $.dbMemory.nodes[one])
        .filter(e => e)
        .map((item) => ({
          ky: item.ky,
          text: Item.headString(item, { parseRefer: true }),
          isTopic: !isEmpty(item.topic),
        }))
      return crumbs
    }

    getPath(item: UnitPersist | KyString): KyString[] {
      if (typeof item === 'string') {
        item = $.dbMemory.getItem(item)
      }
      if (!isEmpty(item.path)) {
        return item.path!
      }
      return $.dbMemory.getParentItems(item.ky).map((one) => one.ky)
    }

    addonInfo() {
      return {
        title: $t`crumbs.title`,
        quote: $t`crumbs.quote`,
        updated: 20221030,
        defaultValue: 'off',
        type: 'fieldset',
        subitems: {
          documentCrumbsPosition: {
            title: $t`crumbs.document_crumbs_position`,
            type: 'select',
            options: {
              topBar: $t`crumbs.top_bar`,
              topDoc: $t`crumbs.top_doc`,
            },
          },
          topBarQuote: {
            type: 'alert',
            quote: $t`crumbs.top_bar_quote`,
            when: { documentCrumbsPosition: 'topBar' },
          },
          topDocQuote: {
            type: 'alert',
            quote: $t`crumbs.top_doc_quote`,
            when: { documentCrumbsPosition: 'topDoc' },
          },

          // blockRefCrumbsVisible: {
          //   title: $t`crumbs.block_ref_crumbs_visible`,
          //   type: 'select',
          //   options: {
          //     no: $t`common.no`,
          //     yes: $t`common.yes`,
          //   },
          // },
        },
      }
    }

    addonRun() {
      const { setCrumbs } = $.main
      cover(setCrumbs, (itemCrumbs) => {
        if (app.cfg.documentCrumbsPosition === 'topDoc') {
          return
        }
        setCrumbs.call($.main, itemCrumbs)
      })

      const { hookProps } = $.editorView
      after(hookProps, (props) => {
        if (
          props.fromRouter &&
          app.cfg.documentCrumbsPosition === 'topDoc'
          // (cfg.blockRefCrumbsVisible === 'yes' &&
          //   props.invoker === EDITOR_INVOKER.BLOCK_REF)
        ) {
          return {
            ...props,
            crumbsVisible: true,
          }
        }
        return props
      })
    }
  }

  return { crumbs: new Crumbs() }
}
