/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
import React from 'react'
import { DEBUG_MODE, IS_CLIENT } from '../../../main'
import { cls } from '../../styles'
import { InlineOuterComp } from '../Inlines/InlineOuterComp'
import { ImgElement } from './Img'
import { appendStyle } from '../../utils/dom/appendStyle'
import { useAddons } from '../../hooks/useAddons'
import { useEditor } from '../../hooks/useEditor'
import { useItem } from '../../hooks/useItem'
import { showGlobalImageModal } from '../../../components/GlobalModal/GlobalModal'

import { ElementComponentProps } from '../EditorView/EditorView'
import { usePubState } from '../../hooks/usePubState'
import { ROUTE_KEY } from '../Router/Router'
import { isEmpty } from '../../utils/isEmpty'
import {
  ResizeBox,
  ResizeParams,
} from '../../notekit-ui/components/Dialog/ResizeHelper'
import { atLater } from '../../utils/atLater'
import { browser } from '@/slate-item/utils/browser'

appendStyle(`
  .node.node-with-img {
    align-items: flex-start;
  }

  .element-img {
    display: inline-flex;
    align-items: center;
    height: max-content !important;
    height: max-content !important;
  }

  .element-img *:not(img) {
    height: max-content !important;
    width: max-content !important;
  }

  .element-img .inline-rect {
    width: auto;
  }
`)

const imgStyle = cls`
  border: 1px solid var(--cl-slate-200);
  border-radius: 4px;
  display: block;
  cursor: zoom-in;
`

appendStyle(cls`
  .node-foldup .node-text .element-img {
    &,
    img,
    [contenteditable],
    .react-resizable {
      max-width: 150px;
      height: auto !important;
    }
  }
`)

export function ImgComp(props: {
  href?: string
  src: string
  width?: number
  height?: number
  iky: string
  alt?: string
  saveResize?: (iky: string, size: { width: number; height: number }) => void
}) {
  const { href, src, width = 0, height = 0, iky, alt, saveResize } = props
  const imgRef = React.useRef<HTMLImageElement>(null)

  const handleModalOpen = () => {
    if (!isEmpty(href)) {
      // window.open(href, '_blank')
    } else {
      // 使用全局 Modal
      showGlobalImageModal(theSrc, alt)
    }
  }

  let linkProps = { href } as any
  if (isEmpty(href)) {
    if (href?.startsWith('re:')) {
      linkProps = {
        href,
      }
    } else if (href?.includes(':')) {
      linkProps = {
        href,
        target: '_blank',
        rel: 'noreferrer',
      }
    }
  }

  // src 存的是服务端逻辑路径（如 data/images/x.png）。页面挂在 /static/ 下，
  // 相对解析会变成 /static/data/images/... —— 命中 SPA 回退拿到 200 的 HTML，
  // 破图且无 404 可查。这里补成绝对路径才能真正命中 server 的静态路由。
  const theSrc = src.startsWith('data/') || src.startsWith('files/') ? `/${src}` : src

  // const { width = 0, height = 0, iky } = element
  const [size, setSize] = usePubState(`imgsize-${iky}`, {
    width,
    height,
  })
  const ratio = React.useRef(1)

  const onLoad = React.useCallback(
    (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
      const el = e.target as HTMLImageElement
      ratio.current = el.naturalHeight / el.naturalWidth
      // Elements without an explicit width include older pasted Retina images.
      // Recalculate their logical size on load so stale in-memory sizes do not
      // keep them at the full device-pixel dimensions.
      const scale = Math.max(1, window.devicePixelRatio || 1)
      const w = width > 0 ? size.width || width : el.naturalWidth / scale
      setSize({ width: w, height: ratio.current * w })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const onResize = (e: any, data: ResizeParams) => {
    const w = Math.round(data.size.width)
    const nextSize = { width: w, height: Math.round(w * ratio.current) }
    setSize(nextSize)
    atLater(() => {
      saveResize?.(iky, nextSize)
    }, 'saveResize')
  }

  return (
    <a {...linkProps}>
      <ResizeBox
        onResize={onResize}
        width={size.width}
        height={size.height ?? size.width * ratio.current}
        min={{ width: 20 }}
      >
        <img
          ref={imgRef}
          onLoad={onLoad}
          src={theSrc}
          alt={alt}
          onClick={handleModalOpen}
          style={{
            width: size.width > 0 ? `${size.width}px` : 'auto',
            height: 'auto',
            minWidth: '1vw',
          }}
          className={[imgStyle, 'picture'].join(' ')}
        />
      </ResizeBox>
    </a>
  )
}

export function ImgElementComponent(props: ElementComponentProps<ImgElement>) {
  const { inlines } = useAddons()
  const { element, attributes, children } = props
  const { src, alt }: ImgElement = element as any
  const editor = useEditor()
  const item = useItem()

  const inner = (
    <ImgComp
      {...element}
      saveResize={(iky, size) => {
        inlines.setProps(editor, item.GetSlPath(), {
          ...size,
          iky,
        } as any)
      }}
    />
  )

  return (
    <InlineOuterComp
      className="node-foldable"
      cssInlineBlock
      inner={inner}
      {...props}
    />
  )
}
