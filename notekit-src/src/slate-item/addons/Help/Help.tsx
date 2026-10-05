import React from 'react'
import { icons } from '../../../components/SvgIcon'
import { $t } from '../../../i18n'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { getBoxInfo } from '../../utils/calcSnap'
import { HelpIconComp } from './HelpIcon'
import { PaneList } from './Tour'
import { sleep } from '../../utils/sleep'
import { STEPS } from './steps'
import { browser } from '@/slate-item/utils/browser'

export function createHelpAddon({ $ }: NewAddonParams) {
  class Help implements IAddon {
    app!: App
    config = {}

    items = {}

    async showStep(index: number) {
      const step = Object.values(STEPS)[index]
      if (!step) {
        return
      }

      const places = {
        n: ['left-in', 'top-out'],
        s: ['left-in', 'bottom-out'],
        e: ['right-out', 'top-in'],
        w: ['left-out', 'top-in'],
      }

      if ((step as any).to) {
        $.router.to((step as any).to)
        await sleep(200)
      }

      if ((step as any).action) {
        ;(step as any).action($)
        await sleep(200)
      }

      const rect = (
        document.querySelector(step.selector) as HTMLElement
      ).getBoundingClientRect()

      const dialogId = $.dialog.show({
        title: (step as any).title,
        maxWidth: 'xs',
        body: (
          <>
            <p>{$t(step.content)}</p>
            <PaneList {...getBoxInfo(rect)} />
          </>
        ),
        SnapProps: {
          targetBox: rect,
          place: (places as any)[step.p ?? 'e'],
        },
        buttons: {
          [$t`common.gotit`]: () => {
            $.dialog.remove(dialogId)
            index++
            $.help.showStep(index)
          },
        },
      })
    }

    addonInfo() {
      return {
        title: $t`help.title`,
        quote: $t`help.quote`,
        type: 'fieldset',
        defaultValue: 'on',
      }
    }

    addonRun() {

      if (!browser.isMobile) {
        $.main.addMoreExtraCommands({
          hotkey: {
            title: $t`help.hotkeys`,
            icon: icons.svg_hotkey,
            onClick() {
              $.hotkey.show()
            },
          }
        })
      }
      
      // $.help.items = {
      //   hotkey: {
      //     title: $t`help.hotkeys`,
      //     icon: icons.svg_hotkey,
      //     onClick() {
      //       $.hotkey.show()
      //     },
      //   },
      //   // documentation: {
      //   //   title: $t`help.documentation`,
      //   //   icon: icons.svg_manual,
      //   //   onClick() {
      //   //     window.open(`https://roamedit.com/v2?db=docs`)
      //   //   },
      //   // },
      //   // site: {
      //   //   title: $t`help.official_site`,
      //   //   icon: icons.svg_site,
      //   //   onClick() {
      //   //     window.open(`https://roamedit.com/site/`)
      //   //   },
      //   // },
      //   // forum: {
      //   //   title: $t`help.forum`,
      //   //   icon: icons.svg_forum,
      //   //   onClick() {
      //   //     window.open(`https://club.roamedit.com/club/`)
      //   //   },
      //   // },
      // }

      // $.ui.pushComponent(HelpIconComp)

      if (window.location.href.includes('welcome=true')) {
        setTimeout(() => {
          $.help.showStep(0)
        }, 1000)
      }
    }
  }

  return { help: new Help() }
}
