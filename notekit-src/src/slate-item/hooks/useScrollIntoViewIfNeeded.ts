import React from 'react'

export function useScrollIntoViewIfNeeded(
  targetSelector: string,
  ref?: React.RefObject<HTMLElement>
) {
  const theRef = React.useRef<HTMLElement>(null)
  const bodyRef = ref ?? theRef
  React.useLayoutEffect(() => {
    if (bodyRef.current) {
      const active = bodyRef.current.querySelector(targetSelector)
      // acitve item scroll into view if needed
      if (active) {
        const { top, bottom } = active.getBoundingClientRect()
        const { top: bodyTop, bottom: bodyBottom } = bodyRef.current
          .closest('.node')!
          .getBoundingClientRect()

        if (top < bodyTop) {
          bodyRef.current.scrollTop -= bodyTop - top
        } else if (bottom > bodyBottom) {
          bodyRef.current.scrollTop += bottom - bodyBottom
        }
      }
    }
  })
  return bodyRef
}
