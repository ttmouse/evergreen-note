import React from 'react'
import { NButton } from '../Primative/Primative'
import { Brick, BrickProps } from '../Brick/Brick'
import './Button.sass'
import './Button.less'

export type ColorModifier =
  | 'primary'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'link'
  | 'ghost'
export type SizeModifier = 'small' | 'medium' | 'large'
export type StylizeModifier = 'outlined' | 'loading'

export type ButtonProps = BrickProps & {
  onClick?: (e: React.MouseEvent, ...args: any) => void
  color?: ColorModifier
  size?: SizeModifier
  stylize?: StylizeModifier
  disabled?: boolean
  className?: string
  children?: React.ReactNode
}

export const Button = React.forwardRef(
  (props: ButtonProps, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const { children, color, size, stylize, className, title, type, ...rest } = props
    const classes: string[] = ['button']
    if (color) {
      classes.push(`is-${color}`)
    }
    if (size) {
      classes.join(`is-${size}`)
    }
    if (stylize) {
      classes.join(`is-${stylize}`)
    }
    if (className) {
      classes.push(className)
    }

    return (
      <NButton className={classes.join(' ')} ref={ref} {...rest}>
        {title || children}
      </NButton>
    )
  }
)

export type ButtonListProps = BrickProps & {
  subitems: ButtonProps[]
}

export const ButtonList = React.forwardRef(
  (props: ButtonListProps, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const { subitems, ...rest } = props
    const comp = (
      <>
        {subitems.map((item, i) => {
          return <Button {...item} key={i} />
        })}
      </>
    )
    return (
      <Brick
        {...rest}
        partClasses={{
          outer: 'nui-button-list',
          subitems: 'buttons',
        }}
        ref={ref}
        subitems={comp}
      />
    )
  }
)
