const u = navigator.userAgent;

let isLegacySafari = false;
try {
  // 由于 Safari 不支持正则表达式的 look behind, 所以据此判断是否为 Safari
  new RegExp('(?<!a)b');
} catch (e) {
  isLegacySafari = true;
}

const versions = {
  trident: u.indexOf('Trident') > -1, // IE内核
  presto: u.indexOf('Presto') > -1, // opera内核
  webKit: u.match(/AppleWebKit/i), // 苹果、谷歌内核
  gecko: u.indexOf('Gecko') > -1 && u.indexOf('KHTML') === -1, // 火狐内核
  mobile: !!u.match(/AppleWebKit.*Mobile.*/i), // 是否为移动终端
  ios: !!u.match(/\(i[^;]+;( U;)? CPU.+Mac OS X/), // ios终端
  android: !!u.match(/Android|Linux/i), // android终端或者uc浏览器
  iPhone: /iPhone/i.test(u), // 是否为iPhone或者QQHD浏览器
  iPad: /iPad/i.test(u), // 是否iPad
  webApp: /Safari/i.test(u), // 是否web应该程序，没有头部与底部
  weixin: /MicroMessenger/i.test(u), // 是否微信 （2015-01-22新增）
  qq: /\sQQ/i.test(u),
  mac: /Mac OS/i.test(u),
  chrome: /chrome/i.test(u),
  legacySafari: isLegacySafari,
  windows: /Windows/i.test(u),
  harmony: /OpenHarmony/i.test(u)
};

const queryParams = new URLSearchParams(window.location.search);
const forcePC = queryParams.get('forcePC');

export const browser = {
  ...versions,
  language: navigator.language.toLowerCase(),
  isMobile: (!forcePC) && ('ontouchstart' in window && (versions.mobile || versions.android || versions.ios || versions.mac)),
  isAppleMobile: (versions.ios || versions.mac) && (!versions.harmony) && ('ontouchstart' in window),
  isMacSafari: (versions.mac && (!versions.chrome && !versions.gecko)),
};
