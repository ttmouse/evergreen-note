import React from 'react'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { after, cover } from '../../engine/helper'
import { keyState } from './helper'
import { $t } from '../../../i18n'
import { KyString } from '../../interfaces/unit'
import { FloatDialogProps, FloatViewerProps } from '../FloatViewer/FloatViewer'
import { isEmpty } from '../../utils/isEmpty'
import { RouteToResult } from '../Router/Router'

type ClickInfo = { target: HTMLElement | null; time: number; x: number; y: number }

const clickInfo: ClickInfo = {} as any

export function createKeyClickAddon({ app, $ }: NewAddonParams) {
  class KeyClick implements IAddon {
    app!: App
    config = {}

    openInDialog(options: FloatViewerProps) {
      // 浮层贴着点击点、偏鼠标右侧弹出。Router 的 Cmd+点击分支等入口没有
      // MouseEvent，统一用最近一次 mousedown 的坐标（clickInfo）。
      // tryShowExisting 会复用旧窗口并忽略 SnapProps，所以 show() 之后
      // 必须显式 setPosition，复用旧窗时也重新落位。
      const dialogId = $.floatViewer.show({
        ...options,
        DialogProps: {
          // 笔记预览浮窗是非模态的：showDialog 里 mask 默认 true 会给
          // Router 的 Cmd+点击分支套上 app-modal 黑色蒙层，这里显式关掉
          // （调用方仍可用自己的 mask 覆盖）。
          mask: false,
          ...options.DialogProps,
          SnapProps: {
            ...options.DialogProps?.SnapProps,
            targetBox: {
              left: clickInfo.x,
              top: clickInfo.y,
              width: 0,
              height: 0,
            },
            place: ['right-out', 'middle'],
          },
        },
      })
      const left = Math.min(clickInfo.x + 16, window.innerWidth - 625 - 16)
      const top = Math.min(Math.max(clickInfo.y - 24, 16), window.innerHeight - 160)
      $.dialog.store.setPosition(dialogId, left, top)
      return dialogId
    }

    openInRightSide(ky: KyString) {
      $.extArea.add({
        type: 'topic',
        key: ky,
      })
    }

    getAndyDialogPosition(): number {
      const activeKey = app.states.floatViewerActiveKey
      let index = -1
      if ($.dialog.store.order.length > 0) {
        index = $.dialog.store.order.findIndex((id) => id === activeKey)
      }
      return index + 1
    }

    openInAndyMode(ky: KyString, pos?: number) {
      if (typeof pos !== 'number') {
        pos = $.keyClick.getAndyDialogPosition()
      }
      const path = ky.replace(/^\/|\/$/g, '')
      if (path in $.router.routes) {
        const { title, minWidth, comp: Comp } = $.router.routes[path]
        const props = {
          key: path,
          title,
          body: <Comp inFloatWindow={true} />,
          isPin: true,
        }
        const DialogProps = {} as any
        if (!isEmpty(minWidth)) {
          DialogProps.width = minWidth
        }
        $.floatViewer.showDialog({
          ...props,
          pos,
          DialogProps: {
            ...DialogProps,
            attributes: {
              'dialog-list-mode': 'andy',
            },
          },
        })
      } else $.andy?.open(ky, pos)
    
      if (app.states.floatViewerMode !== 'andy') {
        $.floatViewer.setModeAll('andy', pos+1)
      }
    }

    addonInfo() {
      return {
        title: $t`keyClick.title`,
        quote: $t`keyClick.quote`,
        defaultValue: 'on',
        updated: 2023_06_11,
      }
    }

    addonRun() {
      document.addEventListener('mousedown', (e) => {
        clickInfo.target = e.target as HTMLElement
        clickInfo.time = Date.now()
        clickInfo.x = e.clientX
        clickInfo.y = e.clientY
      })

      // const { scrollToTop } = $.main
      // cover(scrollToTop, () => {
      //   if (!keyState.isPressed('mod')) {
      //     scrollToTop.call($.main)
      //   }
      // })
      const { showDialog } = $.floatViewer;
      cover(showDialog, (props: FloatDialogProps) => {
        if (app.states.floatViewerMode === 'andy' && props?.DialogProps?.attributes?.['dialog-list-mode'] === 'andy' && (typeof props.pos !== 'number')) {
          props = {
            ...props,
            pos: $.keyClick.getAndyDialogPosition(),
          } as FloatDialogProps
        }
        return showDialog.call($.floatViewer, props)
      });

      keyState.startListen()

      // 对链接探测进行处理
      document.addEventListener('mousedown', (e) => {
        const target = e.target as HTMLElement
        if (target.matches('.mark-hint, .mark-hint *')) {
          const hintDom = target.closest('.mark-hint') as HTMLElement
          const topicItem = $.topic.getTopic(hintDom.innerText.trim())
          if (!topicItem) {
            return
          }
          if (keyState.isPressed('mod') && app.isAddonEnabled('floatViewer')) {
            // 浮层贴着点击点、偏鼠标右侧弹出（落位逻辑统一在 openInDialog）。
            $.keyClick.openInDialog({ item: topicItem, isPin: true })
          } else if (keyState.isPressed('shift') && app.isAddonEnabled('main')) {
            $.router.to(topicItem.ky, {}, target)
          } else if (keyState.isPressed('alt') && app.isAddonEnabled('andy')) {
            $.keyClick.openInAndyMode(topicItem.ky)
          }
        }
      })
    }
  }

  return { keyClick: new KeyClick() }
}
