import { icons } from '../../../components/SvgIcon'
import { $t } from '../../../i18n'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { after } from '../../engine/helper'
import { UnitProps } from '../../interfaces/unit'
import { isEmpty } from '../../utils/isEmpty'
import { FloatMenuItems } from '../FloatMenu/FloatMenuComp'
import { layoutStyleDefault } from './default.style'
// import { createWhiteboardAddon } from './Whiteboard/Whiteboard'
import { createFlexmapAddon } from './Flexmap/Flexmap'
import { layoutStyleItemGroup, layoutStyleResultNoGroupResult } from './item-group.style'
import { createKanbanAddon } from './Kanban/Kanban'
import './LayoutLogic'
import { createLayoutMarkdownAddon } from './LayoutMarkdown/LayoutMarkdown'
import './layouts.less'
import { createTableSimpleAddon } from './TableSimple/TableSimple'
// import { createDatagridAddon } from './Datagrid/Datagrid'
import { createChatAddon } from './Chat/Chat';
import { createDatagridAddon } from './Datagrid/Datagrid'
import { createWhiteboardAddon } from './Whiteboard/Whiteboard'
import { ItemEditor } from '../EditorFactory/ItemEditor'

export type ItemStyle = {
  outer: string
  tools: string
  icon: string
  head: string
  body: string
  text: string
  child?: string
  quote?: string
  extra?: string
}

export type ItemLayoutStyles = {
  [layoutName: string]: ItemStyle[]
}

export type LevelNames = {
  [layoutName: string]: string[]
}

export interface IAddonLayout extends IAddon {
  /**
   * The names for gererating CSS class-names for each level of the layout.
   */
  levelNames: { [layoutName: string]: string[] }
}

export function createLayoutFactoryAddon(params: NewAddonParams) {
  const { $ } = params

  class LayoutFactory implements IAddon {
    app!: App
    config = {}

    styles: ItemLayoutStyles = {}
    registerStyles(styles: ItemLayoutStyles) {
      Object.assign(this.styles, styles)
    }

    getStyle(layoutName = 'default'): ItemStyle[] {
      return (
        (layoutName in this.styles
          ? this.styles[layoutName]
          : this.styles.default) ?? []
      )
    }

    allLevelNames: LevelNames = {}
    registerLevelNames(names: LevelNames) {
      Object.assign(this.allLevelNames, names)
    }

    getLevelNames(layoutName: string): string[] | null {
      return layoutName in this.allLevelNames
        ? this.allLevelNames[layoutName]
        : null
    }

    isAddonImplemented(addon: IAddon): addon is IAddonLayout {
      return typeof (addon as IAddonLayout).levelNames === 'object'
    }

    addonBeforeRun() {
      const { layoutFactory } = this.app.addons
      after(this.app.execAddonRun, (_, addon) => {
        if (layoutFactory?.isAddonImplemented(addon)) {
          layoutFactory?.registerLevelNames(addon.levelNames)
        }
      })
    }

    menuItems: FloatMenuItems = {} as any
    addMenuItems(items: FloatMenuItems) {
      Object.assign(this.menuItems, items)
    }

    layouts: {
      [layoutName: string]: Pick<UnitProps, 'title' | 'icon' | 'onClick'>
    } = {
      outline: {
        title: $t`layoutFactory.outline`,
        icon: icons.svg_list,
      },
    }

    registerLayouts(layouts: FloatMenuItems) {
      Object.assign(this.layouts, layouts)
    }

    applies(layoutName: string, editor: ItemEditor) {
      editor.itemSetProps({ layout: layoutName })
    }

    handleFloatMenu(layoutName: string) {
      const { editor, item } = $.floatMenu.getContext()
      editor.itemSetProps({ layout: layoutName }, item.GetSlPath())
    }

    addonInfo() {
      return {
        title: $t`layoutFactory.title`,
        quote: $t`layoutFactory.quote`,
        type: 'fieldset',
        defaultValue: 'on',
      }
    }

    addonRun() {
      $.snippet?.allowTitleField('layout')

      this.registerStyles({
        default: layoutStyleDefault,
        'item-group': layoutStyleItemGroup,
        'result-nogroup': layoutStyleResultNoGroupResult
      })

      $.slashMenu?.addItems({
        slashOutline: {
          icon: 'svg_list',
          title: $t`layoutFactory.outline`,
          order: $.slashMenu.order.layout,
          versions: {
            en: { v: 'as outline' },
            pingyin: { v: 'da gang' },
            py: { v: 'dg' },
            cn: { v: '大纲' },
          },
          handle({ editor }) {
            $.slashMenu.insertText(editor, '')
            editor.itemSetProps({ layout: '' })
          },
        },
      })

      if (!isEmpty($.layoutFactory?.layouts)) {
        const menuItems: FloatMenuItems = {}
        for (const [layoutName, item] of Object.entries(
          $.layoutFactory.layouts
        )) {
          menuItems[layoutName] = {
            title: item.title,
            icon: item.icon,
            onClick() {
              $.layoutFactory?.handleFloatMenu(layoutName)
            },
          }
        }

        $.floatMenu?.addItems({
          layout: {
            title: $t`layoutFactory.item_menu_title`,
            icon: icons.svg_layout,
            order: 5000,
            subitems: menuItems,
          },
        })

        // $.editorView.addDropdown({
        //   layout: {
        //     title: $t`layoutFactory.item_menu_title`,
        //     icon: icons.svg_layout,
        //     order: 5000,
        //     subitems: menuItems,
        //   },
        // });
      }
    }
  }

  return {
    ...createFlexmapAddon(params),
    ...createTableSimpleAddon(params),
    ...createKanbanAddon(params),
    ...createLayoutMarkdownAddon(params),
    // ...createChatAddon(params),
    ...createWhiteboardAddon(params),
    // ...createDatagridAddon(params),
    layoutFactory: new LayoutFactory(),
  }
}
