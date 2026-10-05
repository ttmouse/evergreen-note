import React from 'react'
import { ContextItem } from './ItemView'
import { cls, preset } from '../../styles'
import { isEmpty } from '../../utils/isEmpty'
import { EleBody, EleExtra, EleIcon, EleOuter, EleSubitems } from '../Ele'
import { UnitProps } from '../../interfaces/unit'
import { Icon } from '../../../components/MaterialIcon'
import { PartOuter } from '../UnitView/Parts'
import { FeatureItem } from '../../addons/EditorView/EditorView'
import { useEditor } from '../../hooks/useEditor'
import { Item, ItemNode } from '../..'

const extraStyle = cls`
  &:not(:empty) {
    float: right;
    position: relative;
    top: calc(50% - 12px);
    z-index: 10;
    margin-left: 12px;
    display: inline-flex;
    /* Auxiliary actions share the existing 24px icon slot. Inline SVG
       descenders and reminder chips must not determine the text row height. */
    height: 24px;
    align-items: center;
  }

  & + .node-text {
    /* text-align: justify; */
  }

  > .node {
    margin-left: 4px;
    flex-basis: 24px;
    width: 24px;
    height: 24px;
  }
`

export function Extra(props: {
  item: ItemNode
  subitems: { [k: string]: FeatureItem }
}) {
  const { subitems, item } = props
  const editor = useEditor()
  if (item.status && item.status < 0) {
    return (
      <EleExtra contentEditable={false} classExtra={extraStyle}>
        <EleOuter>
          <EleIcon>
            <Icon name="svg_trash" size={14} />
          </EleIcon>
        </EleOuter>
      </EleExtra>
    )
  }
  return isEmpty(subitems) ? null : (
    <EleExtra contentEditable={false} classExtra={extraStyle}>
      {Object.entries(subitems).map(([k, v]) => {
        if ('cond' in v && !(v as any).cond({ item, editor })) {
          return null
        }
        if (
          typeof v === 'object' &&
          '$$typeof' in v === false // mobx observable
        ) {
          v = <PartOuter ctxItem={item} {...v} />
        }
        const Comp = v as any
        return <Comp ctxItem={item} key={k} />
      })}
    </EleExtra>
  )
}

export const MemoizedExtra = React.memo(Extra)

export const FeatureIcon = (props: Partial<UnitProps>) => {
  const { icon, children, ...rest } = props
  return (
    <EleOuter {...rest}>
      <EleIcon classIcon={cls(preset.icon.basic)}>
        <Icon name={icon!} />
      </EleIcon>
      {isEmpty(children) ? null : (
        <EleBody>
          <EleSubitems>{children}</EleSubitems>
        </EleBody>
      )}
    </EleOuter>
  )
}
