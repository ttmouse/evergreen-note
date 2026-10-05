import React from 'react'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { after, cover } from '../../engine/helper'
import { keyState } from './helper'
import { $t } from '../../../i18n'
import { KyString } from '../../interfaces/unit'
import { FloatDialogProps, FloatViewerProps } from '../FloatViewer/FloatViewer'
import { isEmpty } from '../../utils/isEmpty'
import { RouteToResult } from '../Router/Router'

type ClickInfo = { target: HTMLElement | null; time: number }

const clickInfo: ClickInfo = {} as any

export function createKeyClickAddon({ app, $ }: NewAddonParams) {
  class KeyClick implements IAddon {
    app!: App
    config = {}

    openInDialog(options: FloatViewerProps) {
      $.floatViewer.show(options)
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
            $.floatViewer.show({ item: topicItem, isPin: true })
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
