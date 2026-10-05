import { $t } from '../../../i18n'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { createDOMElement } from '../../utils/dom/createDOMElement'
import './path-highlight.less'
import { isVisible } from '../../utils/dom/isVisible'

function getRect(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  return {
    left: rect.left + window.scrollX,
    top: rect.top + window.scrollY,
    width: rect.width,
    height: rect.height,
  }
}

export function createPathHighlightAddon({ app, $ }: NewAddonParams) {
  class PathHighlight implements IAddon {
    app!: App
    config = {}

    elements: HTMLElement[] = []
    itemDoms: HTMLElement[] = []

    draw(itemDom: HTMLElement) {
      $.pathHighlight.remove()
      const btnDom = itemDom.querySelector('.node-tools') as HTMLElement
      if (!btnDom) {
        return
      }
      btnDom.style.position = 'relative'
      const rects = [getRect(btnDom)]

      let topDom = itemDom.closest('.node-top')
      if (!topDom) {
        return
      }

      if (topDom.matches('.node-layout-result-container')) {
        topDom = btnDom.closest('.node-layout-item-group') as HTMLElement
      }

      itemDom.classList.add('node-path-highlight')
      this.itemDoms.push(itemDom)

      // iterate the parent element of itemDom
      let parent = itemDom
      for (let i = 0; i < 20; i++) {
        parent = parent.parentElement!.closest(
          `[id='${topDom.id}'] .note-block`
        ) as HTMLElement
        if (!parent) {
          break
        }
        const parentBtnDom = parent.querySelector(
          ':scope > .node-tools'
        )! as HTMLElement
        if (isVisible(parentBtnDom)) {
          rects.push(getRect(parentBtnDom))
          parent.classList.add('node-path-highlight')
          this.itemDoms.push(parent)
        }
      }

      for (let i = 1; i < rects.length; i++) {
        const h = i === 1 ? 1 : 0
        const w = i === 1 ? 10 : 0
        const el = createDOMElement('', 'div', {
          style: `
            width: ${rects[i - 1].left - rects[i].left - w}px;
            height: ${rects[i - 1].top - rects[i].top + h}px;
            top: ${rects[i].top - rects[0].top + rects[0].height / 2}px;
            left: ${rects[i].left - rects[0].left + rects[0].width / 2}px;
            z-index: 10000;
            position: absolute;
          `,
          class: `path-highlight path-highlight-${i}`,
        })

        btnDom.appendChild(el)
        this.elements.push(el)
      }
    }

    remove() {
      for (const el of this.elements) {
        el.remove()
      }
      this.elements = []
      for (const itemDom of this.itemDoms) {
        itemDom.classList.remove('node-path-highlight')
      }
    }

    addonInfo() {
      return {
        title: $t`pathHighlight.title`,
        quote: $t`pathHighlight.quote`,
        defaultValue: 'off',
        updated: 2022_12_05,
      }
    }

    addonRun() {
      // pub.on(pub.evt.itemFocus, ({ item }) => {
      //   const itemDom = document.getElementById(item.$id);
      //   if (itemDom) {
      //     $.pathHighlight.doIt(itemDom);
      //   }
      // });

      // pub.on(pub.evt.itemBlur, () => {
      //   $.pathHighlight.remove();
      // });

      let lastEl: HTMLElement | null = null
      document.addEventListener('selectionchange', () => {
        const sel = window.getSelection()
        const el = sel?.focusNode?.parentElement?.closest('.node')
        if (el && lastEl !== el) {
          lastEl = el as HTMLElement
          $.pathHighlight.draw(lastEl)
        }
      })
    }
  }

  return { pathHighlight: new PathHighlight() }
}
