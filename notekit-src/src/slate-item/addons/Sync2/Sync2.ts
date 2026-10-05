import { IAddon, App, NewAddonParams, appmark } from '../../engine/App'
import { after } from '../../engine/helper'
import { SyncService, SyncServiceOptions } from './SyncService'
import { isEmpty } from '../../utils/isEmpty'
import { $t } from '../../../i18n'
import { SyncIcon } from './SyncIcon'
import { list2map, setSyncStatus } from './helper'
import { DEBUG_MODE, TRANSFER_BATCH_SIZE } from '../../constants'
import { showSnack, SnackbarProps } from '@/slate-item/utils/msg/showSnack'
import { Item, ItemEditor } from '@/slate-item'
import { time } from '@/slate-item/utils/date/time'
import { until } from '@/slate-item/utils/until'
import { atLater, clearLater } from '@/slate-item/utils/atLater'
import { pub } from '@/slate-item/utils/pub'

type CloudRow = { id: number; data: UnitPersist }

declare global {
  interface AppConf {
    syncService: 'on' | 'off'
  }
}

export function createSync2Addon({ app, $ }: NewAddonParams) {
  class Sync2 implements IAddon {
    app!: App
    config = {}
    services: { [k: string]: SyncService } = {}
    serverData: { [k: string]: UnitPersist[] } = {}
    syncErrorCount = 0

    static MAX_SYNC_ERRORS = 3

    handleSyncError() {
      if (DEBUG_MODE) return
      this.syncErrorCount++
      if (this.syncErrorCount >= Sync2.MAX_SYNC_ERRORS) {
        $.dialog.confirm(
          $t`Sync keeps failing. Turn off sync and go offline?`,
          () => {
            setSyncStatus('offline')
            app.disableAddon('sync2')
            showSnack({
              content: 'Sync disabled. You are now in offline mode.',
              severity: 'warning',
              autoClose: 5000,
              clickAway: true,
            })
          }
        )
        $.sync2.syncErrorCount = 0
      }
    }

    countPending() {
      let count = 0
      for (const service of Object.values(this.services)) {
        count += Object.keys(service.pending).length
      }
      return count
    }

    /**
     * 分页获取服务器数据，反复请求直到获得所有数据
     */
    async fetchAllServerData(
      conds: any[],
      shareId?: string | null
    ): Promise<{ [k: string]: UnitPersist[] }> {
      const allData: { [k: string]: UnitPersist[] } = {}
      const condHasMore: { [k: string]: boolean } = {}
      const condOffset: { [k: string]: number } = {}
      const limit = TRANSFER_BATCH_SIZE

      // 初始化所有条件对应的数据数组和状态
      for (const cond of conds) {
        const key = `${cond.dbid}-${cond.tbName}`
        allData[key] = []
        condHasMore[key] = true
        condOffset[key] = 0
      }

      while (Object.values(condHasMore).some((hasMore) => hasMore)) {
        // 只发送还有更多数据的条件，每个条件使用自己的offset
        const activeConds = conds
          .filter((cond) => {
            const key = `${cond.dbid}-${cond.tbName}`
            return condHasMore[key]
          })
          .map((cond) => {
            const key = `${cond.dbid}-${cond.tbName}`
            return {
              ...cond,
              offset: condOffset[key],
              limit,
            }
          })

        const serverResponse = (await $.http.post('/api/get-server-data', {
          conds: JSON.stringify(activeConds),
          shareId: shareId && shareId !== 'null' ? shareId : null,
        })) as any

        if ('code' in serverResponse && serverResponse.code !== 0) {
          throw new Error('Server data fetch failed')
        }

        // 合并数据并更新hasMore状态和offset
        for (const cond of activeConds) {
          const key = `${cond.dbid}-${cond.tbName}`
          if (serverResponse[key]) {
            const condResult = serverResponse[key]
            if (condResult.result) {
              allData[key] = allData[key].concat(condResult.result)
            }
            condHasMore[key] = condResult.hasMore || false
            // 只有当该条件还有更多数据时才增加offset
            if (condHasMore[key]) {
              condOffset[key] += limit
            }
          } else {
            condHasMore[key] = false
          }
        }
      }

      return allData
    }

    needFullScan = false

    /**
     * 在系统初始化之前读入服务器端的数据，以便于与本地数据同步：
     * - 最新的笔记数据
     * - 最新的偏好设置
     * - 最新的数据库列表信息
     * @returns
     */
    async getServerData(): Promise<{ [k: string]: UnitPersist[] }> {
      if (isEmpty($.sync2.serverData)) {
        appmark('Fetching server data')
        const shareId = $.sandbox.isSandbox()
          ? sessionStorage.getItem('shareId')
          : null
        const openId = await $.libAdmin.getOpenId()
        const fallbackServerData = {
          [openId + '-node']: [],
          [$.libAdmin.HOME_DBID + '-node']: [],
          [$.libAdmin.HOME_DBID + '-prefer']: [],
        }
        if ($.dbDisk.storageMode === 'sqlite' || !navigator.onLine) {
          this.serverData = fallbackServerData
          return this.serverData
        }
        try {
          const glt = localStorage.getItem(`${openId}-lastGetTime`)
          let lastTime
          if (!shareId || shareId === 'null') {
            lastTime = parseInt(glt ?? '0')
            if (isNaN(lastTime)) {
              lastTime = 0
            }
          } else {
            lastTime = 0
          }

          // If local data is too old (older than 30 days), force full sync to avoid zombie data issues
          // 30 days = 2592000 seconds; we use a slightly smaller window (e.g. 29 days) for safety
          const now = time()
          if (lastTime > 0 && now - lastTime > 29 * 24 * 3600) {
            console.warn(
              'Local data is too old, forcing full sync to ensure consistency.'
            )
            this.needFullScan = true
            lastTime = 0
          }

          const conds = [
            {
              date: lastTime,
              dbid: openId,
              tbName: 'node',
            },
            {
              date: 0,
              dbid: $.libAdmin.HOME_DBID,
              tbName: 'node',
            },
            {
              date: 0,
              dbid: $.libAdmin.HOME_DBID,
              tbName: 'prefer',
            },
          ]

          this.serverData = await this.fetchAllServerData(conds, shareId)

          if (
            'code' in this.serverData &&
            (this.serverData.code as unknown as number) === -1
          ) {
            location.pathname = '/api/login'
            return fallbackServerData
          }
        } catch (e) {
          console.error(e)
          this.serverData = fallbackServerData
        }
      }

      return this.serverData
    }

    getService(dbid: string, tbName: 'node' | 'prefer' = 'node') {
      const k = `${dbid}-${tbName}`
      if (k in this.services === false) {
        const options: SyncServiceOptions = {
          dbid,
          tbName,
          app: this.app,
        }
        const service = new SyncService(options)
        this.services[k] = service
      }
      return this.services[k]
    }

    mergeNotes(
      dbid: string,
      localList: UnitPersist[],
      serverList: UnitPersist[]
    ) {
      const service = $.sync2.getService(dbid)
      return service.merge(localList, serverList, async (toLocal, toServer) => {
        if (navigator.onLine)
          Object.values(toServer).forEach((item) => {
            service.addPending(item)
          })

        await $.imports.writeItems(Object.values(toLocal), service.dbid, {
          showProgress: true,
          tbName: service.tbName,
        })
        let maxUpdated = 0
        for (const item of Object.values(toLocal)) {
          if (item.updated > maxUpdated) {
            maxUpdated = item.uploaded ?? item.updated
          }
        }
        if (maxUpdated === 0) maxUpdated = time()
        const lastGetTime = localStorage.getItem(`${dbid}-lastGetTime`)
        if (!lastGetTime || parseInt(lastGetTime) < maxUpdated) {
          localStorage.setItem(`${dbid}-lastGetTime`, maxUpdated.toFixed(0))
        }
      })
    }

    addPending(dbid: string, tbName: string, item: UnitPersist) {
      if (app.cfg.syncService !== 'off') {
        setSyncStatus('todo')
        $.sync2.getService(dbid, tbName as any).addPending(item)
      }
    }

    isSmallSyncing = false

    async smallSync(automatic: boolean = false) {
      if (this.isSmallSyncing) return
      const service = $.sync2.getService(await $.libAdmin.getOpenId(), 'node')
      if (automatic) {
        // 我们首先检查是不是要更新
        try {
          const needSync = await fetch('/api/get-need-sync').then((res) =>
            res.json()
          )
          if (needSync.code !== 0) {
            throw new Error('Server data fetch failed')
          }
          if (!needSync.needSync) {
            this.syncErrorCount = 0
            if (
              !service.transferring &&
              Object.keys(service.pending).length !== 0
            ) {
              clearLater('sync-service-transfer')
              setSyncStatus('todo')
              service.transfer()
            } else {
              setSyncStatus('done')
            }
            return
          }
        } catch (e) {
          setSyncStatus('fail')
          this.handleSyncError()
          if (!automatic) {
            showSnack({
              content: 'Sync failed',
              severity: 'error',
              autoClose: 5000,
              clickAway: true,
            })
          }
          return
        }
      }
      this.isSmallSyncing = true
      if (Object.keys(service.pending).length !== 0) {
        clearLater('sync-service-transfer')
      }
      const handler = (() => {
        const res = { continue(k: Partial<SnackbarProps>) {} }
        if (automatic) {
          setSyncStatus('fetching')
          res.continue = (k: Partial<SnackbarProps>) => {
            if (k.severity === 'error') setSyncStatus('fail')
            else setSyncStatus('done')
          }
        } else {
          const hdl = showSnack({
            content: 'Syncing...',
            severity: 'info',
            clickAway: false,
            autoClose: 30000,
          })
          res.continue = (k: Partial<SnackbarProps>) => {
            hdl.close(0)
            showSnack(k)
          }
        }
        return res
      })()
      try {
        const openId = await $.libAdmin.getOpenId()
        const dbid = openId + '-node'
        const glt = localStorage.getItem(`${openId}-lastGetTime`)
        let lastTime
        lastTime = parseInt(glt ?? '0')
        if (isNaN(lastTime)) {
          lastTime = 0
        }

        // If local data is too old (older than 30 days), force full sync to avoid zombie data issues
        // 30 days = 2592000 seconds; we use a slightly smaller window (e.g. 29 days) for safety
        const now = time()
        if (lastTime > 0 && now - lastTime > 29 * 24 * 3600) {
          console.warn(
            'Local data is too old, forcing full sync to ensure consistency.'
          )
          handler.continue({
            content: 'Local data outdated, performing full sync...',
            severity: 'info',
            autoClose: 3000,
          })
          this.isSmallSyncing = false
          await this.fullSync()
          return
        }

        const conds = [
          {
            date: lastTime,
            dbid: openId,
            tbName: 'node',
          },
        ]

        const serverData = await this.fetchAllServerData(conds)

        const serverList = serverData[dbid]

        await $.sync2.smartMergeRefresh(
          openId,
          Object.values($.dbMemory.nodes),
          serverList
        )
      } catch (e) {
        handler.continue({
          content: 'Sync failed',
          severity: 'error',
          autoClose: 5000,
          clickAway: true,
        })
        this.handleSyncError()
        this.isSmallSyncing = false
        return
      }
      this.isSmallSyncing = false
      this.syncErrorCount = 0
      handler.continue({
        content: 'Sync completed',
        severity: 'success',
        autoClose: 500,
      })
    }

    async fullSync(needConfirm: boolean = true) {
      if (needConfirm && !confirm('Are you sure to do a full sync?')) return
      const openId = await $.libAdmin.getOpenId()
      const dbid = openId + '-node'

      const conds = [
        {
          date: 0,
          dbid: openId,
          tbName: 'node',
        },
      ]

      const serverData = await $.sync2.fetchAllServerData(conds)
      const serverList = serverData[dbid]

      await $.sync2.mergeNotes(
        openId,
        Object.values($.dbMemory.nodes),
        serverList
      )
      showSnack({
        content:
          'Sync completed! You can refresh the page after the SyncIcon on the top right corner indicates that all data is uploaded.',
        severity: 'success',
      })
    }

    async smartMergeRefresh(
      dbid: string,
      localList: UnitPersist[],
      serverList: UnitPersist[]
    ) {
      const localMap = list2map(localList)
      const serverMap = list2map(serverList)

      const toLocal = {} as { [ky: string]: UnitPersist }
      const toServer = {} as { [ky: string]: UnitPersist }
      const merged = localMap
      let maxUpdated = 0

      for (let [k, itemServer] of Object.entries(serverMap)) {
        // 传到服务器时间晚于我上次下载的数据我没下载过，
        // 下载一下然后看看有什么是更晚“update”的，以最晚“update”的数据为准，
        // 服务器新写本地，本地新+pendinglist
        if (isEmpty(itemServer) || isEmpty(k)) {
          continue
        }

        maxUpdated = Math.max(
          maxUpdated,
          itemServer.uploaded ?? itemServer.updated
        )
        delete itemServer.uploaded

        const tb = await $.dbDisk.open(await $.libAdmin.getOpenId()).node

        if (!Item.isNormalStatus(itemServer)) {
          const itemDisk = await tb.get(k)
          if (isEmpty(itemDisk) && isEmpty(localMap[k])) continue
          if (itemServer.updated < itemDisk.updated) {
            merged[k] = toServer[k] = itemDisk
          } else if (itemServer.updated > itemDisk.updated) {
            if (itemServer.status === -2) {
              await tb.delete(k)
              delete merged[k]
              if ($.dbMemory.initFinished) {
                $.dbMemory.liveDeleteOne(k)
              }
            } else {
              merged[k] = toLocal[k] = itemServer
            }
          }
          continue
        }

        const itemLocal = localMap[k]

        const prepareItemServer = (item: UnitPersist) => {
          if (!('leaves' in item) || !item.leaves) {
            item = $.compat.convertItem(item)
            item.updated = time()
            toServer[k] = item
          }
          return item
        }

        merged[k] = itemServer = prepareItemServer(itemServer)

        if (isEmpty(itemLocal)) {
          toLocal[k] = itemServer
          continue
        }

        if (itemServer.updated < itemLocal.updated) {
          // 本地新+pendinglist
          merged[k] = toServer[k] = itemLocal
        } else if (itemServer.updated > itemLocal.updated) {
          // 服务器新写本地
          merged[k] = toLocal[k] = itemServer
        } else {
          merged[k] = toLocal[k] = itemServer
        }
      }

      const lutStr = localStorage.getItem(`${dbid}-lastUploadTime`)
      let lastUploadTime
      if (!lutStr) {
        lastUploadTime = maxUpdated
        localStorage.setItem(
          `${dbid}-lastUploadTime`,
          lastUploadTime.toFixed(0)
        )
      } else lastUploadTime = parseInt(lutStr)
      if (isNaN(lastUploadTime)) {
        lastUploadTime = maxUpdated
        localStorage.setItem(
          `${dbid}-lastUploadTime`,
          lastUploadTime.toFixed(0)
        )
      }

      for (const [k, itemLocal] of Object.entries(merged)) {
        if (isEmpty(itemLocal) || isEmpty(itemLocal.updated)) continue
        if (itemLocal.updated > lastUploadTime) {
          toServer[k] = itemLocal
        }
      }

      const service = $.sync2.getService(dbid, 'node')

      Object.values(toServer).forEach((item) => {
        service.addPending(item)
      })

      const writeList = Object.values(toLocal)

      await $.imports.writeItems(
        writeList,
        service.dbid,
        {
          showProgress: true,
          tbName: service.tbName,
        },
        'sync'
      )
      const lastGetTime = localStorage.getItem(`${dbid}-lastGetTime`)
      if (!lastGetTime || maxUpdated > parseInt(lastGetTime)) {
        localStorage.setItem(`${dbid}-lastGetTime`, maxUpdated.toFixed(0))
      } // lastGetTime 存的是我从服务器下载的节点最新新到什么程度
      if ($.dbMemory.initFinished) {
        const tree: any = {},
          flat: any = {}
        const mergeFather = (item: UnitPersist, chain: any) => {
          flat[item.ky] = chain
          if (item.pky === '-' || !item.pky) {
            // 把链条挂到树上
            tree[item.ky] = chain
            return
          }
          if (item.pky in flat) {
            flat[item.pky][item.ky] = chain
          } else {
            const pItem = $.dbMemory.getItem(item.pky)
            if (!pItem) {
              // 把链条挂到树上
              tree[item.ky] = chain
              return
            }
            mergeFather(pItem, { [item.ky]: chain })
          }
        }
        for (const item of writeList) {
          mergeFather(item, {})
          if (item.status === -1) {
            $.dbMemory.liveDeleteOne(item.ky)
            $.dbDisk.save(item, await $.libAdmin.getOpenId())
          }
        }
        const processed = new Set()
        const refreshItems = (
          items: Record<string, any>,
          ignoredEditors: ItemEditor[]
        ) => {
          for (const ky in items) {
            if (processed.has(ky)) continue
            processed.add(ky)

            let newIgnoreEditors = null
            try {
              newIgnoreEditors = [
                ...ignoredEditors,
                ...$.refresh.updateBySelector(
                  `section[data-ky="${ky}"]`,
                  ignoredEditors
                ),
              ]
            } catch {
              newIgnoreEditors = ignoredEditors
            }
            try {
              refreshItems(items[ky], newIgnoreEditors)
            } catch (e) {
              console.error(e)
            }
          }
        }
        refreshItems(tree, [])
      }

      return Object.values(merged)
    }

    async addonBeforeRun() {
      const { saveItem, prepareData } = $.dbMemory

      // after(saveItem, (item, params, options) => {
      //   if ($.dbMemory.canSave() && options?.by !== $.sync2) {
      //     const { $dbid = $.libAdmin.current.ky } = item;
      //     if ($.sandbox.isSandbox()) return;
      //     $.sync2.addPending($dbid, 'node', item)
      //   }
      // })
      pub.on(pub.evt.itemChanged, ({ originalData, newer }) => {
        const { $dbid = $.libAdmin.current.ky } = originalData
        if ($.sandbox.isSandbox()) return
        $.sync2.addPending($dbid, 'node', newer)
      })

      after(prepareData, (promise) => {
        return new Promise((resolve) => {
          promise.then(async (allItems) => {
            const results: { [dbid: string]: UnitPersist[] } = {}
            for (const [dbid, localList] of Object.entries(allItems)) {
              const serverList = $.sync2.serverData[`${dbid}-node`]

              if (dbid.startsWith('HOME-') || $.sync2.needFullScan) {
                results[dbid] = await $.sync2.mergeNotes(
                  dbid,
                  localList,
                  serverList
                )
              } else {
                results[dbid] = await $.sync2.smartMergeRefresh(
                  dbid,
                  localList,
                  serverList
                )
              }
            }
            const mergedItems: { [dbid: string]: UnitPersist[] } = {}

            for (const [dbid, result] of Object.entries(results)) {
              mergedItems[dbid] = await result
            }
            resolve(mergedItems)
          })
        })
      })
    }

    addonInfo() {
      return {
        title: $t`sync.title`,
        quote: $t`sync.quote`,
        defaultValue: 'on',
        updated: 20240815,
        // type: 'fieldset',
        // subitems: {
        //   syncService: {
        //     title: 'Sync service',
        //     type: 'select',
        //     quote: 'Enable or disable sync service',
        //     options: {
        //       on: 'On',
        //       off: 'Off',
        //     },
        //   },
        // },
      }
    }

    addonRun() {
      if ($.sandbox.isSandbox()) return
      let needSync = false
      const onBlur = () => {
        if (!document.hasFocus()) {
          needSync = true
          clearLater('autosync')
        }
      }
      const onFocus = () => {
        if (needSync) {
          needSync = false
          atLater(() => $.sync2.smallSync(true), 'autosync', 100)
        }
      }
      ;($.main.addExtraCommands({
        sync2: {
          icon: 'svg_add',
          title: $t`sync.title`,
          size: 20,
          order: 6000,
          render: SyncIcon,
        },
      }),
        $.main.addMoreExtraCommands({
          sync2: {
            icon: 'svg_cloud_sync',
            title: 'Full Sync',
            order: 10000,
            onClick: $.sync2.fullSync,
          },
        }))
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          needSync = true
          clearLater('autosync')
        } else {
          if (needSync) {
            needSync = false
            atLater(() => $.sync2.smallSync(true), 'autosync', 100)
          }
        }
      })
      window.addEventListener('focus', onFocus)
      window.addEventListener('blur', onBlur)
    }
  }

  return { sync2: new Sync2() }
}
