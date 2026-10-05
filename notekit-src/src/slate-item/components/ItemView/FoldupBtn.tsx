import React from 'react'
import { Icon } from '../../../components/MaterialIcon'
import { icons } from '../../../components/SvgIcon'
import { useItem } from '../../hooks/useItem'
import { useAddons } from '../../hooks/useAddons'
import { Tip } from '../Tip/Tip'
import { useHookable } from '../../hooks/useApp'
import { useEditor } from '@/slate-item/hooks/useEditor'
import { $t } from '@/i18n'
import { useOriginalItemToolbarDOM } from '@/slate-item/addons/ItemToolbar/useOriginalItemToolbarDOM'
import { ItemDOM } from './ItemView'
import { ItemEditor, ItemNode } from '@/slate-item'

const cssClass = ['tool-item', 'foldup-btn']

export function foldupWithDOM(item: ItemNode, editor: ItemEditor, dom: HTMLElement) {
  // FIXED:
  // As the caret would slip to the left of the node icon,
  // thus, just set the caret's color to be transparent,
  // when restore it when the Click handler's job was done

  setTimeout(() => ((document.body.style as any)['caret-color'] = ''), 600)
  ;(document.body.style as any)['caret-color'] = 'transparent'

  const willFoldup = !item.foldup
  const slPath = item.GetSlPath()
  editor.itemFocus(slPath)

  const itemDom = dom!.closest('.node')! as ItemDOM


  if (
    willFoldup &&
    !editor.itemHasSubitems(slPath) &&
    !itemDom.querySelector('.node-foldable')
  ) {
    return
  }

  // 当前的节点如果子节点比较多时，由于React 会重新渲染，
  // 折叠的响应速度很慢，所以这里先直接操作一下 DOM
  if (itemDom.matches('.node-foldup')) {
    itemDom.classList.remove('node-foldup')
  } else {
    itemDom.classList.add('node-foldup')
  }

  // Foldup or expand the node
  setTimeout(() => {
    item.DoFoldup(willFoldup)
    editor.itemFocus(slPath)
  }, 0)
}

export function FoldupBtn() {
  const item = useItem()
  const editor = useEditor()
  const dom = useOriginalItemToolbarDOM()
  const tip = useHookable('zoomBtnTip', { item }, () => <>Click to Fold / Unfold</>)
  return (
    <Tip
      title={tip}
      interactive={false}
      enterDelay={1000}
      enterNextDelay={1000}
    >
      <div
        className={cssClass.join(' ')}
        onClick={(e) => {
          foldupWithDOM(item, editor, dom!)
        }}
      >
        <Icon name={icons.svg_fold} size={12} />
      </div>
    </Tip>
  )
}
