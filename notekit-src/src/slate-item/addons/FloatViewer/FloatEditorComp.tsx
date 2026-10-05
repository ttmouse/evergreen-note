/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react'
import { useAddons } from '../../hooks/useAddons'
import { cls } from '../../styles'
import throttle from 'lodash/fp/throttle'
import './floatViewer.less'
import { FloatViewerProps } from './FloatViewer'
import { Item } from '@/slate-item'
import { useApp } from '@/slate-item/hooks/useApp'
import { atLater } from '@/slate-item/utils/atLater'
import { runInAction } from 'mobx'
import { showSnack } from '@/slate-item/utils/msg/showSnack'

export type ZoomInEvent = CustomEvent<string>

const setStyle = throttle(100, (el: HTMLElement) => {
  const { scrollTop } = el
  const t = el.parentElement!.querySelector('.dialog-title') as HTMLElement
  if (t) {
    if (scrollTop > 40) {
      t.style.opacity = '1'
    } else {
      t.style.opacity = '0'
    }
  }
})

export function useScrollDialogTitle(ref: React.RefObject<HTMLElement>) {
  React.useEffect(() => {
    ref.current?.closest('.dialog-body')?.addEventListener('scroll', (e) => {
      // get the scroll position of the dialog body
      const el = e.target as HTMLElement
      setStyle(el)
    })
  }, [])
}

export function FloatViewerComp(props: FloatViewerProps) {
  const $ = useAddons()
  const app = useApp()
  const { editorProps = {}, onItemMounted } = props

  let { item } = props
  if (typeof item === 'string') {
    item = $.dbMemory.getItem(item, { isRecur: true })
  }
  const [hookedItem, setHookedItem] = React.useState(item);

  const EditorComponent = $.editorView.createComponent()
  const ref = React.useRef<HTMLDivElement>(null)
  let dialog: HTMLDivElement | null = null;
  
  // 滚动位置记录对象
  const scrollPositions = React.useRef<Record<string, number>>({});

  // 使用 useCallback 来处理 zoomIn 事件，避免在 useEffect 中直接调用 setHookedItem
  const handleZoomIn = React.useCallback((e: Event) => {
    const isPDF = ref.current?.closest('.pdfreader-wrap')

    const qitem = $.dbMemory.getItem((e as ZoomInEvent).detail, { isRecur: true })
    if (props.limitZoomInUnderKy) {
      if (qitem.ky !== props.limitZoomInUnderKy && !qitem.path.includes(props.limitZoomInUnderKy)) {
        $.floatViewer.show({item: qitem, isPin: true, DialogProps: {
          attributes: {
            'dialog-list-mode': app.states.floatViewerMode,
          },
        }})
        return
      }
    }

    const dialogBody = (isPDF ? ref.current : ref.current?.closest('.nui-dialog-body')) as HTMLElement
    scrollPositions.current[hookedItem.ky] = dialogBody?.scrollTop || 0
    setHookedItem(qitem)
    
    // 恢复新节点的滚动位置
    atLater(()=>{
      const savedScrollTop = scrollPositions.current[qitem.ky] || 0
      if (dialogBody) {
        $.router.scrollWithBack(dialogBody, savedScrollTop);
      }
    }, 'recover-scroll-'+qitem.ky, 0)

    if (isPDF) return;

    if (!dialog) dialog = document.querySelector(`.dialog-float-viewer[data-rendered="${hookedItem.ky}"]`) as HTMLDivElement
    if (!dialog) return;
    
    const content = Item.headString(qitem, { parseRefer: true }) || 'Untitled';
    dialog.title = content;
    dialog.setAttribute("data-rendered", qitem.ky);
    const title = dialog.querySelector('.nui-dialog-title.node-text');
    if (title) title.innerHTML = content;
    const floatViewerInfo = app.states.floatViewerList.find(i => i.dialogId === dialog?.id);
    if (floatViewerInfo) {
      runInAction(() => {
        floatViewerInfo.key = qitem.ky;
        floatViewerInfo.title = content;
      })
    }
  }, [hookedItem.ky, item.ky, $, app.states.floatViewerList])

  // 组件挂载时的初始化逻辑
  React.useEffect(() => {
    if (onItemMounted) {
      onItemMounted({ item: editorProps.item, container: ref.current } as any)
    }
  }, [onItemMounted, editorProps.item])

  // 事件监听器的设置和清理
  React.useEffect(() => {
    const element = ref.current
    if (!element) return

    element.addEventListener('zoomIn', handleZoomIn)

    return () => {
      element.removeEventListener('zoomIn', handleZoomIn)
    }
  }, [handleZoomIn])

  useScrollDialogTitle(ref)

  return (
    <div ref={ref} className={[cls`min-width: 200px;`, "floatview-zoomer", "scrollable"].join(' ')}>
      <EditorComponent crumbsVisible item={hookedItem} {...editorProps} />
    </div>
  )
}
