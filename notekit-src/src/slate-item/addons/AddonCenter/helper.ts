import { useAddons } from '../../hooks/useAddons';
import { UnitProps } from '../../interfaces/unit';
import { isEmpty, notEmpty } from '../../utils/isEmpty';
import { upperCaseFirst } from '../../utils/string';

export function addonKy(addonName: string) {
  return /Addon[A-Z].+/.test(addonName)
    ? addonName
    : `Addon${upperCaseFirst(addonName)}`;
}

export function isItemAddon(item: UnitPersist): boolean {
  return notEmpty<Object>(item.meta) && 'addonEnabled' in item.meta;
}

export function useAddonList() {
  const addons = useAddons();
  const list = Object.entries(addons)
    .map(([addonName, addon]) => {
      const info = (addon as any).addonInfo?.();
      if (isEmpty(info) || info.isCore) {
        return null;
      }
      info.addonName = addonName;
      info.title ??= upperCaseFirst(addonName).replace(/([A-Z])/g, ' $1');
      return info as UnitProps;
    })
    .filter((item) => !!item);
  return list;
}
