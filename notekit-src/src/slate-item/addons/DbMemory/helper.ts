import { deepClone } from '../../utils/object/deepClone'
import { omit } from '../../utils/object/omit'

export function normalizeItem(item: UnitPersist): UnitPersist {
  return omit(deepClone(item), (k: string, v: any) => {
    return (
      k.startsWith('$') ||
      ['type', 'id', 'subitems', 'selected', 'children'].includes(k) ||
      (k === 'foldup' && v === false) ||
      typeof v === 'function' ||
      v === null ||
      (Array.isArray(v) && v.length === 0)
    )
  }) as UnitPersist
}
