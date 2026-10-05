/* eslint-disable react/no-unknown-property */
import React from 'react'
import { EDITOR_INVOKER, ElementComponentProps } from '../EditorView/EditorView'
import { useAddons } from '../../hooks/useAddons'
import { cls, colorBase, preColor, px } from '../../styles'
import { useEditor } from '../../hooks/useEditor'
import { isEmpty } from '../../utils/isEmpty'
import { ReferElement } from './Refer'
import {
  ContextEditorInline,
} from '../EditorView/EditorViewContexts'
import { ErrorMsg } from '../../components/ErrorMsg/ErrorMsg'
import { useItem } from '../../hooks/useItem'
import { Item } from '../../interfaces/item'
import { omit } from '../../utils/object/omit'

const inlineModeStyle = [
  cls`
  display: inline;
  /* pointer-events: none; */

  & *:not(.mark-bold):not(.inline-rect .katex *):not(.counter-comp):not([aria-hidden="true"]) {
    display: inline !important;
    padding-bottom: 0 !important;
    padding-left: 0px !important;
    font-weight: inherit !important;
    font-size: inherit !important;

    .node-btn {
      display: none !important;
    }

    .node-extra {
      display: none !important;
    }
  }

  & .node .node-head .node-quote {
    display: none !important;
  }

  .element-latex .inline-rect > span {
    border-bottom: 1px solid var(--cl-slate-300);
  }

  & .node .crumbs-item {
    font-size: 12px !important;
  }
  .editor-view {
    padding-right: 0 !important;
  }
  `,
  'inline-content',
]

const blockModeStyle = [
  cls`
    border: 1px solid var(--cl-slate-300);
    border-radius: 4px;
    display: block;
    cursor: pointer;
    transition: all 0.2s ease-in-out;

    &:hover {
      border-color: ${[colorBase.blue, 500]};
    }
  `,
  'inline-content',
]

const editorProps = {
  fromRouter: false,
  moreComponentVisible: false,
  bodyVisible: false,
}

/**
 * 镜像必须是只读编辑器。
 *
 * 只读 = Slate Editable 渲染 contentEditable="false"（slate-react: contentEditable: !readOnly）。
 * 否则镜像内部会存在第二个 contenteditable="true" 的编辑宿主：Chrome 允许在
 * contentEditable="false" 祖先内部重新开启可编辑区，光标（鼠标点击、方向键落点、
 * 跨行按 ↓）就会跑进引用中间，之后 ↑/↓ 只能在这个嵌套编辑器内部打转甚至完全不动，
 * 打字也被吞掉。引用处只显示源块内容、不可直接编辑，因此镜像保持只读。
 */
const mirrorEditorProps = {
  ...editorProps,
  readOnly: true,
}

export function ReferEditorComp(props: { targetItem: UnitPersist }) {
  const { editorView } = useAddons()
  const ref = React.useRef<HTMLDivElement>(null)
  const { targetItem } = props
  targetItem.$isRefer = true

  const memo = React.useMemo(() => {
    const EditorComponent = editorView.createComponent()

    // 检查节点的内容是否包含如下元素：图片、代码块、嵌入块、嵌入网页
    // IMPORTANT: 此处将图片展示为了inline，可能出现问题 请观察
    const blocks = ['codeblock', 'embed', 'embedweb', 'src', 'mdTable', 'mermaid']
    const hasBlock = (targetItem.leaves ?? []).some((leaf) =>
      blocks.includes((leaf as any).blockType)
    )
    const style = hasBlock ? blockModeStyle : inlineModeStyle

    return (
      <span ref={ref} className={style.join(' ')}>
        <ContextEditorInline.Provider value>
          <EditorComponent
            invoker={EDITOR_INVOKER.BLOCK_REF}
            item={targetItem}
            {...mirrorEditorProps}
          />
        </ContextEditorInline.Provider>
      </span>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetItem.ky])

  return <>{memo}</>
}

const referLinkClass = cls`
  display: inline;
  color: inherit;
  text-decoration: none;

  .node-tools,.node-extra {
    display: none !important;
    visibility: hidden;
  }

  & span[data-slate-string] {
    border-bottom: 1px solid var(--cl-slate-300);
    padding-bottom: 2px;
    cursor: alias;
    transition: 0.1s all;
  }
  &:hover span[data-slate-string] {
    //color: ${preColor.primary};
    border-bottom: 1px solid ${preColor.primary};
  }
`

const referTextStyle = cls`
  display: inline;
  & + span[data-slate-node]:not(.refer-text) {
    padding-left: 1px;
  }
`

// Keep Slate's source children mounted for selection, but never let them leak
// into the preview that renders the referenced item separately.
const referSourceTextStyle = cls`
  display: none !important;
`

/**
 * 块引用 = 源块的只读镜像（对齐 Roam Research）。
 *
 * 没有可编辑别名、没有编辑/预览双态：引用处永远显示源块内容且不可直接编辑，
 * 点击跳转到源块修改，改完全部引用处自动同步。Slate 的源 children 仍挂载在
 * 隐藏 span 里以满足渲染协议，但不参与显示。
 */
export function ReferComp(props: ElementComponentProps<ReferElement>) {
  const $ = useAddons()
  const { element, attributes, children } = props
  const referElement: ReferElement = element as any
  const editor = useEditor()
  const editorInline = React.useContext(ContextEditorInline)
  const refky = referElement.refky ?? referElement.value
  const ref = React.useRef<HTMLDivElement>(null)
  const ctxItem = useItem()
  const targetItem = $.editorView.getItem(referElement.value, editorProps)
  React.useEffect(() => {
    if (isEmpty(editorInline)) {
      if (isEmpty(targetItem)) return;
      const onClick = (e: MouseEvent) => {
        if (e.button !== 0) return
        // eslint-disable-next-line prettier/prettier
        if ((e.target as HTMLElement).matches('.element-bilink *,.element-bilink')) {
          return
        }
        e.preventDefault()
        $.refer.route({ ky: refky }, {}, ctxItem.GetEditor())
      }
      const dom = ref.current
      dom?.addEventListener('mousedown', onClick, true)
      return () => {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        dom?.removeEventListener('mousedown', onClick, true)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, element, editorInline, targetItem, refky, ctxItem, $])

  const styleClass = [referLinkClass]

  if (ctxItem.ky === refky) {
    return <ErrorMsg>Can not recursively reference: (({refky}))</ErrorMsg>
  }

  if (isEmpty(targetItem)) {
    styleClass.push(cls`color: ${preColor.danger}; border: .1em solid ${preColor.danger}; padding: .1em;`)
    return <span {...attributes} className={`${referTextStyle} refer-text`}>
      <span className={referSourceTextStyle} aria-hidden="true">{children}</span>
      <span data-ky={refky} item-ky={refky} contentEditable={false}>
        <div ref={ref} className={styleClass.join(' ')}>
          Cannot find reference: {refky}
        </div>
      </span>
    </span>
  }

  return (
    <span {...attributes} className={`${referTextStyle} refer-text`}>
      <span className={referSourceTextStyle} aria-hidden="true">{children}</span>
      <span data-ky={refky} item-ky={refky} contentEditable={false}>
        <div ref={ref} className={styleClass.join(' ')}>
          <ReferEditorComp targetItem={omit(targetItem, ['subitems'])} />
        </div>
      </span>
    </span>
  )
}
