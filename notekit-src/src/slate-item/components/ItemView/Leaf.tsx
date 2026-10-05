import React from 'react'
import { SvgIcon } from '../../../components/SvgIcon'
import { domSelect } from '../../addons/EditorView/helper'
import { useEditor } from '../../hooks/useEditor'
import { cls, colorBase } from '../../styles'
import { isEmpty } from '../../utils/isEmpty'
import { omit } from '../../utils/object/omit'
import { prefixEachProp } from '../../utils/object/prefixEachProp'
import { useOnceDetect } from '../../addons/Hint/useOnceDetect'
import { Tip } from '../Tip/Tip'

const leafNoteStyle = cls`
  cursor: pointer;
  transition: color 0.2s ease-in-out;

  &:hover {
    color: ${[colorBase.primary, 500]};
  }
`
const noteInnerStyle = cls`
  display: none;
`

function useLeafClass(
  leaf: any,
  ref: React.RefObject<HTMLElement>,
  classList: string[]
) {
  React.useEffect(() => {
    if (!ref.current) {
      return
    }
    const el = ref.current.closest('[data-slate-node]')
    if (leaf.text.length < 1) {
      el!.classList.add('leaf-empty')
      el!.previousElementSibling?.classList.add('next-leaf-empty')
    } else {
      el!.classList.remove('leaf-empty')
      el!.previousElementSibling?.classList.remove('next-leaf-empty')
    }
    el?.classList.add(...classList)
  })
}

export function Leaf(props: any) {
  const { attributes, children, leaf } = props
  const ref = React.useRef<HTMLElement>(null)

  useOnceDetect(leaf, ref)

  const classList: string[] = []
  let hasMark = false
  for (const [markKey, val] of Object.entries(leaf)) {
    if (markKey !== 'text' && val) {
      classList.push(`mark-${markKey}`)
      hasMark = true
      if (markKey === 'hint') {
        attributes['data-hint'] = leaf.text
      }
    }
  }
  if (classList.length > 0) {
    classList.push('has-mark')
  }

  useLeafClass(leaf, ref, [])

  Object.assign(attributes, prefixEachProp(omit(leaf, ['text']), 'data-mark-'))

  const editor = useEditor()
  const onDoubleClick = (e: React.MouseEvent) => {
    if (hasMark) {
      e.preventDefault()
      domSelect(editor as any, ref.current!)
    }
  }

  const attr = { ...attributes }
  if (leaf.refFrom) {
    attr.contentEditable = false
  }

  return (
    <span
      ref={ref}
      {...attr}
      className={classList.join(' ')}
      onDoubleClick={onDoubleClick}
      ref-from={leaf.refFrom}
    >
      {children}
      {!isEmpty(leaf.note) && (
        <Tip title={leaf.note}>
          <span
            className={[leafNoteStyle, 'data-leaf-note'].join(' ')}
            contentEditable={false}
            data-slate-string
          >
            <SvgIcon name="svg_info" width={14} height={14} />
            <span className={[noteInnerStyle, 'data-note-inner'].join(' ')}>
              {leaf.note}
            </span>
          </span>
        </Tip>
      )}
    </span>
  )
}
