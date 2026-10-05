import { DEBUG_MODE } from '../../../main'
import { MEMBER_ID } from '../../constants'
import { isEmpty } from '../../utils/isEmpty'
import { nanoid } from '../../utils/string/mkid'
import { getUrlParams } from '../../utils/string/url'

export function isPublic() {
  return location.pathname.startsWith('/share');
}

export function makeDbid(uid: number, key = nanoid(5)) {
  return `db-${uid.toString(32)}-${key}`
}

export function getDefaultDbid(uid: number) {
  return makeDbid(uid, 'v2main')
}

export function getCurrentDbid(uid: number) {
  const defaultDBID = getDefaultDbid(uid)
  const params = getUrlParams()
  let { db } = params

  /*
  &u=324-dab3df
  其中 324 是 user id， dab3df 是 db id
   */
  if ('lib' in params) {
    const [, ...arr] = params.lib.split('-')
    db = arr.join('-')
  }

  let dbid =
    db ?? // 浏览器地址栏传入数据库ID
    localStorage.lastDatabase ?? // 上一次打开过的数据库
    (DEBUG_MODE ? 'nk16135' : defaultDBID) // 默认数据库

  if (dbid === 'default') {
    // 浏览器地址栏传入 db=default 打开默认数据库
    dbid = DEBUG_MODE ? 'nk16135' : defaultDBID
  }

  // docs 是系统的公开库，不作保存
  if (!isPublic()) {
    localStorage.lastDatabase = dbid
  } else if (isEmpty(db)) {
    dbid = defaultDBID
  }
  return dbid
}

export function composeId(dbid: string, uid?: number) {
  uid ??= MEMBER_ID
  return `${uid!.toString(32)}-${dbid}`
}
