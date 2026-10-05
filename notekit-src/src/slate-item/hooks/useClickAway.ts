import React from 'react'

/**
 * Remove the Component when the mouse click outside it
 * @param ref
 * @returns
 */
export const useClickAway = (
  ref: React.RefObject<HTMLDivElement>,
  callback: (ev: MouseEvent) => void
) => {
  React.useEffect(() => {
    if (ref?.current) {
      const fn = (e: MouseEvent): void => {
        if (!(ref.current as any)?.contains(e.target as HTMLElement)) {
          callback(e)
        }
      }
      const evtName = 'mousedown'
      document.addEventListener(evtName, fn)
      return () => {
        document.removeEventListener(evtName, fn)
      }
    }
  }, [ref])
}
