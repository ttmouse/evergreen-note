import { App, NewAddonParams, IAddon } from '../../engine/App'
import { UnitProps } from '../../interfaces/unit'
import { NavComp } from './NavComp'
import { getUserKeys } from '../Hotkey/helper'
import { pub } from '@/slate-item/utils/pub'
import { atLater } from '@/slate-item/utils/atLater'

export type NavCommands = {
  [key: string]: Partial<UnitProps>
}

export interface NavStates {
  navFoldup?: boolean
  navTitle: string | JSX.Element
  navCommands: NavCommands
}

declare global {
  interface AppStates extends NavStates {}
}

/**
 * The navigation sidebar
 */
export function createNavAddon({ app, $ }: NewAddonParams) {
  app.setStateSchemes('navFoldup', {
    default: false,
    cache: true,
  })

  class Nav implements IAddon {
    app!: App
    id = `${app.appName}-nav`
    extraCommands = {} as NavCommands
    width = 240

    setTitleState(title: string) {
      app.states.navTitle = <div className="nk-nav-brand">Evergreen note</div>
    }

    createComponent() {
      return NavComp
    }

    addItems(commands: NavCommands) {
      app.states.navCommands = {
        ...(app.states.navCommands ?? {}),
        ...commands,
      }
    }

    addExtraCommands(commands: NavCommands) {
      Object.assign(this.extraCommands, commands)
    }

    setFoldupState(willFold: boolean) {
      const key = `${app.appName}-nav-fold`
      // foldComponent($.nav.id, willFold);
      // setPubState(key, willFold ? 1 : 0);
      localStorage.setItem(key, willFold ? '1' : '0')
      // app.states.navFoldup = willFold;
      app.setState('navFoldup', willFold)
      atLater(()=>pub.emit(pub.evt.navFoldupStateChanged, willFold), 'nav-foldup-evt', 500);
    }

    getCacheStatus() {
      const folded = localStorage.getItem(`${app.appName}-nav-fold`)
      return Boolean(Number(folded))
    }

    pushComponent() {
      $.ui.pushComponent(this.createComponent())
    }

    addonRun() {
      $.nav.pushComponent()

      // 控制左侧显示
      document.addEventListener('keydown', (e) => {
        if (getUserKeys(e) === 'mod+,') {
          $.nav.setFoldupState(!app.states.navFoldup)
          e.preventDefault()
        }
      })

      // 控制右侧显示
      document.addEventListener('keydown', (e) => {
        if (getUserKeys(e) === 'mod+.') {
          $.extArea.foldup(!app.states.extAreaFoldup)
        }
      })
    }
  }

  return { nav: new Nav() }
}
