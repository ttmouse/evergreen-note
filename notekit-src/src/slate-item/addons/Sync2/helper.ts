import { getPubState, setPubState } from '../../hooks/usePubState'
import { Item } from '../../interfaces/item'
import { KyString } from '../../interfaces/unit'
import { isEmpty } from '../../utils/isEmpty'
import { ItemMap } from '../DbMemory/DbMemory'
import { statusIcon } from './SyncIcon'

const PUB_KEY_SYNC = 'sync-status';

export function priKey(item: UnitPersist): KyString {
  if ('prky' in item) {
    return item.prky as KyString
  }
  return item.ky
}

export function list2map(list: UnitPersist[], keyName = 'ky') {
  const map: ItemMap = {}
  if (Array.isArray(list)) {
    for (const item of list) {
      map[(item as any)[keyName]] = item
    }
  }
  return map
}

/**
 * Find out items in map2 that should be merged into map1
 * @param list1
 * @param list2
 */
export function compareItems(map1: ItemMap, map2: ItemMap): ItemMap {
  const result: ItemMap = {}
  for (const [k, item2] of Object.entries(map2)) {
    if (isEmpty(item2) || isEmpty(k)) {
      continue
    }
    const item1 = map1[k]
    if (
      // (item1 && !item1.uploaded) ||
      (item2 && !Item.isNormalStatus(item2) && k in map1 === false)
    ) {
      continue
    }
    if (
      isEmpty(item1) ||
      isEmpty(item1.updated) ||
      (item1.updated ?? -1) < (item2.updated ?? -1)
    ) {
      result[k] = item2
    }
  }
  return result
}

export function diffItems(
  list1: UnitPersist[],
  list2: UnitPersist[],
  keyName = 'ky'
) {
  const map1 = list2map(list1, keyName)
  const map2 = list2map(list2, keyName)
  const toMap1 = compareItems(map1, map2)
  const toMap2 = compareItems(map2, map1)

  return {
    toMap1,
    toMap2,
    map1,
    map2,
  }
}

export function setSyncStatus(status: keyof typeof statusIcon) {
  setPubState(PUB_KEY_SYNC, status)
}

export function getSyncStatus() {
  return getPubState(PUB_KEY_SYNC, 'done');
}