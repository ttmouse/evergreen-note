import React from 'react'
import { useAddons } from '../../hooks/useAddons'
import { useEditor } from '../../hooks/useEditor'
import { cls, preset } from '../../styles'
import { trim } from '../../utils/string/trim'
import { ElementComponentProps } from '../EditorView/EditorView'
import { BilinkElement } from './Bilink'
import { nodeString } from '../../utils/string/nodeString'
import { Tip } from '../../components/Tip/Tip'
import { observer } from 'mobx-react'
import { useSelected, useFocused } from '../../slate.inc'

const bilinkStyle = cls`
  ${preset.link.basic};

  &:hover {
    text-decoration: underline;
  }
`

const bracketStyle = cls`
  &::before {
    content: '[[';
    color: var(--cl-slate-300);
  }
  &::after {
    content: ']]';
    color: var(--cl-slate-300);
  }
`

export const BilinkElementComp = observer(
  (props: ElementComponentProps<BilinkElement>) => {
    const $ = useAddons()
    const editor = useEditor()
    const selected = useSelected()
    const focused = useFocused()
    const { attributes, children, element } = props
    const topicTitle = trim($.bilink.string(element as any))
    const topicItem = $.topic.getTopic(topicTitle)
    const classList = [bilinkStyle, 'bilink']
    if (
      $.prefer.getValue('bilinkBracketVisible') === true ||
      (selected && focused)
    ) {
      classList.push(bracketStyle)
    }
    if (topicItem) {
      classList.push('bilink-created')
    }
    const comp = (
      <span
        data-topic={topicTitle}
        className={classList.join(' ')}
        onClick={(e: React.MouseEvent) => {
          $.bilink.handleClick(e.nativeEvent, { topicTitle, element, editor })
        }}
        {...attributes}
      >
        {children}
      </span>
    )

    if (element.topic && element.topic !== nodeString(element)) {
      return <Tip title={element.topic}>{comp}</Tip>
    }

    return comp
  }
)
