import { diffObj } from '@/slate-item/utils/object/diffObj'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { Item, ItemNode, makeItemText } from '../../interfaces/item'
import { KyString } from '../../interfaces/unit'
import { HistoryEditor, Path, Transforms } from '../../slate.inc'
import { replaceSlateNode } from '../../transforms/helper'
import { isEmpty } from '../../utils/isEmpty'
import { pub } from '../../utils/pub'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { atLater } from '@/slate-item/utils/atLater'
import { Indexkey } from '../DbMemory/DbMemory'
import { deepEqual } from '@/slate-item/utils/object/deepEqual'
import { until } from '@/slate-item/utils/until'
import { ItemDOM } from '@/slate-item/components/ItemView'
import { showSnack } from '@/slate-item/utils/msg/showSnack'
import { browser } from '@/slate-item/utils/browser'

export const DIRTY_ITEMS_WEAKMAP: WeakMap<ItemNode, boolean> = new WeakMap()

const editorIdRegex = /^i(\d+)-/

/**
 * 节点刷新
 * 当一个节点在多处被打开时，如果其中一处被修改，其他也应该被刷新
 * @param param0
 * @returns
 */
export function createRefreshAddon({ app, $ }: NewAddonParams) {
  class Refresh implements IAddon {
    app!: App
    config = {}

    getItem(ky: KyString, recursive = true) {
      return $.dbMemory.getItem(ky, { isRecur: recursive })
    }

    preventRefresh = 0

    withoutRefreshing(fn: () => void) {
      this.preventRefresh++
      fn()
      this.preventRefresh--
    }

    refreshItem(
      editor: ItemEditor,
      path: Path,
      recursive = true,
      newItem?: UnitPersist
    ) {
      if (this.preventRefresh > 0) return
      return HistoryEditor.withoutSaving(editor, () => {
        editor.withoutSaving(() => {
          const item = editor.item(path)
          const { ky } = item
          newItem ??= $.refresh.getItem(ky, recursive)
          if (isEmpty(newItem) || !Item.isNormalStatus(newItem)) {
            if ((item as any).$isTop) {
              const editorDom = document.querySelector(`article[editor-id="${editor.editorId}"]`)
              if (editorDom) {
                editorDom.setAttribute('data-deleted-ky', ky)
              }
            }
            editor.itemRemove(path)
          } else {
            replaceSlateNode(editor, Item.make(newItem, { editor }), path)
            if ((item as any).$isTop || path.length === 0) {
              const editorDom = document.querySelector(`article[editor-id="${editor.editorId}"]`)
              if (editorDom && editorDom.hasAttribute('data-deleted-ky')) {
                editorDom.removeAttribute('data-deleted-ky')
              }
            }
          }
        })
      })
    }

    restoreDeletedKy(ky: KyString) {
      const deletedEls = document.querySelectorAll(`[data-deleted-ky='${ky}']`)
      for (const el of deletedEls) {
        const editor = (el as any).editor
        if (!editor) continue
        const newItem = $.refresh.getItem(ky, true)
        if (isEmpty(newItem) || !Item.isNormalStatus(newItem)) continue
        const newNode = Item.make(newItem, { editor, $isTop: true })
        HistoryEditor.withoutSaving(editor, () => {
          editor.withoutSaving(() => {
            if (editor.children.length === 0) {
              Transforms.insertNodes(editor, newNode as any, { at: [0] })
            } else {
              replaceSlateNode(editor, newNode, [0])
            }
          })
        })
        ;(el as HTMLElement).removeAttribute('data-deleted-ky')
      }
    }

    updateBySelector(
      selector: string,
      ignoreEditor: ItemEditor[] | null,
      forceRecursive: boolean | null = null
    ) {
      const updatedEditors = ignoreEditor ?? []
      if (this.preventRefresh > 0) return updatedEditors
      const els = document.querySelectorAll(
        (forceRecursive === false ? '.refer-text ' : '') + selector
      ) as NodeListOf<ItemDOM>
      for (const el of els) {
        if (!el.$item || !el.$editor) continue
        if (el.$item.$isTmp) continue
        if (ignoreEditor && ignoreEditor.includes(el.$editor)) continue
        updatedEditors.push(el.$editor)
        $.refresh.refreshItem(
          el.$editor,
          el.$item.GetSlPath(),
          forceRecursive !== null
            ? forceRecursive
            : !el.matches('.refer-text section')
        )
      }
      return updatedEditors
    }

    createUpdateSession() {
      const updatedEditors: Map<ItemEditor, KyString[]> = new Map()
      const getExcludeEditors = (ky: KyString) => {
        const excludeEditors: ItemEditor[] = []
        for (const editor of updatedEditors.keys()) {
          const updatedKys = updatedEditors.get(editor)!
          if (updatedKys.includes('-')) {
            excludeEditors.push(editor)
            continue
          }

          let item: UnitPersist | null = $.dbMemory.getItem(ky, {
            isRecur: false,
          })
          while (item) {
            if (updatedKys.includes(item!.ky)) {
              excludeEditors.push(editor)
              break
            }
            if (!item!.pky || item!.pky === '-') break
            item = $.dbMemory.getItem(item!.pky, { isRecur: false })
          }
        }
        return excludeEditors
      }
      const addExcludeEditors = (ky: KyString, editors: ItemEditor[]) => {
        for (const editor of editors) {
          if (!updatedEditors.has(editor)) updatedEditors.set(editor, [ky])
          else {
            const k = updatedEditors.get(editor)!
            if (!k.includes(ky)) k.push(ky)
          }
        }
      }
      const updateBySelector = (selector: string, ky: KyString) => {
        const excludeEditors = getExcludeEditors(ky)
        const res = this.updateBySelector(selector, excludeEditors)
        addExcludeEditors(ky, res)
      }
      const updateByKy = (ky: KyString) => {
        updateBySelector(`section[data-ky='${ky}']`, ky)
        this.restoreDeletedKy(ky)
      }
      return { updateByKy, addExcludeEditors, updateBySelector }
    }

    addonBeforeRun() {
      // 视图节点一致
      pub.once(pub.evt.dbMemoryInitialized, () => {
        let refreshTasks: {
          [ky: string]: (
            f: ReturnType<typeof $.refresh.createUpdateSession>
          ) => void
        } = {}
        let taskRunning = false
        const runTasks = () => {
          if (taskRunning) return
          taskRunning = true
          const session = this.createUpdateSession()
          for (const task of Object.values(refreshTasks)) {
            task(session)
          }
          refreshTasks = {}
          taskRunning = false
        }
        pub.on(
          pub.evt.itemChanged,
          async ({ newer, freshAdd, originalData, sourceId }) => {
            if (this.preventRefresh > 0) return
            const aTask = (
              updateSession: ReturnType<typeof this.createUpdateSession>
            ) => {
              try {
                const time1 = performance.now()
                const { updateByKy, addExcludeEditors } = updateSession
                const originalItem =
                  typeof originalData === 'object' && !isEmpty(originalData)
                    ? originalData
                    : null
                const pathOri = Array.isArray(originalItem?.path)
                  ? originalItem.path
                  : []
                const updateFoldedAncestors = (path: string[]) => {
                  for (const s of path) {
                    if (browser.legacySafari) {
                      // 兼容性处理，去除 :has() 语法
                      document
                        .querySelectorAll(`section.node-foldup[data-ky='${s}']`)
                        .forEach((e: any) => {
                          if (e.querySelector('.node-body')) return
                          const itemdom = e as ItemDOM
                          DIRTY_ITEMS_WEAKMAP.set(itemdom.$item, true)
                        })
                    } else {
                      document
                        .querySelectorAll(
                          `section.node-foldup[data-ky='${s}']:not(:has(.node-body))`
                        )
                        .forEach((e: any) => {
                          const itemdom = e as ItemDOM
                          DIRTY_ITEMS_WEAKMAP.set(itemdom.$item, true)
                        })
                    }
                  }
                }
                if (!Item.isNormalStatus(newer)) {
                  this.updateBySelector(`section[data-ky='${newer.ky}']`, null)
                  pathOri && updateFoldedAncestors(pathOri)
                  return
                }

                // find self
                const selfEditor = isEmpty(sourceId)
                  ? null
                  : (() => {
                      const tryMatch = sourceId!.match(editorIdRegex)
                      if (tryMatch) {
                        const editorId = tryMatch[1]
                        const el = document.querySelector(
                          `article[editor-id='${editorId}']`
                        )
                        if (
                          el &&
                          (el as any).editor &&
                          (el as any).editor.editorId === editorId
                        ) {
                          return (el as any).editor
                        }
                      }
                      const all = document.querySelectorAll(
                        `section[data-ky='${originalItem?.ky ?? newer.ky}']`
                      )
                      for (let i = 0; i < all.length; i++) {
                        const el = all[i],
                          curEditor = (all[i] as any).$editor
                        if (sourceId == el.id) {
                          return curEditor
                        }
                      }
                      return null
                    })()
                if (selfEditor) addExcludeEditors('-', [selfEditor])

                if (freshAdd) {
                  // fresh add
                  updateByKy(newer.pky)
                  updateByKy(newer.ky)
                  return
                }

                if (!originalItem) {
                  updateByKy(newer.pky)
                  updateByKy(newer.ky)
                  return
                }

                // 此处需判断谁的范围更大，防止重复更新
                // newer.path 可能缺失（部分保存载荷不带 path），与上方 pathOri 同法兜底，
                // 否则 pathOri.length < pathNew.length 直接抛 TypeError，整次刷新被 catch 吞掉
                const pathNew = Array.isArray(newer.path) ? newer.path : []
                if (
                  deepEqual(pathOri, pathNew) &&
                  originalItem.weight === newer.weight
                ) {
                  updateByKy(newer.ky) // 此时只有节点本身的数据被更新
                  // 处理父级节点被折叠情况
                  updateFoldedAncestors(pathNew)
                } else {
                  // 判断indent情况
                  if (
                    pathOri.length < pathNew.length &&
                    pathOri.every((v, i) => v === pathNew[i])
                  ) {
                    // 此处是indent，应当以过去的较大的pky为准
                    updateByKy(originalItem.pky)
                    updateByKy(newer.pky)
                    updateFoldedAncestors(pathOri)
                    updateFoldedAncestors(pathNew)
                  } else {
                    // 其他情况一律以新的pky为准
                    updateByKy(newer.pky)
                    updateByKy(originalItem.pky)
                    updateFoldedAncestors(pathNew)
                    updateFoldedAncestors(pathOri)
                  }
                }
                const time2 = performance.now()
                if (time2 - time1 > 100) {
                  showSnack({
                    severity: 'warning',
                    content: `The refresh of ${Item.headString(newer)} took too long. Please consider close related floatviewers.`,
                  })
                }
              } catch (e) {
                console.error(e)
              }
            }
            await until(() => !taskRunning)
            refreshTasks[newer.ky || originalData.ky] = aTask
            atLater(runTasks, 'run-refresh-tasks', 200)
          }
        )
      })
    }

    addonRun() {}
  }

  return { refresh: new Refresh() }
}
