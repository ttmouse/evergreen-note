import { KyString, UnitProps } from '../interfaces/unit'

export type RecurItem = {
  ky: KyString
  pky: KyString
  subitems?: Partial<RecurItem>[]
  body?: Partial<RecurItem>[]
}

type RecurCallback<T> = (item: T, pky?: string) => boolean | void

export function recur<T extends RecurItem>(
  item: T | T[],
  callback: RecurCallback<T>,
  pky = ''
) {
  if (Array.isArray(item)) {
    for (const subItem of item) {
      const result = recur(subItem, callback, pky)
      if (result === false) {
        return false
      }
    }
  } else if (typeof item === 'object') {
    const result = callback(item, pky)
    if (result === false) {
      return false
    }
    const subitems = item.body ?? item.subitems
    if (Array.isArray(subitems)) {
      for (const subItem of subitems) {
        const r = recur(subItem as T, callback, (subItem as T).ky)
        if (r === false) {
          return false
        }
      }
    }
  }
}
