import { $t } from '../../../../i18n'
import { App, NewAddonParams } from '../../../engine/App'
import { mkid } from '../../../utils/string/mkid'
import { IAddonElement } from '../../ElementRegistry/ElementRegistry'
import { InlineElement } from '../../Inlines/Inlines'
import { SlashMenuItems } from '../../SlashMenu/SlashMenu'
import { StrmapRuleInfo, StrmapParams } from '../../Strmap/Strmap'
import { FormNeededProps } from '../interfaces'
import { SwitcherElementComp } from './SwitcherElementComp'

/**
 * Switcher 表单元素的接口
 */
export type SwitcherElement = FormNeededProps &
  InlineElement & {
    blockType: string
    value: boolean
  }

export class Switcher implements IAddonElement<SwitcherElement> {
  app!: App
  config = {}

  isVoid(val: SwitcherElement) {
    return this.verify(val)
  }

  createComponent() {
    return SwitcherElementComp
  }

  exportString(el: SwitcherElement) {
    return ` [${el.value ? 'x' : ' '}] `
  }

  fromMarkdown(md: string) {
    return undefined
  }

  verify(val: any): val is SwitcherElement {
    return val.blockType === 'switcher'
  }

  strmap(): StrmapRuleInfo {
    const { switcher } = this.app.addons
    return {
      title: 'Switcher',
      strmapRule: /\{\{switcher\}\}$/,
      handle({ match }: StrmapParams) {
        return switcher.createElement({ value: false })
      },
    } as any
  }

  slashMenu(): SlashMenuItems {
    const { slashMenu, switcher } = this.app.addons
    return {
      slashSwitcher: {
        icon: 'svg_switcher',
        title: $t`switcher.slash_menu_title`,
        order: slashMenu.order.inline,
        versions: {
          en: { v: 'switch' },
          cn: { v: '开关' },
          pinyin: { v: 'kai guan' },
          py: { v: 'kg' },
        },
        handle({ editor }) {
          slashMenu.insertText(editor, [
            switcher.createElement({ value: false }),
            { text: '' },
          ])
        },
      },
    }
  }

  createElement(props: { value: boolean }): SwitcherElement {
    return {
      inline: true,
      isVoid: true,
      iky: mkid(),
      blockType: 'switcher',
      ...props,
      children: [{ text: `{{switcher}}` }],
    } as unknown as SwitcherElement
  }

  addonInfo() {
    return {
      title: $t`switcher.title`,
      quote: $t`switcher.quote`,
      defaultValue: 'on',
    }
  }

  addonRun() {
    // Initialization for this the addon Switcher
  }
}

export function createSwitcherAddon({ app, $ }: NewAddonParams) {
  return new Switcher()
}
