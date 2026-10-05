import React from 'react'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { MobileEditBarComp } from './MobileEditBarComp'
import { Item, ItemEditor, ItemNode, ItemTransforms, UnitProps } from '../..'

import { PUB_STATES } from '../../hooks/usePubState'

import { mkid } from '../../utils/string/mkid'
import { browser } from '../../utils/browser'
import { ItemWithReminder } from '../DateTool/Reminder/Reminder'
import { StrmapParams, StrmapRuleInfo } from '../Strmap/Strmap'
import { appendStyle } from '@/slate-item/utils/dom/appendStyle'
import { after } from '@/slate-item/engine/helper'
import { removeClass } from '@/slate-item/utils/dom/removeClass'
import { $t } from '@/i18n'
import { MobileZoomInHelper } from './MobileZoomInHelperComp'
import { foldupWithDOM } from '@/slate-item/components/ItemView/FoldupBtn'

export const PUB_KEY_MOBILEBAR = 'mobilebar-context'

const stylesBtn = {
  height: '40px',
  minWidth: '3.2em',
  width: '6.66vw',
}

export type MobileBarContext = {
  item: ItemNode
  itemdom: HTMLElement,
  editor: ItemEditor
  app: App
  ref: React.Ref<React.Component>
}

export type EditorWithHistory = {
  undo: () => void,
  redo: () => void,
} & ItemEditor;

export type MobileBarItem =
  | { order: number; width: number }
  | Pick<UnitProps, 'title' | 'icon' | 'onClick' | 'render'>

export type MobileBarItems = {
  [key: string]: MobileBarItem
}

export function createMobileEditBarAddon({ app, $ }: NewAddonParams) {
  class MobileEditBar implements IAddon {
    app!: App

    config = {}
    mobileEditBarID = mkid()
    originalHeight = 0
    appleKeyboardHeight = 0
    items: MobileBarItems = {}

    addItems(items: MobileBarItems) {
      for (const k in items) {
        const it = items[k] as any
        if (it.onClick) {
          const onClick = it.onClick
          it.onMouseDown = (e: React.MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            onClick(e)
          }
          delete it.onClick
        }
        if (!it.styleOuter && !it.subitems) {
          it.styleOuter = stylesBtn
        }
      }
      Object.assign($.mobileEditBar.items, items)
    }

    createComponent() {
      return MobileEditBarComp
    }

    getContext() {
      return { ...PUB_STATES.get(PUB_KEY_MOBILEBAR), app } as MobileBarContext
    }

    ndiv?: HTMLElement

    addonRun() {
      this.addItems({
        outdent: {
          title: 'Outdent',
          icon: 'svg_arrow_left',
          onClick(e: React.MouseEvent) {
            const { editor, item } = $.mobileEditBar.getContext()
            ItemTransforms.outdentItems(editor, {
              at: item.GetSlPath(),
            })
          },
        },
        indent: {
          title: 'Indent',
          icon: 'svg_arrow_right3',
          onClick(e: React.MouseEvent) {
            const { editor, item } = $.mobileEditBar.getContext()
            ItemTransforms.indentItems(editor, {
              at: item.GetSlPath(),
            })
          },
        },
        zoomin: {
          title: 'Zoom In',
          icon: 'svg_zoomin',
          onClick(e: React.MouseEvent) {
            const { item } = $.mobileEditBar.getContext()
            $.router.to(item);
          },
        },
        fold: {
          title: 'Fold / Unfold',
          icon: 'svg_fold',
          onClick(e: React.MouseEvent) {
            const { editor, item, itemdom } = $.mobileEditBar.getContext()
            foldupWithDOM(item, editor, itemdom)
          },
        },
        moveUp: {
          title: 'Move Up',
          icon: 'svg_upload',
          onClick(e: React.MouseEvent) {
            const { editor } = $.mobileEditBar.getContext()
            ItemTransforms.moveUpItems(editor, { at: editor.itemPath() })
          },
        },
        moveDown: {
          title: 'Move Down',
          icon: 'svg_download',
          onClick(e: React.MouseEvent) {
            const { editor } = $.mobileEditBar.getContext()
            ItemTransforms.moveDownItems(editor, { at: editor.itemPath() })
          },
        },
        trash: {
          title: 'Trash',
          icon: 'svg_trash',
          onClick(e: React.MouseEvent) {
            const { editor } = $.mobileEditBar.getContext()
            editor.itemRemove();
          },
        },
        softbreak: {
          title: 'Softbreak',
          icon: 'svg_paragraph',
          onClick(e: React.MouseEvent) {
            const { editor } = $.mobileEditBar.getContext()
            editor.insertFragment([{ text: '\n' }])
          },
        },
        todo: {
          title: 'Todo',
          icon: 'svg_checkbox',
          onClick(e: React.MouseEvent) {
            const { editor } = $.mobileEditBar.getContext()
            $.checkbox.insertNow(editor);
          },
        },
        reminder: {
          title: 'Reminder',
          icon: 'svg_countdown',
          onClick(e: React.MouseEvent) {
            const { editor } = $.mobileEditBar.getContext()
            $.reminder.autoReminder(editor.item());
          },
        },
        undo: {
          title: 'Undo',
          icon: 'svg_undo',
          onClick(e: React.MouseEvent) {
            const ctx = $.mobileEditBar.getContext();
            (ctx.editor as EditorWithHistory).undo();
          },
        },
        redo: {
          title: 'Redo',
          icon: 'svg_redo',
          onClick(e: React.MouseEvent) {
            const ctx = $.mobileEditBar.getContext();
            (ctx.editor as EditorWithHistory).redo();
          },
        },
        menu: {
          title: 'Node Menu',
          icon: 'svg_menu',
          onClick(e: React.MouseEvent) {
            const { itemdom } = $.mobileEditBar.getContext()
            $.floatMenu.showMenuForDOM(itemdom)
          },
        },
        search: {
          title: 'Search',
          icon: 'svg_search',
          onClick(e: React.MouseEvent) {
            const { editor } = $.mobileEditBar.getContext()
            $.search.showDialog({
              keyword: `under(ky:${editor.item().ky}) `
            });
          },
        },
        bilink: {
          title: '[[]]',
          icon: 'svg_bilink',
          onClick(e: React.MouseEvent) {
            const { editor } = $.mobileEditBar.getContext()
            editor.insertFragment([{ text: '[[' }])
          },
        },
        refer: {
          title: '(())',
          icon: 'svg_refer',
          onClick(e: React.MouseEvent) {
            const { editor } = $.mobileEditBar.getContext()
            editor.insertFragment([{ text: '((' }])
          },
        },
      })

      // 浮层是贴着内容的预览窗：给它留一整屏的底部空白会让短笔记看起来「底下全是空的」。
      // 主视图保留 100vh（滚动尾部留白，方便点空白续写）。
      appendStyle(`.nui-dialog-body .nui-resize-handle {display: none;} section[layout="kanban"] .nui-resize-handle {display: block;} .floatview-zoomer.scrollable > article {padding-bottom: 0;} #${app.appName}-router>div>article>main{padding-bottom: 100vh;}`)
      if (!browser.isMobile) return // 仅在手机上启用编辑工具条
      appendStyle(`@media (max-width: 992px) {.nui-resize-handle {display: none;}}`)
      // $.editorView.addExtraItems({ MobileZoomInHelper })

      const { to } = $.router;
      after(to, ()=>{
        // close sidebar
        const nav = document.querySelector(`#${app.appName}-nav`) as HTMLInputElement;
        nav.classList.remove('trigger-hover')
      })

      let lastWidth = window.visualViewport?.width || 0;
      this.originalHeight = window.visualViewport?.height || 0
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const thisapp: MobileEditBar = this
      screen?.orientation?.addEventListener("change", () => {
        thisapp.originalHeight = window.visualViewport?.height || 0
      });
      window.visualViewport?.addEventListener('resize', (e) => {
        if (lastWidth !== window.visualViewport?.width) {
          thisapp.originalHeight = window.visualViewport?.height || 0
          thisapp.appleKeyboardHeight = 0
          lastWidth = window.visualViewport?.width || 0
        }
        const currentHeight = window.visualViewport?.height || 0
        const ctx = thisapp.getContext()
        if (ctx.ref) {
          const ele = ctx.ref as unknown as HTMLElement
          if (currentHeight < thisapp.originalHeight) {
            ele.style.display = 'block'
            if (browser.isAppleMobile) {
              thisapp.appleKeyboardHeight = thisapp.originalHeight - currentHeight;
              ele.style.bottom = `${thisapp.appleKeyboardHeight}px`
            }
          } else {
            ele.style.display = 'none'
          }
        }
      })

      $.ui.pushComponent(this.createComponent())

      $.main.addMoreExtraCommands({
        forcePC: {
          title: "I'm a PC",
          icon: "svg_switcher",
          order: 1919810,
          onClick() {
            window.location.search="?forcePC=true"
          }
        }
      })

      if((window.navigator as any).virtualKeyboard) {
        const virtualKeyboardApi = (window.navigator as any).virtualKeyboard;
        virtualKeyboardApi.overlaysContent = true;
        virtualKeyboardApi.addEventListener('geometrychange', (e: any) => {
          const ctx = thisapp.getContext();
          const ref = ctx.ref as unknown as HTMLElement;
          const height = virtualKeyboardApi.boundingRect.height ?? 0;
          ref.style.display = height > 0 ? 'block' : 'none';
          if (browser.isAppleMobile) return;
          ref.style.bottom = `${virtualKeyboardApi.boundingRect.height}px`;
        })
      }

      if (browser.isAppleMobile) {
        // softinput compability
        let timer: NodeJS.Timeout | null = null;
        document.addEventListener('scroll', (e)=>{
          function back() {
            timer=null;
            const sel = window.getSelection();
            const editorEle = sel?.anchorNode?.parentElement;
            const bdy = editorEle?.closest('.scrollable')
            if (!bdy) return;
            bdy.scrollTop += (document.documentElement.scrollTop ? (document.documentElement.scrollTop) : 0);
            window.scrollTo({
              behavior:"instant",
              top: 0,
              left: 0,
            });
          }
          timer && clearTimeout(timer);
          timer = setTimeout(back, 50);
        })
      }
    }
  }

  return { mobileEditBar: new MobileEditBar() }
}

