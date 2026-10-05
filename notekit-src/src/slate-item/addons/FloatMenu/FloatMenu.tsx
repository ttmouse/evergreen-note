/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react'
import { icons } from '../../../components/SvgIcon'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { getPubState, setPubState } from '../../hooks/usePubState'
import { ItemNode } from '../../interfaces/item'
import { ItemTransforms } from '../../transforms/item'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { FloatMenuItems, isMenuVisible, ItemFloatMenu } from './FloatMenuComp'
import { $t } from '../../../i18n'
import { browser } from '@/slate-item/utils/browser'
import { appendStyle } from '@/slate-item/utils/dom/appendStyle'

export type FloatMenuContext = {
  item: ItemNode
  editor: ItemEditor
  app: App
}

const MENU_NAME = 'bullet'

export function createFloatMenuAddon({ app, $ }: NewAddonParams) {
  class FloatMenu implements IAddon {
    app!: App
    config = {}

    items: FloatMenuItems = {
      foldSiblings: {
        title: (() => {
          const { item } = this.getContext()
          return item.foldup
            ? $t`floatMenu.unfold_siblings`
            : $t`floatMenu.fold_siblings`
        }) as any,
        icon: icons.svg_fold,
        hotkey: 'mod+e',
        order: 6000,
        onClick() {
          const { editor, item } = $.floatMenu.getContext()
          const willFoldup = !item.foldup
          editor.itemFoldupSiblings(willFoldup)
        },
      },
      others: {
        title: $t`common.others`,
        icon: icons.svg_more,
        hidden: ['title', 'icon'],
        order: 20000,
        foot: Object.values({
          insertAbove: {
            title: $t`common.insert_above`,
            icon: icons.svg_insert_above,
            order: 1000,
            onClick() {
              const { editor, item } = $.floatMenu.getContext()
              ItemTransforms.insertPrevItems(editor, {
                focus: true,
                at: item.GetSlPath(),
              })
            },
          },

          insertBelow: {
            title: $t`common.insert_below`,
            icon: icons.svg_insert_below,
            order: 1000,
            onClick() {
              const { editor, item } = $.floatMenu.getContext()
              ItemTransforms.insertNextItems(editor, {
                at: item.GetSlPath(),
                focus: true,
              })
            },
          },

          trash: {
            title: $t`common.delete`,
            icon: icons.svg_trash,
            order: 10000,
            onClick() {
              const { editor, item } = $.floatMenu.getContext()
              editor.itemRemove(item.GetSlPath())
            },
          },
        }),
      },
    }

    isVisible() {
      return isMenuVisible(MENU_NAME)
    }

    addItems(items: FloatMenuItems) {
      Object.assign($.floatMenu.items, items)
    }

    // createComponent() {
    //   return function ItemFloatMenu() {
    //     const name = MENU_NAME;
    //     const props: FloatMenuProps<FloatMenuContext> = {
    //       name,
    //       targetSelector: '.bullet-menu-btn',
    //       context(el) {
    //         const { $editor, $item } = el.closest('.node') as ItemDOM;
    //         return { editor: $editor, item: $item, app };
    //       },
    //       items: obj2list($.floatMenu.items, (item) => {
    //         const { onClick, hotkey } = item;
    //         if (onClick) {
    //           item.onClick = (e: React.MouseEvent) => {
    //             e.preventDefault();
    //             e.stopPropagation();
    //             onClick(e);
    //             setMenuVisible(name, false);
    //           };
    //         }
    //         extraHotkey(item);
    //         return item;
    //       }),
    //     };
    //     return <FloatMenuComp {...props} />;
    //   };
    // }

    addonInfo() {
      return {
        title: $t`floatMenu.title`,
        quote: $t`floatMenu.quote`,
        type: 'fieldset',
        defaultValue: 'on',
      }
    }

    getContext() {
      return {
        ...getPubState(`float-menu-context-${MENU_NAME}`),
        app,
      } as FloatMenuContext
    }

    showMenuForDOM(dom: HTMLElement) {
      setPubState(`float-menu-context-${MENU_NAME}`, {
        item: (dom as any).$item,
        editor: (dom as any).$editor,
      })
      setPubState(`float-menu-visible-${MENU_NAME}`, true)
    }

    addonRun() {
      const ItemFloatMenu1 = () => {
        return (
          <ItemFloatMenu
            name={MENU_NAME}
            targetSelector='.bullet-menu-btn'
            targetEvent="click"
          />  
        )
      }
      $.ui.pushComponent(ItemFloatMenu1)

      // const ItemFloatMenu2 = () => {
      //   return (
      //     <ItemFloatMenu
      //       name={MENU_NAME}
      //       targetSelector=".node-btn"
      //       targetEvent="contextmenu"
      //     />
      //   );
      // };
      // $.ui.pushComponent(ItemFloatMenu2);
    }
  }

  return { floatMenu: new FloatMenu() }
}
