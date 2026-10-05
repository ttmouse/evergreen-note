/* eslint-disable react/destructuring-assignment */

import React from 'react'
import * as Factory from '..'
import { useDispatchCache } from '../../hooks/useDispatchCache'
import { usePartClassNames } from '../../hooks/usePartClassNames'
import { useReducerUnit } from '../../hooks/useReducerUnit'
import { UnitProps, UnitMode } from '../../interfaces/unit'
import { isEmpty } from '../../utils/isEmpty'
import { EleExtra, EleFoot, EleOuter, mergeProps } from '../Ele'
import { ModeClickFirst } from '../UnitMode'
import { ContextUnitMode } from './UnitViewContexts'
import { mkid, nanoid } from '../../utils/string/mkid'
import { usePubState } from '../../hooks/usePubState'
import { cls } from '@/slate-item/styles'

export const PartExtra = (props: Partial<UnitProps>) => {
  const className = [usePartClassNames(props, 'extra')]
  className.push(props.className)
  className.push(cls`
    align-items: flex-start;
  `)

  return isEmpty(props.extra) ? null : (
    <EleExtra
      classExtra={className.join(' ')}
      id={props.id}
      contentEditable={props.contentEditable}
    >
      <ModeClickFirst>
        {(props.extra as any).map((subProps: Partial<UnitProps>) => {
          const View = subProps.unitType
            ? (Factory as any)[subProps.unitType]
            : Factory.IconItem
          return <View {...subProps} key={mkid()} />
        })}
      </ModeClickFirst>
    </EleExtra>
  )
}

export const PartFoot = (props: Partial<UnitProps>) => {
  const className = usePartClassNames(props, 'foot')
  if (isEmpty(props.foot)) {
    return null
  }
  return (
    <EleFoot classFoot={className}>
      {(props.foot as any).map((subProps: Partial<UnitProps>) => {
        const View = subProps.unitType
          ? (Factory as any)[subProps.unitType]
          : Factory.Btn
        return <View {...subProps} key={mkid()} />
      })}
    </EleFoot>
  )
}

export const PartOuterComp = React.forwardRef(
  (props: Partial<UnitProps>, ref) => {
    const newProps = mergeProps(props, {
      classOuter: usePartClassNames(props, 'node'),
    })
    const { foot } = newProps

    // const [state, dispatch, control] = useReducerUnit({
    //   visible: true,
    //   foldup: false,
    // });

    // useDispatchCache({
    //   id: props.id ?? mkid(),
    //   dispatch,
    //   control,
    // });

    // if (!state.visible) {
    //   return null;
    // }

    const [isFold] = usePubState(newProps.id ?? nanoid(), newProps.foldup)

    if (newProps.foldup) {
      newProps.classOuter ??= ''
      newProps.classOuter += ' node-foldup'
    }

    const view = (
      <EleOuter {...newProps} ref={ref}>
        {newProps.children}
      </EleOuter>
    )

    if (newProps.mode) {
      return (
        <ContextUnitMode.Provider value={newProps.mode as UnitMode}>
          {view}
        </ContextUnitMode.Provider>
      )
    }
    return view
  }
)

export const PartOuter = React.forwardRef((props: Partial<UnitProps>, ref) => {
  const { render, subitems, ...rest } = props
  if (typeof render !== 'undefined') {
    const Comp = render as React.FC<Partial<UnitProps>>
    return <Comp {...rest} />
  }
  return <PartOuterComp {...(props as any)} ref={ref} />
})
