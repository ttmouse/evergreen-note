/* eslint-disable func-names */

import { cls } from '../../styles'
import { getScrollableParentByCss } from '../../utils/dom/getScrollableParentByCss'
import { getSelectionRect } from '../../utils/dom/getSelectionRect'

/**
 * Fixed
 * 当用户输入文字超出屏幕底部时, 会触发 app-root 区域的滚动, 这是不应该的
 * 不过, 我也没仔细研究为什么这会发生, 所以, 就在这里修复一下.
 * @param ele
 */
export const preventScroll = (ele: HTMLElement) => {
  ele?.addEventListener('scroll', function () {
    ele.scrollTop = 0
  })
}

export function funcKey(e: KeyboardEvent | MouseEvent) {
  return e.shiftKey || e.ctrlKey || e.altKey || e.metaKey
}

/**
 * 当光标超出屏幕底部时, 让页面滚动使得光标可见
 */
export const keepCaretInView = () => {
  document.addEventListener('keydown', function (e) {
    if (funcKey(e)) {
      return
    }
    try {
      const sel = window.getSelection()
      const ele = sel?.anchorNode?.parentElement
      if (sel?.isCollapsed && !ele?.matches('.node *')) {
        return
      }
      const rect = getSelectionRect()
      if (!rect) {
        return
      }
      const diff = rect.bottom + 100 - window.innerHeight
      if (diff > 0) {
        const parent = getScrollableParentByCss(
          document.activeElement as Element
        )
        if (parent) {
          parent.scrollTop += diff
        }
      }
    } catch (err) {
      console.error(err)
    }
  })
}

export function createDOMContainer(appName: string) {
  const container = document.createElement('div') as HTMLDivElement
  container.id = `app-${appName}`
  container.classList.add(
    cls`
      position: fixed;
      width: 100vw;
      height: 100vh;
      top: 0px;
      left: 0px;
      overflow: hidden;
      label: app-container;
    `,
    'app-container'
  )
  document.body.querySelector(':scope > .applications')?.appendChild(container)
  preventScroll(container)
  keepCaretInView()
  return container
}

/**
 * 管理 z-index
 * 将 z-index 分组，不同类型的元素使用不同的 z-index 分组
 * 例如：像浮动工具条的 z-index 为最高，次之是弹窗
 */
export class ZIndexManager {
  groups: { [groupName: string]: number } = {
    dialog: 100000,
    floatBar: 200000,
    snack: 300000,
  }

  register(groupName: string, baseIndex: number) {
    this.groups[groupName] = baseIndex
  }

  lift(groupName: string) {
    if (this.groups[groupName]) {
      this.groups[groupName] += 1
    }
    return this.groups[groupName]
  }
}
