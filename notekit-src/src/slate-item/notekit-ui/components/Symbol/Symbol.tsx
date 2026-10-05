import React from 'react'
import { ATOMIC_CLASS_MAP, Brick, BrickProps } from '../Brick/Brick'
import { SvgIconName } from '../../../../components/SvgIcon'
import { Icon } from '../../../../components/MaterialIcon'
import './Symbol.less'

export enum SYMBOL_SIZE {
  XS = 20,
  SM = 30,
  MD = 40,
  LG = 50,
  XL = 60,
}

export type SymbolProps = BrickProps & {
  icon: SvgIconName
  size: SYMBOL_SIZE
  color?:
    | 'info'
    | 'success'
    | 'warning'
    | 'error'
    | 'primary'
    | 'secondary'
    | 'default'
}
export const SYMBOL_CLASS_MAP = {
  ...ATOMIC_CLASS_MAP,
  outer: 'nui-symbol',
}

export const Symbol = React.forwardRef(
  (props: SymbolProps, ref: React.ForwardedRef<HTMLElement>) => {
    const { icon, size = SYMBOL_SIZE.XS, color, cssClass = [], ...rest } = props
    const iconComp = <Icon name={icon} size={size} />
    color && cssClass.push(`nui-symbol-${color}`)
    return (
      <Brick
        {...rest}
        type="nui-symbol"
        partClasses={SYMBOL_CLASS_MAP}
        ref={ref}
        cssClass={cssClass}
        icon={iconComp}
      />
    )
  }
)

export type SymbolListProps = BrickProps & {
  subitems: SymbolProps[]
}

export const SymbolList = React.forwardRef(
  (props: SymbolListProps, ref: React.ForwardedRef<HTMLElement>) => {
    const { subitems, ...rest } = props
    const comp = (
      <>
        {subitems.map((item, i) => {
          return <Symbol {...item} key={i} />
        })}
      </>
    )

    return (
      <Brick
        {...rest}
        partClasses={{
          ...ATOMIC_CLASS_MAP,
          outer: 'nui-symbol-list',
        }}
        type="nui-symbol-list"
        subitems={comp}
        ref={ref}
      />
    )
  }
)
