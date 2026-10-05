import { $t } from '../../../i18n'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { cover } from '../../engine/helper'
import { Item } from '../../interfaces/item'
import { KyString } from '../../interfaces/unit'
import { ReactEditor } from '../../slate.inc'
import { isEmpty } from '../../utils/isEmpty'
import { trim } from '../../utils/string/trim'
import { BilinkElement } from '../Bilink/Bilink'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { Options } from '../Form/Form'
import { nsTrim } from './helper'
import { NameSpaceReferenceComp } from './NameSpaceReferenceComp'

export function createNameSpaceAddon({ app, $ }: NewAddonParams) {
  function meaningOptions(keyword: string): Options {
    const options = {
      [keyword]: keyword,
    } as any
    $.nameSpace.findMeanings(keyword).forEach((item) => {
      options[trim(item.topic!)] = Item.headString(item)
      // defautValue ??= item.topic!;
    })
    return options
  }

  class NamdSpace implements IAddon {
    app!: App
    config = {}

    addonInfo() {
      return {
        title: $t`nameSpace.title`,
        quote: $t`nameSpace.quote`,
        type: 'fieldset',
        defaultValue: 'off',
        updated: 20221025,
      }
    }

    findMeanings(keyword: string, excludeSelf = false) {
      const lower = nsTrim(keyword).toLowerCase()
      const list = $.topic
        .getList()
        .filter(
          (item) =>
            (item.topic?.endsWith(`/${lower}`) || item.topic === lower) &&
            (!excludeSelf || item.topic !== keyword.toLowerCase())
        )

      // if (!excludeSelf) {
      //   const topicItem = $.topic.getTopic(keyword);
      //   if (topicItem) {
      //     list.push(topicItem);
      //   }
      // }

      return list ?? []
    }

    hasMultiMeanings(keyword: string) {
      return this.findMeanings(keyword).length > 1
    }

    showFormChooseMeanings(params: {
      editor: ItemEditor
      element: BilinkElement
      keyword: string
      buttons?: { [k: string]: null | ((values: { meaning: string }) => void) }
    }) {
      const { editor, element, keyword, buttons } = params

      const formHandler = $.form.popup({
        title: $t`nameSpace.form_title_choose`,
        DialogProps: {
          width: 300,
        },
        initialValues: {
          meaning: '',
        },
        subitems: {
          meaning: {
            type: 'radio',
            title: $t('nameSpace.meaning_of', { keyword }),
            canMore: true,
            options: meaningOptions(keyword),
          },
        },
        buttons: buttons ?? {
          bind: {
            title: $t`nameSpace.bind_button`,
            size: 'small',
            color: 'success',
            onClick() {
              const values = formHandler.getValues()
              $.nameSpace.fixMeaning(editor, element, values.meaning)
            },
          },
          [$t`nameSpace.open_button`]: (values) => {
            $.topic.route(values.meaning as string)
          },
        },
      })
    }

    /**
     * 消除多义性
     * @param editor
     * @param bilinkElement
     * @param targetMeaging
     */
    fixMeaning(
      editor: ItemEditor,
      bilinkElement: BilinkElement,
      targetMeaging: string
    ) {
      try {
        const path = ReactEditor.findPath(editor as any, bilinkElement)
        $.inlines.setProps<BilinkElement>(editor, path, {
          topic: targetMeaging,
          iky: bilinkElement.iky,
        })
        setTimeout(() => {
          $.topic.route(targetMeaging)
        }, 100)
      } catch (e) {
        console.error(e)
      }
    }

    getBacklinkItems(item: KyString | UnitPersist): UnitPersist[] {
      if (typeof item === 'string') {
        item = $.dbMemory.getItem(item)
      }
      if (isEmpty(item.topic)) {
        return []
      }

      const list = [] as UnitPersist[]
      for (const topicItem of $.nameSpace.findMeanings(item.topic!, true)) {
        const items = $.dbMemory.getSubitems(topicItem.ky, { isRecur: true })
        // const backItems = $.backlink.getLinkedItems(topicItem.ky);
        // const theItem = $.backlink.makeElement({
        //   title: `${backItems.length} Backlinks to "${topicItem.topic}"`,
        //   subitems: items,
        //   ky: `${item.ky}-linked`,
        //   foldupTopics: true,
        // });
        list.push(...items)
      }
      return list
    }

    addonRun() {
      const { createElement, handleClick } = $.bilink ?? {}

      // 创建带有命名空间的链接时，只显示主题，而不显示命名空间
      cover(createElement, ({ topic, alias }) => {
        if (topic?.includes('/') && isEmpty(alias)) {
          const aliasTrimNameSpace = topic.replace(/^[^/]+\//, '')
          return createElement.call($.bilink, {
            topic,
            alias: aliasTrimNameSpace,
          })
        }
        return createElement.call($.bilink, { topic, alias })
      })

      // 点击 bilink 时，如果有多义词，弹出选择框
      cover(handleClick, (e, params) => {
        const { topicTitle, element, editor } = params
        if (!topicTitle?.includes('/') && isEmpty(element.topic)) {
          const meanings = $.nameSpace.findMeanings(topicTitle)
          if (meanings.length > 1) {
            $.nameSpace.showFormChooseMeanings({
              keyword: topicTitle,
              editor,
              element,
            })
            return
          }
        }
        return handleClick.call($.bilink, e, params)
      })

      // 给 bilink element 的编辑表单添加多义词选择
      const { popup } = $.form
      cover(popup, (params) => {
        if (params.name === 'bilink-form') {
          const options = meaningOptions(params.initialValues!.linkText)
          if (!isEmpty(options)) {
            Object.assign(params.subitems.linkTarget, { options })
          }
        }
        return popup.call($.form, params)
      })

      // 当链接探测器试图链接多义词时，弹出语义选择框
      const { linkSelection } = $.hint ?? {}
      cover(linkSelection, (editor, ...args) => {
        const { hintDom } = $.hint.getContext()
        const topicTitle = trim(hintDom.innerText)
        if (
          !topicTitle?.includes('/') &&
          $.nameSpace.hasMultiMeanings(topicTitle)
        ) {
          $.nameSpace.showFormChooseMeanings({
            keyword: topicTitle,
            editor,
            element: null as any,
            buttons: {
              [$t`namespace.link_button`]: (values) => {
                $.bilink.linkSelection(editor, values.meaning)
              },
              [$t`common.cancel`]: null,
            },
          })
        } else {
          linkSelection.call($.hint, editor, ...args)
        }
      })

      $.editorView.addMoreComponent(NameSpaceReferenceComp as any, 0)
    }
  }

  return { nameSpace: new NamdSpace() }
}
