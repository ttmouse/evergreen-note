import React from 'react'
import { NDiv } from '../Primative/Primative'
import classNames from 'classnames'

export type NPartProps = React.HTMLAttributes<HTMLDivElement> & {
  children?: React.ReactNode
  renderWhenEmpty?: boolean
  cssClass?: classNames.ArgumentArray | { [key: string]: any }
}

export const NPart = React.forwardRef(
  (props: NPartProps, ref: React.ForwardedRef<HTMLElement>) => {
    const { children, cssClass = [], className, ...rest } = props
    const classes = classNames(className, cssClass)
    return (
      <NDiv ref={ref as any} {...rest} className={classes}>
        {children}
      </NDiv>
    )
  }
)
