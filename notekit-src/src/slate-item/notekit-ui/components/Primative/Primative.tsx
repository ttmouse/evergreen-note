import React from 'react'

export const NDiv = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const { children, ...rest } = props
  return (
    <div ref={ref} {...rest}>
      {children}
    </div>
  )
})

export const NSpan = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>((props, ref) => {
  const { children, ...rest } = props
  return (
    <span ref={ref} {...rest}>
      {children}
    </span>
  )
})

export const NButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>((props, ref) => {
  const { children, ...rest } = props
  return (
    // eslint-disable-next-line react/button-has-type
    <button ref={ref} {...rest}>
      {children}
    </button>
  )
})

export const NSection = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const { children, ...rest } = props
  return (
    <section ref={ref} {...rest}>
      {children}
    </section>
  )
})
