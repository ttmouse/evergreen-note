/* eslint-disable @typescript-eslint/no-use-before-define */

import isHotkey, { HotKeyOptions, KeyboardEventLike } from 'is-hotkey'

/**
 * 从用户的按键事件中探测用户按了什么快捷键组合
 * @param Event evt
 * @returns string
 */
export function getUserKeys(evt: KeyboardEvent): string {
  const keys: string[] = []
  if (evt.ctrlKey && evt.key !== 'Control') {
    keys.push('mod')
  }
  if (evt.shiftKey && evt.key !== 'Shift') {
    keys.push('shift')
  }
  if (evt.altKey && evt.key !== 'Alt') {
    keys.push('alt')
  }
  if (evt.metaKey && evt.key !== 'Meta') {
    keys.push('mod') // Command按键
  }
  // keys.push(evt.key.toLowerCase());
  const sorted = sortKeys(keys)
  sorted.push(evt.key.toLowerCase())
  return sorted.join('+').replace('arrow', '')
}

export function niceKey(hk1: string) {
  return sortKeys(hk1.split('+'))
    .join('+')
    .replace(/cmd|ctrl/gi, 'mod')
    .replace(/arrow/gi, '')
    .toLowerCase()
}

export function checkHotkey(e: KeyboardEvent, hk: string) {
  return getUserKeys(e) === niceKey(hk)
}

/**
 * 对按键组合进行排序
 * @param array|string keys
 * @returns string 排序后的快捷键字符串
 */
export function sortKeys(keys: string | string[]) {
  if (typeof keys === 'string') {
    keys = keys.split('+')
  }
  const myOrder = (k: string) => {
    const num = { shift: 1, ctrl: 2, cmd: 3, alt: 4 }
    k = k.toLowerCase()
    if (k in num === false) {
      return 1000
    }
    return (num as any)[k]
  }

  keys.sort((a, b) => {
    return myOrder(a) - myOrder(b)
  })

  return keys
}

/**
 * 将一些按键组合成应用所需要的快捷键表示格式
 * @param array|string keys
 * @returns string
 */
export function compositeKeys(keys: string | string[]) {
  if (typeof keys === 'string') {
    keys = keys.replace(/cmd|command/i, 'CTRL').split('+')
  }
  sortKeys(keys)
  return keys.join('+').toLowerCase()
}

/**
 * 将给定的原始快捷键字符串转换成 Mac 符号格式的字符串
 * @param string keys
 * @returns string
 */
export function key2symbol(keys: string | string[]) {
  if (Array.isArray(keys)) {
    keys = keys.join(' ')
  }
  // check is current OS is MacOs
  if (navigator.platform.toUpperCase().includes('MAC')) {
    keys = keys.replace(/mod|ctrl/i, 'cmd')
    // const map = {
    //   cmd: '⌘',
    //   shift: '⇧',
    //   delete: '⌫',
    //   backspace: '⌫',
    //   enter: '↵',
    //   alt: '⌥',
    //   ctrl: '⌃',
    //   up: '↑',
    //   down: '↓',
    //   left: '←',
    //   right: '→',
    //   tag: '⇥',
    //   esc: '⎋',
    // };
    // for (const [k, v] of Object.entries(map)) {
    //   keys = keys.toLowerCase().replace(k, v);
    // }
    // keys = keys.replace(/\+/g, '');
    return keys.toLowerCase()
  }
  keys = keys.replace(/mod|cmd/i, 'ctrl')
  return keys
}

/**
 * 把快捷键格式化成适合展示在悬浮提示里的形态：
 * Mac 上 "mod+shift+p" -> "⌘⇧P"，其它平台 -> "Ctrl+Shift+P"
 */
export function formatHotkey(keys: string | string[]) {
  const list = (Array.isArray(keys) ? keys.join('+') : keys)
    .toLowerCase()
    .split('+')
    .filter(Boolean)
  const isMac = navigator.platform.toUpperCase().includes('MAC')
  const symbol = (k: string) => {
    const map: Record<string, string> = isMac
      ? { cmd: '⌘', mod: '⌘', ctrl: '⌃', shift: '⇧', alt: '⌥', enter: '↵', esc: '⎋' }
      : { mod: 'Ctrl', cmd: 'Ctrl', ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', enter: 'Enter', esc: 'Esc' }
    return map[k] ?? (k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1))
  }
  return list.map(symbol).join(isMac ? '' : '+')
}

export function createDblKeyDetector(e: KeyboardEvent) {
  let pressKey = ''
  let pressTime = 0

  return () => {
    if (e.key === pressKey && Date.now() - pressTime < 100) {
      pressTime = Date.now()
      return getUserKeys(e)
    }
    pressKey = e.key
    pressTime = Date.now()
    return false
  }
}

const detects: { [k: string]: number } = {}
// Support double-pressing hotkey
export function isMyHotkey(
  hk: string | readonly string[],
  options: HotKeyOptions,
  event: KeyboardEventLike
): boolean {
  if (typeof hk === 'string' && /[a-z]+\^2/.test(hk)) {
    const [, key] = /([a-z]+)\^2/.exec(hk)!
    if (key in detects === false) {
      detects[key] = 0
    }
    const userKey = getUserKeys(event as any)
    if (userKey === key) {
      const last = detects[key]
      detects[key] = Date.now()
      return Date.now() - last < 300
    }

    return false
  }
  return isHotkey(hk, options, event)
}
