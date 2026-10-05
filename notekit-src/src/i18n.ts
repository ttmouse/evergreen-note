/* eslint-disable import/extensions */
import i18n from 'i18next'
import enLang from './locales/en.json'
import zhLang from './locales/zh.json'
import { isEmpty } from './slate-item/utils/isEmpty'
import { pub } from './slate-item/utils/pub'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { showSnack } from './slate-item/utils/msg/showSnack'

const maps = {
  en: enLang,
  zh: zhLang,
}

export function i18nInit(lng = 'zh') {
  i18n.init({
    resources: {
      en: {
        translation: enLang,
      },
      zh: {
        translation: zhLang,
      },
    },
    lng,
    fallbackLng: 'en',

    interpolation: {
      escapeValue: false, // react already safes from xss => https://www.i18next.com/translation-function/interpolation#unescape
    },
  })
}

export const lngStorageKey = 'LOCAL_LANGUAGE'

export function i18nCacheLanguage(lng: string) {
  localStorage.setItem(lngStorageKey, lng)
}

function getBrowserLanguage() {
  if (!('language' in navigator)) return 'en'; 
  const lang = navigator.language.split('-')[0];
  if(lang in ['zh', 'en']) return lang;
  return 'en';
}

let activeLng = localStorage.getItem(lngStorageKey) ?? getBrowserLanguage();

pub.on(pub.evt.cfgLoaded, ({ cfg }) => {
  if (!isEmpty(cfg.uiLang) && cfg.uiLang !== activeLng) {
    i18nCacheLanguage(cfg.uiLang!)
    showSnack({
      content: "You need to refresh the page to apply the language change.",
      severity: 'warning',
      autoClose: 3000,
      clickAway: true,
    })
  } else {
    i18nCacheLanguage(activeLng!)
    i18nInit(activeLng!)
  }
})

i18nInit(activeLng)

if (activeLng === 'zh') {
  dayjs.locale('zh-cn')
}

// pub.on(pub.evt.cfgLoaded, ({ cfg }) => {
//   let lng = localStorage.getItem(lngStorageKey) ?? 'zh';
//   if (!isEmpty(cfg.uiLang)) {
//     lng = cfg.uiLang;
//   }
//   i18nCacheLanguage(lng);
//   i18nInit(lng);
//   if (lng === 'zh') {
//     dayjs.locale('zh-cn');
//   }
// });

export const $t: any = (...args: Parameters<typeof i18n.t>) =>
  i18n.t(...args).replace(/,$/g, '')
