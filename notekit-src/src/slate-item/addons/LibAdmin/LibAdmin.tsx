import React from 'react'
import { $t } from '../../../i18n'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { KyString, UNIT_ROLE, UNIT_STATUS } from '../../interfaces/unit'
import { isEmpty } from '../../utils/isEmpty'
import { DialogProps } from '../../utils/msg/showDialog'
import { showSnack } from '../../utils/msg/showSnack'
import { pick } from '../../utils/object/pick'
import { nanoid } from '../../utils/string/mkid'
import { newLibrary } from '../DbAdmin/helper'
import {
  composeId,
  getCurrentDbid,
  getDefaultDbid,
  makeDbid,
} from '../DbDisk/helper'
import { NoteDatabase } from '../DbDisk/NoteDatabase'
import { normalizeItem } from '../DbMemory/helper'
import { exportDatabaseHanlders } from './helper'
import { LibListComp } from './LibListComp'
import { ItemStore } from './ItemStore'
import { LibTitleComp } from './LibTitleComp'
import { datekit } from '../../utils/date/datekit'
import { PreferName, PreferPersist } from '../Prefer/Prefer'
import { LoadedAddonName } from '../../../main'
import { getUrlParams } from '../../utils/string/url'
import { ROUTE_KEY } from '../Router/Router'

export type LibraryPersist = UnitPersist & {
  role: UNIT_ROLE.LIBRARY
  referLibrary?: KyString[] // 某个知识库所引入的其他知识库的 ky
  referConfig?: KyString // 知识库所引用的偏好设置
}

export type ExportDatabaseFormat = keyof typeof exportDatabaseHanlders

declare global {
  interface Cfg {
    lang: string
  }
}

/**
 * 知识库管理
 * @param param0
 * @returns
 */
export function createLibAdminAddon({ app, $ }: NewAddonParams) {
  const HOME_DBID = `HOME-${app.user.id.toString(32)}`

  class LibAdmin implements IAddon {
    app!: App
    config = {}
    conn!: NoteDatabase
    current!: LibraryPersist
    store!: ItemStore<LibraryPersist>
    listDialogId = 'libadmin-list-dialog'
    HOME_DBID = HOME_DBID

    /**
     * 本插件的初始化
     * @returns
     */
    async ready() {
      await $.dbDisk.ready
      const openDbid = getCurrentDbid(app.user.id)

      if (openDbid === HOME_DBID) {
        window.location.href = `?db=default&v=${app.options.version}`
        return
      }

      await $.sync2.getServerData()
      await $.libAdmin.importConf() // 临时兼容
      $.libAdmin.conn = await $.dbDisk.open(HOME_DBID)
      $.libAdmin.store = new ItemStore({ conn: $.libAdmin.conn, app })
      await $.libAdmin.mergeLibList()
      const preferItems = await $.libAdmin.loadPersistPreferItems()
      await $.preferGlobal.ready(preferItems)
      const openId = await $.libAdmin.getOpenId()
      await $.libAdmin.open(openId)
      await $.prefer.ready(preferItems)
    }

    /**
     * 合并本地与云端的数据库列表信息
     * @returns
     */
    async mergeLibList() {
      const dbid = $.libAdmin.HOME_DBID
      const localLibList = await $.libAdmin.conn.node.toArray()
      const serverLibList =
        ($.sync2.serverData[`${dbid}-node`] as PreferPersist[]) || []
      const service = $.sync2.getService(dbid, 'node')
      const mergedList = await service.merge(
        localLibList,
        serverLibList,
        async (toLocal, toServer) => {
          if (navigator.onLine)
            Object.values(toServer).forEach((lib) => {
              service.addPending(lib)
            })
          for (const lib of Object.values(toLocal)) {
            await $.dbDisk.save(lib, dbid, service.tbName)
          }
        }
      )
      return mergedList
    }

    async loadPersistPreferItems(): Promise<PreferPersist[]> {
      const localPreferItems = await $.libAdmin.conn.prefer.toArray()
      const dbid = $.libAdmin.HOME_DBID
      const serverPreferList =
        ($.sync2.serverData[`${dbid}-prefer`] as PreferPersist[]) || []
      const service = $.sync2.getService(dbid, 'prefer')
      const mergedList = await service.merge(
        localPreferItems,
        serverPreferList,
        async (toLocal, toServer) => {
          if (navigator.onLine)
            Object.values(toServer).forEach((item) => {
              service.addPending(item)
            })
          for (const item of Object.values(toLocal)) {
            // console.log('import config item', item);
            await $.dbDisk.save(item, dbid, service.tbName)
          }
        },
        'prky'
      )
      return mergedList
    }

    async showLoginForm() {
      $.form.popup({
        title: '登录',
        subitems: {
          username: {
            type: 'text',
            title: '用户名',
          },
          password: {
            type: 'password' as any,
            title: '密码',
          },
        },
        buttons: {
          登录: (async (values: any) => {
            const response = await fetch(`http://localhost:3131/auth/login`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                // Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify(values),
            })

            if (!response.ok) {
              showSnack({
                content: '登录信息错误',
                severity: 'error',
              })
            } else {
              showSnack({
                content: '登录成功',
                severity: 'success',
              })
              const result = (await response.json()) as { access_token: string }
              const dirtyToken = result.access_token.replace(/./g, (c) => {
                // 大写的变小写
                if (c >= 'A' && c <= 'Z') {
                  return c.toLowerCase()
                }
                // 小写的变大写
                if (c >= 'a' && c <= 'z') {
                  return c.toUpperCase()
                }
                return c
              })
              localStorage.setItem('access_token', dirtyToken)
              console.log(dirtyToken)
            }
          }) as any,
          取消: null,
        },
      })
    }

    async open(libId: string) {
      await $.dbDisk.openAll([libId])
      // eslint-disable-next-line prettier/prettier
      await $.libAdmin.setCurrentLibInfo(libId)
    }

    async setCurrentLibInfo(libId: string) {
      let lib = (await $.libAdmin.conn.node.get(libId)) as LibraryPersist
      if (!lib) {
        lib = newLibrary({
          ky: libId,
          ori: libId,
          by: app.user.id,
        })
        if (!(await $.libAdmin.save(lib))) {
          throw new Error(`Failed to save library`)
        }
      }
      $.libAdmin.current = lib as LibraryPersist
    }

    async getOpenId(): Promise<string> {
      const params = getUrlParams()
      // eslint-disable-next-line prefer-const
      let { db, lib } = params

      if (db === 'default') {
        // eslint-disable-next-line prettier/prettier
        db = $.preferGlobal.getValue('globalDefaultLibrary') ?? getDefaultDbid(app.user.id)
      }

      if (!isEmpty(db)) {
        return db
      }

      /*
      &u=324-dab3df
      其中 324 是 user id， dab3df 是 db id
      */
      if (!isEmpty(lib)) {
        const [, ...arr] = lib.split('-')
        return arr.join('-')
      }

      const globalDefault = $.preferGlobal.getValue('globalDefaultLibrary')
      if (!isEmpty(globalDefault)) {
        return globalDefault as string
      }

      const list = await $.libAdmin.store?.getList()
      return list?.[0]?.ky ?? getDefaultDbid(app.user.id)
    }

    async importConf() {
      if(ROUTE_KEY === 'share') return
      const isExist = await NoteDatabase.exists(HOME_DBID)
      if (!isExist) {
        setTimeout(async () => {
          const promises: Promise<any>[] = []
          for (const [k, v] of Object.entries($.conf.flatAll)) {
            promises.push($.prefer.setValue(k as PreferName, v as any))
          }

          if ($.cacher.data) {
            const enabledAddons: LoadedAddonName[] = []
            for (const [k, item] of Object.entries($.cacher.data)) {
              if (k in $ && item.value !== 'off') {
                enabledAddons.push(k as LoadedAddonName)
              }
            }
            promises.push($.prefer.setValue('enabledAddons', enabledAddons))
          }
          await Promise.all(promises)
          showSnack({content:$t`Some of your preferences may not be applied until you restart the app.`, severity:'info', clickAway: true, autoClose: 3000})
        }, 1000)
      }
    }

    async showList() {
      $.dialog.show({
        dialogId: $.libAdmin.listDialogId,
        title: $t`libAdmin.list`,
        maxWidth: 'sm',
        width: 300,
        body: <LibListComp />,
        SnapProps: {
          place: ['left-in', 'top-out'],
          targetBox: document.getElementById(
            `${app.appName}-nav`
          )?.querySelector('.nk-nav-footer') as HTMLElement,
        },
        buttons: {
          [$t`common.add`]: () => {
            this.showCreateForm()
          },
          [$t`common.close`]: null,
        },
      })
    }

    closeList() {
      $.dialog.remove($.libAdmin.listDialogId)
    }

    getFieldset(params: { ky?: KyString }) {
      const { ky } = params
      return {
        ky: {
          type: 'text',
          readonly: true,
          title: $t`libAdmin.library_id`,
          when: () => isEmpty(ky),
        },
        ori: {
          type: 'text',
          title: $t`libAdmin.library_title`,
        },
        quote: {
          type: 'text',
          multiple: true,
          rows: 2,
          title: $t`libAdmin.library_quote`,
        },
      }
    }

    async showForm(
      params: { ky?: KyString } & Pick<DialogProps<any>, 'buttons'> = {} as any
    ) {
      const { ky, ...rest } = params
      let initVals: any = {}
      if (ky) {
        initVals = await $.libAdmin.store.get(ky)
      }

      return $.form.popup({
        title: $t`libAdmin.form_title`,
        DialogProps: {
          maxWidth: 'xl',
        },
        initialValues: {
          ky: ky ?? makeDbid(app.user.id, nanoid(5)),
          ori: '',
          quote: '',
          // conf: 'new',
          // confSelected: '',
          ...initVals,
        },
        subitems: $.libAdmin.getFieldset({ ky }) as any,
        ...rest,
      })
    }

    async showUpdateForm(params: { ky: KyString }) {
      const { ky } = params
      if (ky === HOME_DBID) {
        showSnack({
          content: 'Can not modify HOME database',
          severity: 'error',
        })
        return
      }
      return this.showForm({
        ...params,
        buttons: {
          [$t`common.done`]: async (values) => {
            const oriValues = await $.libAdmin.store.get(ky)
            const result = await $.libAdmin.save({
              ...oriValues,
              ...values,
            })
            if (result) {
              showSnack({
                content: $t`libAdmin.save_success`,
                severity: 'success',
              })
            } else {
              showSnack({
                content: $t`libAdmin.save_fail`,
                severity: 'error',
              })
            }
          },
          [$t`common.cancel`]: null,
        },
      })
    }

    async showCreateForm() {
      return this.showForm({
        buttons: {
          [$t`common.done`]: async (values) => {
            const result = await $.libAdmin.save(newLibrary(values))
            if (result) {
              showSnack({
                content: $t`${$t`libAdmin.save_success`}, ${$t`libAdmin.open_new_lib`}`,
                severity: 'success',
              })
              $.libAdmin.route(values.ky)
            } else {
              showSnack({
                content: $t`libAdmin.save_fail`,
                severity: 'error',
              })
            }
          },
          [$t`common.cancel`]: null,
        },
      })
    }

    async save(libInfo: LibraryPersist) {
      if (isEmpty(libInfo.ori)) {
        libInfo.ori = 'Untitled library'
      }
      const result = await $.libAdmin.store.save(
        normalizeItem(libInfo) as LibraryPersist
      )
      return result
    }

    async delete(dbid: KyString) {
      if (dbid === HOME_DBID) {
        showSnack({
          content: 'Can not delete HOME database',
          severity: 'error',
        })
        return
      }
      const result = await $.libAdmin.store.update(dbid, {
        status: UNIT_STATUS.TRASH,
      })
      if (result) {
        if (dbid === $.libAdmin.current.ky) {
          window.location.href = `?db=default&v=${app.options.version}`
        }
      }
    }

    /**
     * 响应导出数据库请求，将数据库下载到本地
     * @param format
     * @returns
     */
    async download(format: ExportDatabaseFormat = 'fulljson') {
      const t = exportDatabaseHanlders[format]
      const infos = {
        app: app.options.appName,
        version: app.options.version,
        format,
        user: pick(app.user, ['id']),
        dbAdmin: {} as any,
      }
      const result = t.exports($.dbMemory.list, infos)
      const content = JSON.stringify(result)
      const date = datekit().format('YYYYMMDDhhmmss')
      return $.exports.download(content, t.ext, `${date}-evergreen-note`)
    }

    /**
     * 数据库切换
     * @param dbid
     */
    route(dbid: KyString) {
      window.location.href = `?lib=${composeId(dbid)}&v=${app.options.version}`
    }

    // switches(dbid: KyString) {
    //   if (dbid === HOME_DBID) {
    //     showSnack({
    //       content: 'Can not open HOME database',
    //       severity: 'error',
    //     });
    //     return;
    //   }
    //   setPubState(PUBKEY_DBID, dbid);
    //   $.router.to('/', { lib: composeId(dbid) });
    // }

    addonRun() {
      $.nav?.setTitleState((<LibTitleComp />) as any)
    }
  }

  return { libAdmin: new LibAdmin() }
}
