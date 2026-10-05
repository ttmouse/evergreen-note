/* eslint-disable @typescript-eslint/no-use-before-define */
import React from 'react'
import { UnitProps } from '../../interfaces/unit'
import { UnitView } from '../UnitView'
import { EleBody, EleSubitems, mergeProps } from '../Ele'
import { colors, atom, cls } from '../../styles'
import { PartIcon } from '../UnitView/PartIcon'
import { PartOuter, PartExtra } from '../UnitView/Parts'

const rowStyles = [
  {
    extra: cls`
      display: flex;
      justify-content: flex-end;
      align-items: center;
      color: ${colors.iconSystem};
      ${atom.$.space(8).p(4, 8).str()}
    `,

    body: cls`height: 100%;`,
    child: cls`display: flex; height: 100%;`,
  },
]

/**
 * A row element can be splitted into multiple columns
 * @param props
 */
export const UnitRow = (props: UnitProps) => {
  const { body } = props
  return (
    <UnitRowNeedChild {...props}>
      {(body as UnitProps[]).map((subItem) => (
        <UnitColumn {...subItem} />
      ))}
    </UnitRowNeedChild>
  )
}

export const UnitRowNeedChild = (props: Partial<UnitProps>) => {
  const newProps = mergeProps(props, {
    classExtra: rowStyles[0].extra,
    classBody: rowStyles[0].body,
    classChild: rowStyles[0].child,
  })
  const { children } = props

  return (
    <PartOuter {...newProps}>
      <PartIcon {...newProps} />
      <PartExtra {...newProps} />
      <EleBody {...newProps}>
        <EleSubitems {...newProps}>{children}</EleSubitems>
      </EleBody>
    </PartOuter>
  )
}

export const UnitColumn = (props: UnitProps) => {
  return <UnitView {...props} />
}
