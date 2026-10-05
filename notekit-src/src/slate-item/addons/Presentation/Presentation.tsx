import React from 'react'
import { icons } from '../../../components/SvgIcon'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { ItemNode } from '../../interfaces/item'
import { KyString } from '../../interfaces/unit'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { appendStyle } from '@/slate-item/utils/dom/appendStyle'
import { showSnack } from '@/slate-item/utils/msg/showSnack'
import { browser } from '@/slate-item/utils/browser'
import { keys } from 'lodash'

export function createPresentationAddon({ app, $ }: NewAddonParams) {
  class Presentation implements IAddon {
    app!: App
    config = {}

    toKy(ky: KyString) {
      $.router.to(ky);
    }

    createPresentationComponent() {
      return <div id='presentation-controller'>
        <button onClick={() => {$.presentation.handleLeft()}}>⬅️</button>
        <button onClick={() => {$.presentation.handleUp()}}>⬆️</button>
        <button onClick={() => {$.presentation.handleDown()}}>⬇️</button>
        <button onClick={() => {$.presentation.handleRight()}}>➡️</button>
      </div>
    }

    handleUp() {
      const t = document.querySelector(`#${app.appName}-router *:not(.embed-container)>.editor-view>main>.item-editor>section:nth-child(1)`);
      const topItem = (t as any)?.$item as ItemNode;
      if(!topItem.pky || topItem.pky === "-") return;
      const parentPersist = $.dbMemory.getItem(topItem.pky, { isRecur: true, maxDepth: 1 });
      if (!parentPersist || !parentPersist.subitems) return;
      const subitems = parentPersist.subitems as UnitPersist[];
      let idx = subitems.findIndex(i => i.ky === topItem.ky);
      if (idx === -1) return;
      idx = idx - 1;
      if (idx < 0) {
        showSnack({
          severity: "info",
          content: "Backed to parent node",
          autoClose: 800,
          clickAway: true
        })
        $.presentation.handleLeft();
        return;
      }
      if (subitems[idx]) $.presentation.toKy(subitems[idx].ky);
    }

    handleDown() {
      const t = document.querySelector(`#${app.appName}-router *:not(.embed-container)>.editor-view>main>.item-editor>section:nth-child(1)`);
      const topItem = (t as any)?.$item as ItemNode;
      if(!topItem.pky || topItem.pky === "-") return;
      const parentPersist = $.dbMemory.getItem(topItem.pky, { isRecur: true, maxDepth: 1 });
      if (!parentPersist || !parentPersist.subitems) return;
      const subitems = parentPersist.subitems as UnitPersist[];
      let idx = subitems.findIndex(i => i.ky === topItem.ky);
      if (idx === -1) return;
      idx = idx + 1;
      if (idx >= subitems.length) {
        showSnack({
          severity: "info",
          content: "Backed to parent node",
          autoClose: 800,
          clickAway: true
        })
        $.presentation.handleLeft();
        return;
      }
      if (subitems[idx]) $.presentation.toKy(subitems[idx].ky);
    }

    handleLeft() {
      const t = document.querySelector(`#${app.appName}-router *:not(.embed-container)>.editor-view>main>.item-editor>section:nth-child(1)`);
      const topItem = (t as any)?.$item as ItemNode;
      if(!topItem.pky || topItem.pky === "-") return;
      const parentPersist = $.dbMemory.getItem(topItem.pky);
      if (!parentPersist) return;
      $.presentation.toKy(parentPersist.ky);
    }

    handleRight() {
      const t = document.querySelector(`#${app.appName}-router *:not(.embed-container)>.editor-view>main>.item-editor>section:nth-child(1)`);
      const topItem = (t as any)?.$item as ItemNode;
      const itemPersist = $.dbMemory.getItem(topItem.ky, { isRecur: true, maxDepth: 1 });
      const subitems = itemPersist.subitems as UnitPersist[];
      if (!subitems) return;
      if (subitems[0]) $.presentation.toKy(subitems[0].ky);
      return;
    }

    addonRun() {
      appendStyle(`
        /*#EvergreenNote-router.presentation-mode *:not(.embed-container)>.editor-view>main>.item-editor>section:nth-child(1) > .node-head {
          font-size: 2em !important;
        }*/

        #presentation-controller {
          position: fixed;
          bottom: 1.2em;
          right: 0;
          width: fit-content;
          height: 1em;
          display: none;
          z-index: 60000;
          opacity: 0.1;
          transition: opacity 0.5s;
        }
        
        #presentation-controller:hover {
          opacity: 1.0;
        }

        #presentation-controller button {
          margin: 0 .5em;
          background: none;
          font-size: 1.5em;
        }
      `)
      $.ui.pushComponent($.presentation.createPresentationComponent);
      const keydownListener = (e: KeyboardEvent) => {
        if (!document.fullscreenElement) return;
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          $.presentation.handleUp();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          $.presentation.handleDown();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          $.presentation.handleLeft();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          $.presentation.handleRight();
        }
      };
      $.main.addMoreExtraCommands({
        presentation: {
          title: 'Presentation Mode',
          icon: icons.svg_zoomin,
          order: 999999,
          onClick: () => {
            $.nav.setFoldupState(true);
            document.documentElement.requestFullscreen();
            const router = document.querySelector(`#${app.appName}-router`) as HTMLDivElement;
            router.classList.add("presentation-mode");
            //document.body.style.zoom = "2";
            const pc = document.querySelector("#presentation-controller") as HTMLDivElement;
            
            pc.style.display = "block";

            // 我们全局监听快捷键，直接用上下左右，方便使用翻页笔
            document.addEventListener('keydown', keydownListener);
          }
        }
      })
      document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
          $.nav.setFoldupState(false);
          //document.body.style.zoom = "1";
          const router = document.querySelector(`#${app.appName}-router`) as HTMLDivElement;
          router.classList.remove("presentation-mode");
          const pc = document.querySelector("#presentation-controller") as HTMLDivElement;
          pc.style.display = "none";

          document.removeEventListener('keydown', keydownListener);
        }
      });
    }
  }

  return { presentation: new Presentation() }
}
