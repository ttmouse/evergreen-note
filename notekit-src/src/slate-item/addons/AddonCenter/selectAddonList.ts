import type { AddonInfo } from './AddonCenterComp'

export type AddonFilter = 'all' | 'enabled' | 'disabled' | 'updated'

export function selectAddonList(
  body: AddonInfo[], keyword: string, filter: AddonFilter,
  isEnabled: (name: string) => boolean,
): AddonInfo[] {
  const query = keyword.trim().toLocaleLowerCase()
  const list = body.filter(info => {
    if (info.hidden && query !== info.title.toLocaleLowerCase()) return false
    if (filter === 'enabled' && !isEnabled(info.addonName)) return false
    if (filter === 'disabled' && isEnabled(info.addonName)) return false
    return !query || [info.title, info.quote, info.addonName].some(text =>
      text?.toLocaleLowerCase().includes(query))
  })
  return filter === 'updated' ? list.sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0)) : list
}
