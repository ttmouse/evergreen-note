import debounce from 'lodash/fp/debounce'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { after, cover } from '../../engine/helper'
import { KyString } from '../../interfaces/unit'
import { scrollIntoViewSmoothly } from '../../utils/dom/scrollIntoView'
import './andy.less'
import { DialogListMode } from '../FloatViewer/FloatViewer'
import React from 'react'
import { EleIcon } from '../../components/Ele'
import { Breakpoints, cls, preset } from '../../styles'
import { Icon } from '../../../components/MaterialIcon'
import { Tip } from '../../components/Tip/Tip'
import { observer } from 'mobx-react'
import { appendStyle } from '../../utils/dom/appendStyle'
import { browser } from '@/slate-item/utils/browser'
import { isEmpty } from 'lodash'
import { Button } from '@/slate-item/notekit-ui/components/Button/Button'
import { $t } from '@/i18n'
import { ROUTE_KEY } from '../Router/Router'

const highlight = (el: HTMLElement) => {
  el.classList.add('dialog-active')
  setTimeout(() => {
    el.classList.remove('dialog-active')
  }, 2000)
}

const scrollIntoViewThrottle = debounce(100, (dialogId: string) => {
  const el = document.getElementById(dialogId)
  if (el) {
    scrollIntoViewSmoothly(el)
    highlight(el)
  }
})

export function createAndyAddon({ app, $ }: NewAddonParams) {
  class Andy implements IAddon {
    app!: App
    config = {}

    visibleNotes() {
      return $.dialog.store.order.filter((id) => {
        const entry = $.dialog.store.get(id)
        return entry?.visible && !entry.folded &&
          document.getElementById(id)?.getAttribute('dialog-list-mode') === 'andy'
      })
    }

    open(ky: KyString, pos = 10000) {
      const dialogId = $.floatViewer.show({
        pos,
        item: ky,
        isPin: true,
        DialogProps: {
          attributes: {
            'dialog-list-mode': 'andy',
          },
        },
      })
      $.andy.scrollIntoView(dialogId)
    }

    navigate(ky: KyString, sourceId = app.states.floatViewerActiveKey) {
      const order = this.visibleNotes()
      const sourceIndex = order.indexOf(sourceId)
      if (sourceIndex < 0) {
        $.keyClick.openInAndyMode(ky)
        return
      }

      // An existing destination anywhere in the path only changes the viewport.
      // The tab list is throttled; mounted columns are authoritative during rapid clicks.
      const targetId = order.find((id) => document.getElementById(id)?.getAttribute('data-rendered') === ky)
      if (targetId) {
        $.floatViewer.unfold(targetId)
        $.andy.scrollIntoView(targetId)
        return
      }

      // The right-hand notes are descendants of this source, not independent tabs.
      const descendants = order.slice(sourceIndex + 1)
      descendants.forEach((id) => $.dialog.close(id))
      const pos = $.dialog.store.order.indexOf(sourceId) + 1
      $.keyClick.openInAndyMode(ky, pos)
    }

    /**
     * 页面级导航（每日/主题/图谱等注册页面）在 Andy 模式下替换当前活动列。
     * 页面不是阅读路径的一环：点击页面 = 当前列让位换成该页面，
     * 而不是像笔记链接那样在右侧新增一列（2026-10-06 用户拍板，DESIGN.md §3.6）。
     */
    navigatePage(ky: KyString) {
      const path = ky.replace(/^\/|\/$/g, '')
      const existing = app.states.floatViewerList.find(dlg => dlg.key === path)
      const activeId = app.states.floatViewerActiveKey
      const pos = $.dialog.store.order.indexOf(activeId)
      if (existing) {
        // 目标页面已经是列：当前活动列让位（它本身就是目标页时除外），聚焦已有页
        if (activeId && pos >= 0 && activeId !== existing.dialogId) $.dialog.close(activeId)
        $.floatViewer.unfold(existing.dialogId)
        $.andy.scrollIntoView(existing.dialogId)
        return
      }
      if (pos < 0) {
        // 没有可替换的活动列，退回常规开列
        $.keyClick.openInAndyMode(ky)
        return
      }
      // 原位替换：关闭当前活动列，目标页面在同一位置打开。
      // 若关掉的是最后一列，FloatViewer.delete 的定时兜底会在回调里
      // 复查列表仍为空才重开 diaries；此处同步开列，不会触发。
      $.dialog.close(activeId)
      $.keyClick.openInAndyMode(ky, pos)
    }

    scrollIntoView(dialogId: string, attempt = 0) {
      const el = document.getElementById(dialogId)
      if (!el && attempt < 5) {
        setTimeout(() => this.scrollIntoView(dialogId, attempt + 1), 50)
        return
      }
      const container = el?.closest('.floatview-container-subitems') as HTMLElement | null
      if (el && container && app.states.floatViewerMode === 'andy') {
        const width = el.offsetWidth
        const start = el.offsetLeft
        const end = start + width
        let left = container.scrollLeft
        // Keep visible notes in place; reveal offscreen notes with the least movement.
        if (start < left || width > container.clientWidth) {
          left = Math.max(0, start)
        } else if (end > left + container.clientWidth) {
          left = end - container.clientWidth
        }
        if (window.innerWidth <= 800) left = 0
        if (left !== container.scrollLeft) {
          container.scrollTo({
            left,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          })
        }
        $.floatViewer.setActiveKey(dialogId)
      } else {
        scrollIntoViewThrottle(dialogId)
      }
    }

    addonInfo() {
      return {
        title: `Andy mode`,
        quote: `In Andy mode, you can open multiple documents in multiple columns, this lets you be able to check multiple documents in the same page.`,
        updated: 2023_06_11,
        defaultValue: 'on',
      }
    }

    addonBeforeRun() {
      $.hotkey.register({
        moveDialogLeft: {
          title: $t`andy.move_left`,
          hotkey: 'mod+shift+left',
          handle() {
            const activeEl = document.activeElement as HTMLElement
            if (activeEl && (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) || activeEl.isContentEditable)) {
              return true
            }
            const activeId = app.states.floatViewerActiveKey
            if (!activeId) return true

            const order = $.dialog.store.order
            const index = order.indexOf(activeId)
            if (index > 0) {
              $.dialog.store.swap(activeId, order[index - 1])
              $.dialog.store.applyOrderToDom()
              $.andy.scrollIntoView(activeId)
            }
            return false
          },
          context: 'everywhere',
        },
        moveDialogRight: {
          title: $t`andy.move_right`,
          hotkey: 'mod+shift+right',
          handle() {
            const activeEl = document.activeElement as HTMLElement
            if (activeEl && (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) || activeEl.isContentEditable)) {
              return true
            }
            const activeId = app.states.floatViewerActiveKey
            if (!activeId) return true

            const order = $.dialog.store.order
            const index = order.indexOf(activeId)
            if (index < order.length - 1) {
              $.dialog.store.swap(activeId, order[index + 1])
              $.dialog.store.applyOrderToDom()
              $.andy.scrollIntoView(activeId)
            }
            return false
          },
          context: 'everywhere',
        }
      })
    }

    addonRun() {
      appendStyle(`
        /* 仅 Andy 多栏模式去边线/投影：列要无缝拼接成一张纸。
           浮层预览窗（fixed 模式）保留 workspace-theme 的边线+投影，
           否则独立小窗在浅色纸面上没有可分辨边界。 */
        .floatview-container[data-mode='andy'] .dialog-float-viewer.nui-dialog {
          border: 0 !important;
          outline: none !important;
          box-shadow: none !important;
        }
        .floatview-container[data-mode='andy'] .floatview-container-subitems > .nui-dialog[dialog-list-mode='andy'] {
          margin: 0 !important;
          border: 0 !important;
          outline: none !important;
          border-radius: 0;
          box-shadow: none !important;
        }
      `)

      const { openInRightSide } = $.keyClick
      // Open the item in a pinned float viewer in andy mode when trying to open it in right side
      cover(openInRightSide, (ky) => {
        if (app.states.floatViewerMode === 'andy') {
          $.keyClick.openInAndyMode(ky)
          return
        }
        return openInRightSide.call($.keyClick, ky)
      })

      const { showDialog } = $.floatViewer
      after(showDialog, (dialogId) => {
        $.andy.scrollIntoView(dialogId)
        return dialogId
      })

      $.router.register({
        andyMode: {
          title: 'Andy Mode',
          comp: ()=><div>
            You are not expected to see this page. Click the button below to back to Diaries
            <br /><br />
            <Button
              onClick={() => $.router.to('/diaries')}
              variant="outlined"
              size="small"
            >
              In Main Area
            </Button><br /><br />
            <Button
              onClick={() => $.keyClick.openInAndyMode('/diaries')}
              variant="outlined"
              size="small"
            >
              In Andy Mode
            </Button>
          </div>
        },
      })

       
      $.main.addExtraCommands({
        dialogListMode: {
          render: observer(function DialogMode(props: any) {
            const [show, setShow] = React.useState(visualViewport && visualViewport.width >= Breakpoints.md)
            const handleClick = () => {
              $.floatViewer.toggleAll()
            }
            const isActive = app.states.floatViewerMode === 'andy'
            React.useEffect(() => {
              if (!visualViewport) return
              const onResize = () => {
                if (visualViewport!.width >= Breakpoints.md) {
                  setShow(true)
                } else {
                  setShow(app.states.floatViewerMode === 'andy')
                }
              }
              visualViewport.addEventListener('resize', onResize, { passive: true })
              return () => {
                visualViewport!.removeEventListener('resize', onResize)
              }
            });
            return show ? (
              <Tip title="Switch dialog view">
                <button
                  type="button"
                  className="andy-mode-toggle node"
                  aria-label="切换安迪模式"
                  aria-pressed={isActive}
                  onPointerDown={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleClick()
                  }}
                >
                  <EleIcon className={cls(preset.icon.basic)}>
                    <Icon name="svg_kanban" />
                  </EleIcon>
                </button>
              </Tip>
            ) : null;
          }),
        },
      })

      // appendStyle(`
      //   .floatview-container[data-mode='andy'] {
      //     label: andy-addon;
      //     width: calc(100% - ${$.nav.width}px);
      //     transition: width 0.3s, left 0.3s;
      //   }
      //   .nav-area.node-foldup ~ .floatview-container[data-mode='andy'] {
      //     label: andy-addon;
      //     width: calc(100% - 20px);
      //     left: 20px !important;
      //     right: auto !important;
      //   }
      // `)
    }
  }

  return { andy: new Andy() }
}
