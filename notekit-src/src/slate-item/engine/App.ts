/* eslint-disable @typescript-eslint/no-unused-vars */
import { DEBUG_MODE, LoadedAddonName, LoadedAddons } from '../../main'
import { PreferName } from '../addons/Prefer/Prefer'
import { isEmpty } from '../utils/isEmpty'
import { upperCaseFirst } from '../utils/string'
import { addonBindMetods, addonCheckMethods, addonDisable } from './helper'
import {
  CommandMaps,
  AppOptions,
  IAddon,
  CommandInfo,
  CommandParams,
} from './App.d'
import { AppStateName, StateStore, StateSchemes } from './StateStore'
import { setPubState } from '../hooks/usePubState'
import { createEv } from '../utils/pub/pub';
import { EventObject, Evts } from '../utils/pub/evts'
import { exposure } from '../pluginExposure'

export * from './App.d'

let INSTANCE_ID = 1

export function appmark(msg: string) {
  setPubState('app_mark', msg)
}

/**
 * Application
 */
export class App implements EventObject {
  instanceId!: number

  /**
   * All loaded addons
   *
   * @type {{[k: string]: Addon}}
   * @memberof App
   */
  addons: LoadedAddons = {} as LoadedAddons

  commands: CommandMaps = {}

  importStatus = { importing: 0, shouldRefresh: false }

  /**
   * The options that is used to creating current app instance
   *
   * @type {{[k: string]: any}}
   * @memberof App
   */
  options: AppOptions

  evt = createEv()

  get cfg(): AppConf {
    const { prefer, preferGlobal } = this.addons
    return new Proxy<AppConf>({} as any, {
      get(_, prop: PreferName) {
        if (prop.startsWith('global')) {
          return preferGlobal.getValue(prop)
        }
        return prefer.getValue(prop as any)
      },

      set(_, prop: PreferName, value) {
        if (prop.startsWith('global')) {
          preferGlobal.setValue(prop, value)
          return true
        }
        prefer.setValue(prop as any, value)
        return true
      },
    })
  }

  private _states!: StateStore
  private _stateSchemes: StateSchemes<any> = {}

  get states(): AppStates {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const app = this
    return new Proxy<AppStates>({} as any, {
      get(_: any, prop: AppStateName) {
        return app.getState(prop)
      },

      set<K extends AppStateName>(_: any, prop: K, value: AppStates[K]) {
        app.setState(prop, value)
        return true
      },
    })
  }

  get appName() {
    return this.options.appName
  }

  get user() {
    return this.options.user
  }

  /**
   * An object with the name of all app instances as its keys
   *
   * @type {{[appName: string]: App}}
   * @memberof App
   */
  static instances: { [appName: string]: App } = {}

  /**
   * Whether allow a create a app instance
   *
   * @static
   * @type {boolean}
   * @memberof App
   */
  private static canNew = false

  /**
   * Get a instance of Application class
   * Notice:
   *  you can not directly call new App() to get an app instance,
   *  instead you should call App.getInstance()
   *
   * @static
   * @param {string} appName A unique ID/name for an app instance
   * @param {*} [options={}] An options for creating an app instance
   * @return {App}
   * @memberof App
   */
  static getInstance(optionsOrId?: string | AppOptions): App {
    if (typeof optionsOrId === 'string') {
      return App.instances[optionsOrId]
    }
    if (!optionsOrId) {
      const instances = Object.values(App.instances)
      if (instances.length < 1) {
        throw new Error('No app instance found')
      }
      return instances[0]
    }

    const options = optionsOrId
    const { appName } = options

    if (/^\w+$/.test(appName) === false) {
      // eslint-disable-next-line prettier/prettier
      throw new Error(`The app name '${appName} is not a valid name, it should be a string that only contains letters, numbers and underscores`)
    }
    if (/^\d/.test(appName)) {
      // eslint-disable-next-line prettier/prettier
      throw new Error(`The app name '${appName} is not a valid name, it should not start with a number`)
    }
    if (appName in App.instances === false) {
      if (typeof options === 'object') {
        App.canNew = true
        options.appName = appName
        const app = new App(options)
        app.instanceId = INSTANCE_ID++
        App.canNew = false
        App.instances[appName] = app
        addonBindMetods(app as any)
      } else {
        throw new Error('Can not create app instance without options')
      }
    }
    return App.instances[appName]
  }

  constructor(options: AppOptions) {
    if (!App.canNew) {
      throw new Error(
        'Can not directly call new App() to get an app instance, call App.getInstance() instead'
      )
    }
    this.options = Object.freeze(options)
  }

  on<K extends keyof Evts>(event: K, callback: Evts[K]) {
    return this.evt.on(event, callback)
  }

  once<K extends keyof Evts>(event: K, callback: Evts[K]) {
    return this.evt.once(event, callback)
  }

  emit<K extends keyof Evts>(event: K, ...args: Parameters<Evts[K]>) {
    return this.evt.emit(event, ...args)
  }

  off<K extends keyof Evts>(event: K, callback: Evts[K]) {
    return this.evt.off(event, callback)
  }

  setState(...args: Parameters<StateStore['set']>) {
    // eslint-disable-next-line prefer-const
    let [name, value, options] = args
    if (this._stateSchemes[name]) {
      options = {
        ...this._stateSchemes[name]!,
        ...options,
      }
      return this._states.set(name, value, options)
    }
    return this._states.set(...args)
  }

  getState(...args: Parameters<StateStore['get']>) {
    return this._states.get(...args)
  }

  saveState(...args: Parameters<StateStore['save']>) {
    return this._states.save(...args)
  }

  /**
   * Define a hook
   * @param hookName
   * @param params
   * @param callback
   * @returns
   */
  invoke<T>(hookName: string, params: Object, callback: (...a: any[]) => T): T {
    return callback(params)
  }

  setStateSchemes<K extends AppStateName>(
    k: K,
    scheme: {
      cache?: boolean
      default?: AppStates[K]
      persist?: any
    }
  ): App['setStateSchemes'] {
    this._stateSchemes = {
      ...this._stateSchemes,
      [k]: scheme,
    }
    // if ('default' in scheme && !this._states.has(k)) {
    //   this.setState(k, scheme.default)
    // }
    return this.setStateSchemes.bind(this)
  }

  registerAllAddons() {
    this.addons = {} as any
    const addons = this.options.createAddons({ app: this, $: this.addons })
    for (const [addonName, addon] of Object.entries(addons)) {
      this.registerAddon(addonName, addon)
    }
  }

  registerAddon(addonName: string, addon: IAddon) {
    ;(addon as any).addonName = addonName
    addon.app = this
    addon.addonRun = (addon as IAddon).addonRun ?? (() => {})
    ;(this.addons as any)[addonName] = addon

    if ('addonCommands' in addon) {
      const commands = (addon as any).addonCommands() as CommandMaps
      for (const [cmdKey, cmdInfo] of Object.entries(commands)) {
        cmdInfo.id = `${addonName}.${cmdKey}`
        this.commands[cmdInfo.id as string] = cmdInfo
      }
    }

    addonBindMetods(addon as IAddon)
  }

  /**
   * Invoke a command which reponses to the user's action
   *
   * @param cmdInfo
   * @param params
   * @returns
   */
  execCommand(cmdInfo: CommandInfo, params: CommandParams) {
    return cmdInfo.handle(params)
  }

  /**
   * Invoke each addonBeforeRun() method of addons
   * The invocation will be executed before the invocation of addonRun()
   */
  async execAddonBeforeRunAll() {
    // const info = {app: this, before: this.before, after: this.after};
    for (const [addonName, addon] of Object.entries(this.addons)) {
      if ('addonBeforeRun' in addon) {
        await this.execAddonBeforeRun(addon, addonName as LoadedAddonName)
      }
    }
  }

  /**
   * Invoke a addonRun() method of addon
   * @param addon
   * @param addonName This param is not used in this method,
   *                  it is used in other addons while they need to cover this method.
   */
  async execAddonBeforeRun(addon: IAddon, addonName: LoadedAddonName) {
    if ('addonBeforeRun' in addon && this.isAddonEnabled(addonName)) {
      await (addon as any).addonBeforeRun()
    }
  }

  /**
   * Call all 'addonRun()' methods of addons
   *
   * @memberof App
   */
  async execAddonRunAll() {
    for (const [addonName, addon] of Object.entries(this.addons)) {
      await this.execAddonRun(addon as any, addonName as LoadedAddonName)
    }
  }

  execAddonRun(addon: IAddon, addonName: LoadedAddonName) {
    if (
      'addonRun' in addon &&
      typeof addon.addonRun === 'function' &&
      this.isAddonEnabled(addonName)
    ) {
      return addon.addonRun && addon.addonRun()
    }
    return undefined
  }

  /**
   * Check whether an addon is installed
   * @param addon
   */
  isAddonEnabled(addonName: LoadedAddonName): boolean {
    // console.log('kkkk')
    const $ = this.addons
    // if (isEmpty(this.cfg.enabledAddons)) {
    if (typeof this.cfg.addonStatus === 'undefined') {
      let addonItem = $.cacher.get(addonName)
      if (!addonItem) {
        addonItem = $.dbMemory.getItem(addonName)
      }
      if (!isEmpty(addonItem)) {
        if (!isEmpty(addonItem.value)) {
          return addonItem.value !== 'off'
        }
      }
    }

    return $.prefer.isAddonEnabled(addonName)
  }

  getAddonTitle(addonName: string) {
    return (
      (this.addons as any)[addonName]?.addonInfo?.().title ??
      upperCaseFirst(addonName).replace(/([A-Z])/g, ' $1')
    )
  }

  /**
   * Disable an addon
   * @param addon
   */
  disableAddon(addon: IAddon | LoadedAddonName) {
    if (typeof addon === 'string') {
      addon = (this.addons as any)[addon]
    }
    addonDisable(addon as IAddon, 'ALL')
  }

  /**
   * Enable an addon
   */
  enableAddon(addon: IAddon | LoadedAddonName) {
    if (typeof addon === 'string') {
      addon = (this.addons as any)[addon]
    }
    addonDisable(addon as IAddon)
  }

  /**
   * Get ready for the app,
   * Once the app is ready, all addons can hook app's life cycle
   */
  async ready() {
    appmark('App initializing...')

    appmark('Register addons...')
    this.registerAllAddons()

    if (DEBUG_MODE) {
      Object.assign(window, {
        ...this.addons,
        app: this,
        cfg: this.cfg,
      })
    }
    Object.assign(window, {
      [this.options.appName!]: this,
      $: this.addons,
    })
    exposure(this)

    const $ = this.addons

    this._states = new StateStore(this.appName, {}, this._stateSchemes)
    this.states.appStarted = Date.now()

    appmark('Database initializing...')
    await $.libAdmin.ready()

    appmark('Before run...')
    await this.execAddonBeforeRunAll()

    appmark('Memory initializing...')
    await $.dbMemory.ready()
    await $.conf?.load() // 即将废弃

    appmark('Run all addons...')
    await this.execAddonRunAll()

    if (DEBUG_MODE) {
      addonCheckMethods({ app: this } as any)
      addonCheckMethods(this.addons)
    }
  }

  private started = false

  /**
   * Run the app
   *
   * Before running the app, call ready() to register all addons.
   * This allows the addons to hook the app's start() method
   * @param startFunc
   * @returns
   */
  async start(startFunc?: (app: App) => any) {
    if (this.started) {
      // eslint-disable-next-line prettier/prettier
      throw new Error(`The app ${this.options.appName} has been started, if you want to restart it, please call restart() instead`)
    }
    this.started = true
    if (startFunc) {
      startFunc(this)
    }
  }

  isStarted() {
    return this.started
  }

  destroy() {
    this.started = false
    // this.addons?.ui?.destroy();
    this.addons = {} as any
    delete App.instances[this.appName]
  }

  async restart() {
    await this.destroy()
    await this.ready()
    await this.start()
  }
}

Object.assign(window, {
  $App: App,
})
