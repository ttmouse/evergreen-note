import React from 'react'
import { $t } from '../../../i18n'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { Item } from '../../interfaces/item'
import { KyString, UnitPersist } from '../../interfaces/unit'
import { BoxInfo, getRect } from '../../utils/calcSnap'
import { on } from '../../utils/dom/on'
import { isEmpty } from '../../utils/isEmpty'
import { dialogClose } from '../../utils/msg/showDialog'
import { FloatViewerComp } from './FloatEditorComp'
import { EditorProps } from '../EditorView/EditorView'
import {
  DialogProps,
  DialogStates,
  dialogDispatch,
} from '../../notekit-ui/components/Dialog/Dialog'
import { FloatViewerListComp } from './FloatViewerListComp'
import { animate, transform } from '../../utils/animation/transform'
import throttle from 'lodash/fp/throttle'
import debounce from 'lodash/fp/debounce'
import { createAndyAddon } from '../Andy/Andy'
import { after, original } from '../../engine/helper'
import { mkid } from '@/slate-item/utils/string/mkid'
import { atLater } from '@/slate-item/utils/atLater'
import { showSnack } from '@/slate-item/utils/msg/showSnack'
import { ROUTE_KEY } from '../Router/Router'

export type FloatViewerItem = {
  dialogId: KyString
  key: KyString
  title: string
  DialogStates: DialogStates
}

export type DialogListMode = 'fixed' | 'andy'

declare global {
  interface AppStates {
    floatViewerList: FloatViewerItem[]
    floatViewerMode: DialogListMode
    floatViewerActiveKey: string
  }
  interface AppConf {
    enableHoverFloatViewer: boolean
  }
}

type ItemMountedParams = {
  item: UnitPersist
  container: HTMLElement
}

export type FloatDialogProps = {
  title: string
  key: string
  body: string | JSX.Element
  DialogProps?: Partial<DialogProps>
  isPin?: boolean
  pos?: number
  container?: HTMLElement
}

export type FloatViewerProps = Omit<
  FloatDialogProps,
  'body' | 'title' | 'key'
> & {
  title?: string | JSX.Element
  item: UnitPersist | string
  keepTitleVisible?: boolean
  editorProps?: EditorProps
  onItemMounted?: (params: ItemMountedParams) => void
  limitZoomInUnderKy?: KyString
}

export function createFloatViewerAddon(addonParams: NewAddonParams) {
  const { app, $ } = addonParams

  app.setStateSchemes('floatViewerList', {
    default: [],
    cache: false,
  })
  app.setStateSchemes('floatViewerMode', {
    default: 'fixed',
    cache: false,
  })
  app.setStateSchemes('floatViewerActiveKey', {
    default: '',
    cache: false,
  })

  class FloatViewer implements IAddon {
    app!: App
    config = {}

    containerId = `${app.appName}-floatview-container`
    
    activeWindowStack: string[] = []
    handledCloseEvents = new WeakSet<Event>()

    animationDisabled = true

    tryShowExisting(theKy: string, dialogId: string) {
      const result = {exist: false, dialogId: dialogId};
      
      const entry = $.dialog.store.get(dialogId)
      if (entry && entry.visible && !entry.folded) {
        $.floatViewer.unfold(dialogId)
        result.exist = true
        return result
      }
      
      for (const [id, e] of $.dialog.store.entries) {
        if (e.rendered && !e.folded && e.visible) {
          const info = app.states.floatViewerList.find(d => d.dialogId === id)
          if (info && info.key === theKy) {
            $.floatViewer.unfold(id)
            result.dialogId = id
            result.exist = true
            return result
          }
        }
      }
      
      const existingInfo = app.states.floatViewerList.find(d => d.key === theKy)
      if (existingInfo) {
        const existingEntry = $.dialog.store.get(existingInfo.dialogId)
        if (existingEntry) {
          if (existingEntry.folded) {
            $.floatViewer.unfold(existingInfo.dialogId)
          } else if (!existingEntry.visible) {
            $.dialog.store.setVisible(existingInfo.dialogId, true)
          }
          result.dialogId = existingInfo.dialogId
          result.exist = true
          return result
        }
      }
      
      if (entry) {
        result.dialogId = `floatview-${mkid()}`
      }
      return result
    }

    showDialog(props: FloatDialogProps) {
      const {
        isPin,
        key,
        title,
        body,
        pos,
        container: requestedContainer,
        ...rest
      } = props

      let dialogId = `floatview-${key}`

      const existingRes = $.floatViewer.tryShowExisting(key, dialogId)
      if (existingRes.exist) 
        return existingRes.dialogId;
      else {
        dialogId = existingRes.dialogId;
        if (props.DialogProps) {
          props.DialogProps.id = dialogId;
        }
      }

      const { DialogProps: dialogProps = {} } = rest
      const { cssClass, ...dialogPropsWithoutCssClass } = dialogProps
      const isAndyWindow =
        app.states.floatViewerMode === 'andy' ||
        dialogProps.attributes?.['dialog-list-mode'] === 'andy'
      const isModal = !isAndyWindow && (dialogProps.mask ?? true)
      const container = requestedContainer ?? document.querySelector(
        `#${$.floatViewer.containerId} .floatview-container-subitems`
      ) as HTMLElement | null
      const classList = [
        ...(cssClass ?? []),
        ...(isModal ? ['app-modal'] : []),
        'dialog-item-float',
        'dialog-float-viewer',
      ]

      const theTitle = title

      const onRenderedThrottle = throttle(300, (states: DialogStates) => {
        // A trailing render notification may arrive after the dialog was closed.
        if (!$.dialog.store.get(dialogId)) return
        if (states.pin && states.visible) {
          $.floatViewer.add({
            dialogId,
            title,
            key,
            DialogStates: states,
          })
        } else if (!states.pin && $.floatViewer.has(dialogId)) {
          $.floatViewer.delete(dialogId)
        }
      })

      let cancelTransform = () => {}

      const handleFoldupDebounce = debounce(100, () => {
        const dlgEl = document.getElementById(dialogId)
        if (!dlgEl) {
          throw new Error(
            `Can't find the dialog DOM element by dialogId, may be it has beed unmounted, or dialogId is wrong`
          )
        }
        const tabEl = document.getElementById(`tab-${dialogId}`)
        if (!tabEl) {
          throw new Error(
            `Can't find tab item for folding dialog, make sure the tab item is created before folding`
          )
        }
        if ($.floatViewer.animationDisabled) {
          dlgEl.style.display = 'none'
          cancelTransform = () => {
            dlgEl.style.display = 'flex'
          }
        } else {
          const d = transform(dlgEl, tabEl, 250)
          cancelTransform = () => {
            d()
            dlgEl.style.transform = 'translate(0px, 0px)'
          }
        }
      })

      $.dialog.popup({
        title: theTitle,
        body,
        container,
        width: 500,
        cssClass: classList,
        id: dialogId,
        canPin: {
          pin: isPin,
        },
        // Utility windows are modal outside Andy mode; note previews and Andy windows stay modeless.
        mask: isModal,
        pos,
        canClose: true,
        canFold: true,
        onActive: () => {
          $.floatViewer.setActiveKey(dialogId)
          $.dialog.store.bringToFront(dialogId)
        },
        onMoveEnd(_, { left, top }) {
          $.dialog.store.setPosition(dialogId, left, top)
        },
        dialogZIndex: $.dialog.store.get(dialogId)?.zIndex,
        canClickWay: (ev) => {
          const target = ev.target as HTMLElement
          const exclude = [
            `#${dialogId} *`, // dialog 内部
            '.float-bar *', // 悬浮工具条
            '.tool-list *', // 大纲节点左侧的工具条
            '.re-menu *', // 大纲节点的工具菜单
          ]
          return !target.matches(exclude.join(','))
        },
        onRendered(_, { states }) {
          onRenderedThrottle(states)
        },
        onDispatched(_, { prev, next, states }) {
          const entry = $.dialog.store.get(dialogId)
          if (entry) {
            if (prev.pin !== next.pin) $.dialog.store.setPinned(dialogId, !!next.pin)
            if (prev.foldup !== next.foldup) $.dialog.store.setFolded(dialogId, !!next.foldup)
          }
          
          if (!prev.foldup && next.foldup) {
            handleFoldupDebounce()
            $.floatViewer.removeFromActiveStack(dialogId)
          } else if (prev.foldup && !next.foldup) {
            const dlgEl = document.getElementById(dialogId)
            if (!dlgEl) {
              throw new Error(
                `Can't find the dialog DOM element by dialogId, may be it has beed unmounted, or dialogId is wrong`
              )
            }
            cancelTransform()
          }
        },
        onClose(_, { dom }) {
          if ($.floatViewer.animationDisabled) {
            $.dialog.close(dialogId)
          } else {
            const rect = dom.getBoundingClientRect()
            dom.style.height = `${rect.height}px`
            animate(dom, {
              onEnd() {
                $.dialog.close(dialogId)
              },
              to: {
                width: '0px',
                height: '0px',
                opacity: '0',
                overflow: 'hidden',
              },
              duration: 200,
            })
          }
          return false
        },
        onMounted(_, { dom }) {
          dom.setAttribute('data-rendered', key);
          $.dialog.store.register(dialogId, { visible: true, rendered: true })
          $.dialog.store.applyOrderToDom()
          $.floatViewer.syncActiveNotes()
          if (app.states.floatViewerMode === 'andy') {
            const body = dom.querySelector('.nui-dialog-body') as HTMLElement | null
            if (body) body.scrollTop = $.main.workspaceScroll[key] || 0
          }
          const bodyDom = dom.querySelector(':scope > .node-body')!
          const showHeadThrottle = throttle(100, () => {
            const { scrollTop } = bodyDom
            if (scrollTop > 40) {
              dom.classList.add('node-head-visible')
            } else {
              dom.classList.remove('node-head-visible')
            }
          })
          bodyDom?.addEventListener('scroll', showHeadThrottle)
        },
        ...dialogPropsWithoutCssClass,
      })
      $.floatViewer.setActiveKey(dialogId)
      return dialogId
    }

    show(props: FloatViewerProps = {} as any) {
      const { item, title, ...rest } = props
      const theKy = typeof item === 'string' ? item : item.ky;
      let dialogId = `floatview-${theKy}`

      const existingRes = $.floatViewer.tryShowExisting(theKy, dialogId)
      if (existingRes.exist) return existingRes.dialogId
      else dialogId = existingRes.dialogId;

      const theItem =
        typeof item === 'string'
          ? $.dbMemory.getItem(item, { isRecur: true })
          : item

      const { DialogProps: dialogProps = {} } = props

      let theTitle = title
      if (isEmpty(theTitle)) theTitle = dialogProps.title
      if (isEmpty(theTitle)) theTitle = isEmpty(theItem.leaves) ? theItem.ori : Item.headString(theItem, { parseRefer: true })
      if (isEmpty(theTitle)) theTitle = "Untitled"

      $.floatViewer.showDialog({
        key: theItem.ky,
        title: theTitle as any,
        body: <FloatViewerComp {...props} />,
        // rest 必须在 DialogProps 之前展开：调用方的 DialogProps（mask/SnapProps
        // 等）要生效，但不得覆盖这里的默认 width（625，Andy 列宽）——
        // 调用方显式传 width 时仍以后者为准（见内部展开顺序）。
        ...rest,
        DialogProps: {
          id: dialogId,
          // 与 Andy 阅读列同宽（DESIGN.md §5 拍板值 625px），浮层预览与列阅读同一内容度量。
          width: 625,
          // Note previews remain modeless; callers can opt in for utility panels.
          mask: false,
          canClickWay: (ev) => {
            const target = ev.target as HTMLElement
            const exclude = [
              `#${dialogId} *`, // dialog 内部
              '.float-bar *', // 悬浮工具条
              '.tool-list *', // 大纲节点左侧的工具条
              '.re-menu *', // 大纲节点的工具菜单
            ]
            return !target.matches(exclude.join(','))
          },
          ...(rest.DialogProps ?? {}),
        },
      })
      return dialogId
    }

    closeActiveNote() {
      if (app.states.floatViewerMode !== 'andy') {
        if ($.main.workspaceTabs.length > 1) $.main.closeWorkspaceTab($.main.workspaceActiveKey)
        return
      }
      const dialogId = app.states.floatViewerActiveKey
      if (dialogId && this.has(dialogId)) $.dialog.close(dialogId)
    }

    setActiveKey(dialogId: string) {
      const existingIndex = this.activeWindowStack.indexOf(dialogId)
      if (existingIndex > -1) {
        this.activeWindowStack.splice(existingIndex, 1)
      }
      this.activeWindowStack.push(dialogId)
      app.setState('floatViewerActiveKey', dialogId)
      const viewer = app.states.floatViewerList.find(dlg => dlg.dialogId === dialogId)
      if (app.states.floatViewerMode === 'andy' && viewer) {
        if ($.main.workspaceTabs.some(tab => tab.key === viewer.key)) $.main.workspaceActiveKey = viewer.key
        else $.main.openWorkspaceTab(viewer.key, viewer.title)
      }
      this.syncActiveNotes()
    }

    syncActiveNotes() {
      document
        .querySelectorAll(`#${this.containerId} .nui-dialog[dialog-list-mode='andy']`)
        .forEach((dialog) => {
          dialog.classList.toggle('andy-note-active', dialog.id === app.states.floatViewerActiveKey)
        })
    }

    removeFromActiveStack(dialogId: string) {
      const existingIndex = this.activeWindowStack.indexOf(dialogId)
      if (existingIndex > -1) {
        this.activeWindowStack.splice(existingIndex, 1)
      }
      
      if (app.states.floatViewerActiveKey === dialogId) {
        const nextActiveId = this.activeWindowStack.length > 0 
          ? this.activeWindowStack[this.activeWindowStack.length - 1] 
          : ''
        app.setState('floatViewerActiveKey', nextActiveId)
        this.syncActiveNotes()
        if (app.states.floatViewerMode === 'andy' && nextActiveId) {
          $.andy.scrollIntoView(nextActiveId)
        } 
      }
    }

    clearActiveStack() {
      this.activeWindowStack = []
      app.setState('floatViewerActiveKey', '')
    }

    unfold(dialogId: string) {
      dialogDispatch(dialogId, {
        type: 'set_foldup',
        payload: false,
      })
      $.dialog.store.setFolded(dialogId, false)
      $.dialog.store.setVisible(dialogId, true)
      $.floatViewer.setActiveKey(dialogId)
    }

    setMode(dialogId: string, mode: DialogListMode) {
      dialogDispatch(dialogId, {
        type: 'set_attributes',
        payload: {
          'dialog-list-mode': mode,
        },
      })
    }

    unblockNavigation = null as (() => void) | null

    setModeAll(mode: DialogListMode, pos?: number) {
      if (app.states.floatViewerMode === mode) return
      const exitingAndy = app.states.floatViewerMode === 'andy' && mode === 'fixed'
      const dialogs = [...app.states.floatViewerList]
      if (mode === 'andy') {
        $.main.trackWorkspaceRoute()
        $.main.rememberWorkspaceScroll()
      }
      if (!exitingAndy) {
        dialogs.forEach((dlg) => $.floatViewer.setMode(dlg.dialogId, mode))
      }
      // Resolve the current route before navigating away. A note route is
      // /<route base>/item/<ky>, while Andy expects the decoded note key.
      const pathname = $.router.history.location.pathname
      const routeBase = `/${ROUTE_KEY}/`
      const routePath = (pathname.startsWith(routeBase)
        ? pathname.slice(routeBase.length)
        : pathname.replace(/^\//, '')).replace(/\/$/, '')
      const path = routePath.startsWith('item/')
        ? decodeURIComponent(routePath.slice('item/'.length))
        : routePath
      if (mode === 'andy') {
        original($.router.to)('/andyMode')
        this.unblockNavigation = $.router.history.block((_) => {
          showSnack({
            content: $t`Please exit andy mode first before navigating to other pages.`,
            autoClose: 3000,
            severity: 'warning',
          })
        });
      }
      app.states.floatViewerMode = mode
      const crumbs = document.getElementById(`${app.appName}-crumbs`)
      if (mode === 'andy') {
        const activeKey = $.main.workspaceActiveKey || path || 'diaries'
        const tabs = [...$.main.workspaceTabs]
        if (tabs.length) {
          tabs.forEach((tab, index) => $.keyClick.openInAndyMode(tab.key, index))
        } else if (path !== 'andyMode') {
          $.keyClick.openInAndyMode(path || 'diaries', pos)
        }
        // Dialog registration is throttled; reveal the selected tab once mounted.
        atLater(() => {
          const viewer = app.states.floatViewerList.find(dlg => dlg.key === activeKey)
          if (app.states.floatViewerMode === 'andy' && viewer) $.andy.scrollIntoView(viewer.dialogId)
        }, 'andy-active-tab', 350)
        if (crumbs) crumbs.style.display = "none"
      } else {
        this.unblockNavigation && this.unblockNavigation();
        this.unblockNavigation = null;
        // Leaving the reading workspace must not turn every column into an
        // overlapping desktop window. Set the mode first so closing the last
        // viewer cannot recursively trigger another Andy exit.
        if (exitingAndy) {
          const activeKey = $.main.workspaceActiveKey || 'diaries'
          dialogs.forEach(dlg => {
            const body = document.getElementById(dlg.dialogId)?.querySelector('.nui-dialog-body') as HTMLElement | null
            if (body) $.main.workspaceScroll[dlg.key] = body.scrollTop
          })
          dialogs.forEach((dlg) => $.dialog.close(dlg.dialogId))
          // Replace the workspace route so Back cannot return to an empty Andy page.
          $.router.history.replace(`${$.router.fix(activeKey)}${$.router.history.location.search || ''}`)
          $.router.currentPath = activeKey
          $.router.mark()
        }
        if (crumbs) crumbs.style.display = "block"
      }
    }

    toggleAll() {
      const nextMode: DialogListMode =
        app.states.floatViewerMode === 'andy' ? 'fixed' : 'andy'
      $.floatViewer.setModeAll(nextMode)
    }

    has(dialogId: string) {
      return app.states.floatViewerList.some((dlg) => dlg.dialogId === dialogId)
    }

    /** 有任何可见（未折叠）的浮层打开时为真；Esc 关闭前的守卫用。 */
    hasAnyVisible() {
      return app.states.floatViewerList.some((dlg) => {
        const entry = $.dialog.store.get(dlg.dialogId)
        return !!entry && entry.visible && !entry.folded
      })
    }

    add(floatInfo: FloatViewerItem) {
      if ($.floatViewer.has(floatInfo.dialogId)) {
        return
      }
      app.states.floatViewerList = [...app.states.floatViewerList, floatInfo]
      if (app.states.floatViewerMode === 'andy') {
        const index = $.dialog.store.order.filter(id => app.states.floatViewerList.some(dlg => dlg.dialogId === id)).indexOf(floatInfo.dialogId)
        const title = $.main.workspaceTabs.find(tab => tab.key === floatInfo.key)?.title || floatInfo.title
        $.main.openWorkspaceTab(floatInfo.key, title, index < 0 ? undefined : index)
      }
    }

    delete(dialogId: string) {
      app.states.floatViewerList = app.states.floatViewerList.filter(
        (dlg) => dlg.dialogId !== dialogId
      )
      if (
        app.states.floatViewerList.length === 0 &&
        app.states.floatViewerMode === 'andy'
      ) {
        // Closing a note changes the workspace content, not its layout mode.
        // Wait for React to unmount the old diary DOM before reusing its ID.
        setTimeout(() => {
          if (app.states.floatViewerMode === 'andy' && app.states.floatViewerList.length === 0) {
            $.keyClick.openInAndyMode('diaries')
          }
        }, 0)
      }
    }

    addonBeforeRun() {
      after($.nav.pushComponent, () => {
        $.ui.pushComponent(FloatViewerListComp, Infinity)
      })

      let activeStackBackup: string[] = []
      let lastTriggerTime = 0
      after($.floatViewer.unfold, () => {
        activeStackBackup = []
      })
      $.hotkey.addCommands({
        closeActiveNote: {
          title: '关闭当前笔记',
          hotkey: 'mod+w',
          context: 'everywhere',
          handle({ event }) {
            // Slate and the document listener can dispatch the same native key.
            const nativeEvent = ((event as any)?.nativeEvent ?? event) as KeyboardEvent
            if (nativeEvent) {
              if (nativeEvent.repeat || $.floatViewer.handledCloseEvents.has(nativeEvent)) return false
              $.floatViewer.handledCloseEvents.add(nativeEvent)
            }
            $.floatViewer.closeActiveNote()
            return false
          },
        },
        closeActiveNoteByEsc: {
          title: '关闭当前浮层（Esc）',
          hotkey: 'esc',
          context: 'everywhere',
          handle({ event }) {
            const nativeEvent = ((event as any)?.nativeEvent ?? event) as KeyboardEvent
            if (nativeEvent?.repeat) return true
            // MUI Popover/Menu/Dialog 打开时 Esc 归它们（关菜单/对话框），不抢。
            const el = nativeEvent?.target as HTMLElement | null
            if (el?.closest?.('.MuiPopover-root, .MuiMenu-root, .MuiDialog-root')) return true
            // closeActiveNote 在 fixed 模式关的是工作区标签（单标签时 no-op），
            // 不是浮层。Esc 必须直接关「最上层的可见浮层」。
            const visible = app.states.floatViewerList.filter(d => {
              const e = $.dialog.store.get(d.dialogId)
              return e && e.visible && !e.folded
            })
            if (!visible.length) return true
            const order = $.dialog.store.order
            let target = visible[visible.length - 1].dialogId
            for (let i = order.length - 1; i >= 0; i--) {
              if (visible.some(v => v.dialogId === order[i])) { target = order[i]; break }
            }
            $.dialog.close(target)
            return false
          },
        },
        showDesktop: {
          title: $t`floatViewer.show_desktop_mode`,
          hotkey: 'mod+d',
          context: 'everywhere',
          handle({ event }) {
            if (Date.now() - lastTriggerTime < 100) {
              return
            }
            lastTriggerTime = Date.now()
            if (app.states.floatViewerMode === 'andy') return
            event.preventDefault()
            if (isEmpty(activeStackBackup)) {
              activeStackBackup = [...$.floatViewer.activeWindowStack]
              for (const dlg of activeStackBackup) {
                if (!$.dialog.store.get(dlg)?.folded) {
                  dialogDispatch(dlg, {
                    type: 'set_foldup',
                    payload: true,
                  })
                  $.dialog.store.setFolded(dlg, true)
                  $.dialog.store.setVisible(dlg, false)
                }
              }
              $.floatViewer.clearActiveStack()
            } else {
              for (const dlgId of activeStackBackup) {
                dialogDispatch(dlgId, {
                  type: 'set_foldup',
                  payload: false,
                })
                $.dialog.store.setFolded(dlgId, false)
                $.dialog.store.setVisible(dlgId, true)
              }
              $.floatViewer.activeWindowStack = activeStackBackup
              if (!isEmpty(activeStackBackup)) {
                $.floatViewer.setActiveKey(
                  activeStackBackup[activeStackBackup.length - 1]
                )
              }
              activeStackBackup = []
            }
          },
        },
      })
    }

    addonInfo() {
      return {
        title: $t`floatViewer.title`,
        quote: $t`floatViewer.quote`,
        type: 'fieldset',
        defaultValue: 'on',
        updated: 20250204,
        subitems: {
          enableHoverFloatViewer: {
            title: "Enable Hover to Show Float Viewer",
            type: "switch",
            defaultValue: false as any,
          }
        } 
      }
    }

    addonRun() {
      if($.prefer.getValue("enableHoverFloatViewer")) this.listen()
      after($.dialog.close, (_, dialogId: string) => {
        const viewer = app.states.floatViewerList.find(dlg => dlg.dialogId === dialogId)
        if (app.states.floatViewerMode === 'andy' && viewer) $.main.forgetWorkspaceTab(viewer.key)
        $.floatViewer.removeFromActiveStack(dialogId)
        // Finish removing the old entry before the last-column fallback can
        // open a new diary viewer with the same dialog ID.
        $.dialog.store.unregister(dialogId)
        if ($.floatViewer.has(dialogId)) $.floatViewer.delete(dialogId);
      })
      after($.dialog.closeAll, () => {
        $.floatViewer.clearActiveStack()
        app.states.floatViewerList = []
        $.dialog.store.clearAll()
      })
    }

    listen() {
      let checkItem: UnitPersist | null = null
      let targetBox: BoxInfo | null = null
      let currentKy: KyString | null = null
      let closeTimer: any = null
      const ITEM_TO_DIALOG: { [ky: KyString]: string } = {}

      const closeFloat = (ky?: KyString) => {
        if (ky && ITEM_TO_DIALOG[ky]) {
          dialogClose(ITEM_TO_DIALOG[ky])
          delete ITEM_TO_DIALOG[ky]
        }
      }

      // 悬停即预览：不再要求按住 Shift。
      const check = () => {
        if (!checkItem) return
        if (closeTimer) {
          clearTimeout(closeTimer)
          closeTimer = null
        }
        // 一次只保留一个悬停预览窗
        if (currentKy && currentKy !== checkItem.ky) closeFloat(currentKy)
        const id = $.floatViewer.show({
          item: checkItem.ky,
          DialogProps: {
            SnapProps: {
              targetBox: targetBox!,
              place: ['right-out', 'middle'],
            },
          },
        })
        ITEM_TO_DIALOG[checkItem.ky] = id
        currentKy = checkItem.ky
        checkItem = null
        targetBox = null
      }

      // 鼠标移开链接后延迟关闭；关闭前实时检查鼠标是否真的停在浮窗上，
      // 不用标记位（点 X/Esc 关闭时 DOM 直接移除，不会触发 mouseout，标记会卡死）
      const scheduleClose = () => {
        checkItem = null
        if (closeTimer) clearTimeout(closeTimer)
        closeTimer = setTimeout(() => {
          closeTimer = null
          if (!currentKy) return
          const dlgId = ITEM_TO_DIALOG[currentKy]
          const dlg = dlgId ? document.getElementById(dlgId) : null
          if (dlg && dlg.matches(':hover')) return
          closeFloat(currentKy)
          currentKy = null
        }, 300)
      }

      on('mouseover', '.element-bilink [data-slate-string]', (e) => {
        const el = e.target as HTMLElement
        const topicStr = el?.innerText.trim()
        if (topicStr) {
          const topicTitle =
            el.closest('.element-bilink')?.getAttribute('data-topic') ??
            topicStr
          targetBox = getRect(el.closest('.inline-element') as HTMLElement)
          checkItem = $.topic.getTopic(topicTitle)
          check()
        }
      })

      on('mouseout', '.element-bilink [data-slate-string]', () => {
        scheduleClose()
      })

      on('mousedown', '.element-bilink *', () => {
        checkItem = null
      })

      document.addEventListener('mouseover', (e) => {
        const target = e.target as HTMLElement
        if (target.matches('[item-ky] *,[item-ky]')) {
          const el = target.closest('[item-ky]') as HTMLElement
          const refky = el?.getAttribute('item-ky')
          if (refky) {
            targetBox = el as any
            checkItem = $.dbMemory.getItem(refky)
            check()
          }
        }

        // 鼠标进入浮窗：取消待执行的关闭
        if (target.closest('.dialog-item-float') && closeTimer) {
          clearTimeout(closeTimer)
          closeTimer = null
        }
      })
      document.addEventListener('mouseout', (e) => {
        const el = e.target as HTMLElement
        if (el.matches('[item-ky], [item-ky] *')) {
          scheduleClose()
        }
      })
      on('mouseout', '.dialog-item-float', () => {
        scheduleClose()
      })
    }
  }

  return {
    floatViewer: new FloatViewer(),
    ...createAndyAddon(addonParams),
  }
}
