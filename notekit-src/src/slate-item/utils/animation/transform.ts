/* eslint-disable @typescript-eslint/no-use-before-define */
export function transform(
  el: HTMLElement,
  to: HTMLElement | DOMRect,
  duration = 300
) {
  to = to instanceof HTMLElement ? to.getBoundingClientRect() : to
  const elRect = el.getBoundingClientRect()
  const translateX = to.left - elRect.left
  const translateY = to.top - elRect.top
  const scaleX = to.width / elRect.width
  const scaleY = to.height / elRect.height
  const seconds = duration / 1000
  return animate(el, {
    to: {
      transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`,
      transition: `all ${seconds}s ease-out`,
      'transform-origin': 'top left',
    },
    end: {
      display: 'none',
    },
    duration,
  })
}

type StyleProps = { [k: string]: string }
export type AnimateProps = {
  to: StyleProps
  end?: StyleProps
  duration: number
  onEnd?: () => void
}
export function animate(el: HTMLElement, options: AnimateProps) {
  const { to, duration, end = {}, onEnd } = options
  const styles = {
    transition: `all ${duration / 1000}s`,
    ...to,
  }
  Object.assign(el.style, styles)
  setTimeout(() => {
    Object.assign(el.style, end)
    onEnd?.()
  }, duration)

  // Return a function to reset those styles of animation
  return () => {
    const reset = {} as any
    for (const k of Object.keys({ ...styles, ...end })) {
      reset[k] = ''
    }
    Object.assign(el.style, reset)
  }
}
