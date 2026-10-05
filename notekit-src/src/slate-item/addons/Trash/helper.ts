/* eslint-disable @typescript-eslint/no-use-before-define */
import { arrayMoveItem } from '../../utils/array/arrayMoveItem'

function findMyGroup(item: UnitPersist, items: UnitPersist[]) {
  const arr: UnitPersist[] = []
  for (const [i, one] of items.entries()) {
    if (Math.abs(one.updated - item.updated) < 1000 * 10) {
      arrayMoveItem(items, arr, i)
    } else {
      break
    }
  }
  return arr
}

export function groupItemsByUpdated(items: UnitPersist[]) {
  const groups: { [k: string]: UnitPersist[] } = {}
  do {
    const item = items.pop()
    if (!item) break
    const group = findMyGroup(item, items)
    groups[String(item.updated)] = group
  } while (items.length > 0)
  return groups
}

export function buildTree(items: UnitPersist[]): UnitPersist[] {
  const itemMap: { [key: string]: UnitPersist } = {}

  // Create a mapping of items using their ky as the key
  items.forEach((item) => {
    item.subitems ??= [] as UnitPersist[]
    itemMap[item.ky] = item
  })

  const rootItems: UnitPersist[] = []

  // Traverse the items and add them as children to their parent items
  items.forEach((item) => {
    const parentItem = itemMap[item.pky]
    const subitems = Object.values(parentItem?.subitems ?? {}) as UnitPersist[]
    if (parentItem) {
      if (!subitems.some((one: UnitPersist) => one.ky === item.ky)) {
        subitems?.push(item)
        subitems?.sort((a: any, b: any) => (a.weight ?? 0) - (b.weight ?? 0))
      }
    } else {
      // If an item does not have a parent, consider it as a root item
      rootItems.push(item)
    }
  })

  return rootItems.sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0))
}
