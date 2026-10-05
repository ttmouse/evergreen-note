export type ClientUserInfo = {
  body_html: string
  token: string
  id: string
  username: string
  nickname: string
  vip_unlimited: string
  vip_normal: string
  vip_pro: string
  mobile: string
  email: string
  avatar: string
}

export const APP_VERSION = '26w15b'
export const DEFAULT_APP_NAME = 'EvergreenNote'
export const TRANSFER_BATCH_SIZE = 300
export const PUBKEY_DBID = 'pub-dbid'
export const PUBKEY_RESTART = 'pub-restart'
export const IS_CLIENT = window.location.pathname.startsWith('/reapp/')
//export const DEBUG_MODE = !IS_CLIENT && window.location.hostname === 'localhost'
export const DEBUG_MODE = window.location.hostname === 'localhost' && window.location.port === '3000';
let userInfo
let userId
userId = Number((window as any).USER_ID ?? 0)
export const MEMBER_ID = userId
