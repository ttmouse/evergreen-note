import React from 'react'
import { $t } from '../../../i18n'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { cls } from '../../styles'
import { appendStyle } from '../../utils/dom/appendStyle'
import { StatusBarComp, STATUS_BAR_HEIGHT } from './StatusBarComp'

export type StatusPlace = 'left' | 'center' | 'right'

export function createStatusBarAddon({ app, $ }: NewAddonParams) {
  class StatusBar implements IAddon {
    app!: App
    config = {}

    components: {
      left: React.FC[]
      center: React.FC[]
      right: React.FC[]
    } = {
      left: [],
      center: [],
      right: [],
    }

    createComponent() {
      return StatusBarComp
    }

    pushComponent(Comp: React.FC, place: StatusPlace = 'left') {
      $.statusBar.components[place].push(Comp)
    }

    addonInfo() {
      return {
        title: $t`statusBar.title`,
        quote: $t`statusBar.quote`,
        type: 'fieldset',
        defaultValue: 'off',
        updated: 20221024,
      }
    }

    addonRun() {
      $.ui.pushComponent($.statusBar.createComponent())
      appendStyle(`
        #app-${app.appName} {
          max-height: calc(100vh - ${STATUS_BAR_HEIGHT}px) !important;
        }
      `)

      $.statusBar.pushComponent(() => (
        <span>
          {app.appName} {app.options.version}
        </span>
      ))
    }
  }

  return { statusBar: new StatusBar() }
}
