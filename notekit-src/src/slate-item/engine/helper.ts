/* eslint-disable no-caller */
/* eslint-disable @typescript-eslint/no-use-before-define */
import { pub } from '../utils/pub'
import { IAddon } from './App'

const ignore = [
  'constructor',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toString',
  'valueOf',
  'toLocaleString',
]

/**
 * Get all the methods of an object
 *
 * @static
 * @param {*} obj
 * @return {*}  {string[]}
 */
export function getMethods(obj: any): string[] {
  const methods = new Set()
  const add = (...lists: any[]) => {
    for (const list of lists) {
      list.forEach((m: string) => {
        if (
          !m.startsWith('_') &&
          !ignore.includes(m) &&
          typeof obj[m] === 'function'
        ) {
          methods.add(m)
        }
      })
    }
  }

  if (typeof obj === 'object') {
    if (obj.constructor.name !== 'Object') {
      add(Object.getOwnPropertyNames(Object.getPrototypeOf(obj)))
      if (Object.getPrototypeOf(obj).constructor.name !== 'Object') {
        add(getMethods(Object.getPrototypeOf(obj)))
      }
    } else {
      add(Object.keys(obj))
    }
  }

  return [...methods] as string[]
}

type Func = (...args: any) => any

type ModifierInfo = {
  addonName?: string // keyof LoadedAddons
  addon?: IAddon
}

interface ModifiedFunc extends Function {
  (): void
  addon: IAddon
  fnName: string
  original: Func
  addonName: string // keyof LoadedAddons
  modifier: ModifierInfo
  allModifiers: ModifierInfo[]
}

/**
 * overwrite an existing function
 *
 * @param originalFunction
 * @param newFunction
 * @returns
 */
export function cover<F extends (...args: any) => unknown>(
  originalFunction: F,
  newFunction: (...args: Parameters<F>) => ReturnType<F>
) {
  if (typeof originalFunction !== 'function') {
    return
  }

  const { addon } = originalFunction as any
  if (typeof addon !== 'object') {
    throw new Error(`Only addon's methods can be overrided`)
  }

  const fnName = (originalFunction as any).fnName ?? originalFunction.name
  Object.assign(newFunction, {
    addon,
    fnName,
    // addonName: lowerCaseFirst(addon.constructor.name),
    original: originalFunction,
    displayName: `cover ${addon.addonName}.${fnName}`,
  })

  addonMethodBindBefore(newFunction)
  addonMethodBindAfter(newFunction)
  addonMethodBindCover(newFunction)
  addon[fnName] = newFunction
}

// type ArgumentTypes<F extends Function> = F extends (...args: infer A) => any ? A : never;

/**
 * Insert a new function after an existing function
 * @param fn
 * @param newFunction
 */
export function after<F extends (...args: any) => unknown>(
  fn: F,
  newFunction: (
    result: ReturnType<F>,
    ...args: Parameters<F>
  ) => ReturnType<F> | void
) {
  cover(fn, (...args: any) => {
    const { addon } = fn as unknown as ModifiedFunc
    const originalResult = fn.apply(addon, args) as any
    const afterResult = newFunction.call(addon, originalResult, ...args)
    return typeof afterResult === 'undefined' ? originalResult : afterResult
  })
}

/**
 * get the original function
 * @param fn
 * @returns
 */
export function original<F extends Function>(fn: F): F {
  const orig = (fn as any).original
  if (orig) {
    return original(orig)
  }
  return fn.bind((fn as any).addon)
}

export type BeforeResult = {
  ARGS?: any[]
  SKIP?: any
}

/**
 * Insert a new function before an existing function
 * @param fn
 * @param newFunction
 */
export function before<F extends (...args: any) => unknown>(
  fn: F,
  newFunction: (...args: Parameters<F>) => ReturnType<F> | void
) {
  const fn2 = ((...args: any) => {
    const { addon } = fn as any
    const prevResult: BeforeResult = newFunction.call(addon, ...args) as any
    if (prevResult) {
      if (prevResult.ARGS) {
        args = prevResult.ARGS
      } else if (prevResult.SKIP) {
        return prevResult.SKIP
      }
    }
    return fn.apply(addon, args)
  }) as any
  cover(fn, fn2)
}

export function invoke<F extends (...argus: any) => unknown>(
  invokerName: string,
  fn: F,
  ...args: Parameters<F>
) {
  const result = fn.call((fn as any).addon, ...(args as any))
  pub.emit(pub.evt.addonInvoke, {
    invoker: invokerName,
    // addon: lowerCaseFirst(fn.addon.constructor.name),
    addon: (fn as any).addon.addonName,
    method: (fn as any).fnName,
    args,
  })
  return result
}

/**
 * Overwrite all of the methods of an addon
 * @param addon
 * @param newFunction
 */
export function addonCoverAll(addon: IAddon, newFunction: Func) {
  const methods = getMethods(addon)
  for (const method of methods) {
    const { [method]: fn } = addon as any
    if (typeof fn === 'function') {
      cover(fn, (...args: any) => {
        return newFunction(fn, ...args)
      })
    }
  }
}

/**
 * * Disable or enable an addon
 * @param addon
 * @param disabledMethods Specify the methods of the addon to be disabled
 */
export function addonDisable(addon: IAddon, ...disabledMethods: string[]) {
  if (!Array.isArray(addon.addonDisabled)) {
    addonCoverAll(addon, (method, ...args) => {
      if (
        addon.addonDisabled?.includes(method.fnName) ||
        addon.addonDisabled?.includes('ALL')
      ) {
        return
      }
      return method.call(addon, ...args)
    })
  }
  addon.addonDisabled = disabledMethods ?? []
}

/**
 * Check whether an addon is installed
 * @param addon
 */
export function isAddonEnabled(addon: IAddon | undefined): addon is IAddon {
  return !!addon && !addon.addonDisabled?.includes('ALL')
}

/**
 * Assign some props to an addon's methods
 * @param addon
 * @returns
 */
export function addonBindMetods(addon: IAddon) {
  for (const methodName of getMethods(addon)) {
    ;(addon as any)[methodName].fnName = methodName
    ;(addon as any)[methodName].addon = addon
    addonMethodBindBefore((addon as any)[methodName])
    addonMethodBindAfter((addon as any)[methodName])
    addonMethodBindCover((addon as any)[methodName])
  }
  return addon
}

export function addonMethodBindAfter<F extends Function>(method: F) {
  ;(method as any).after = (fn: Func) => {
    const fn2 = (...args: any) => {
      return fn(...args)
    }
    after(method as any, fn2 as any)
  }
}

export function addonMethodBindBefore<F extends Function>(method: F) {
  ;(method as any).before = (fn: Func) => {
    const fn2 = (...args: any) => {
      return fn(...args)
    }
    before(method as any, fn2 as any)
  }
}

export function addonMethodBindCover<F extends Function>(method: F) {
  ;(method as any).cover = (fn: Func) => {
    cover(method as any, fn(method))
  }
}

/**
 * Check the addon object
 * make sure it was overwritten only by cover()
 */
export function addonCheckMethods(addons: { [addonName: string]: IAddon }) {
  for (const [addonName, addon] of Object.entries(addons)) {
    for (const methodName of getMethods(addon)) {
      if (
        typeof (addon as any)[methodName].addon !== 'object' ||
        typeof (addon as any)[methodName].fnName !== 'string'
      ) {
        throw new Error(
          `The method ${addonName}.${methodName}() is not a valid addon method,
  It has lost its information about addon and method name.
  It may be directly overrided like ${addonName}.${methodName} = () => {...},
  You should overwrite it like cover(this.app.addons.${addonName}.${methodName}, () => {...}).
  Or if you've applied Mobx makeAutoObservable() to ${addonName},
  make sure to put makeAutoObservable() inside ${addonName}.constructor()!'
          `
        )
      }
    }
  }
}
