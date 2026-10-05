import { UnitVersions } from '../../interfaces/unit';
import { LangInfo, langMaps } from './langMaps';

export function arr2vers(arr: string[] | unknown): UnitVersions {
  if (!Array.isArray(arr)) {
    return {};
  }
  const vers: UnitVersions = {} as any;
  for (const val of arr) {
    vers[val] = { v: val };
  }
  return vers;
}

export const langUnits: { [k: string]: LangInfo & any } = {} as any;
for (const [, lang] of Object.entries(langMaps)) {
  langUnits[lang.langName] = {
    ...lang,
    title: lang.langName,
    versions: {
      ...arr2vers(lang.ext),
      ...arr2vers(lang.alias),
      mode: { v: lang.mode },
    },
  };
}
