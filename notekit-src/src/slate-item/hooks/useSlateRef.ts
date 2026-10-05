import React from 'react'

/**
 * Convert a slate-react attributes.ref (which may be a callback ref in newer versions)
 * into a MutableRefObject. Returns [domRef, mergedRef] where:
 * - domRef: a MutableRefObject you can read .current from
 * - mergedRef: a callback ref to put on the DOM element (also updates the original slate ref)
 */
export function useSlateRef<T extends HTMLElement = HTMLElement>(
  slateRef: React.Ref<T> | undefined
): [React.MutableRefObject<T>, (node: T | null) => void] {
  const domRef = React.useRef<T | null>(null) as React.MutableRefObject<T>

  const mergedRef = React.useCallback(
    (node: T | null) => {
      domRef.current = node as T
      if (typeof slateRef === 'function') {
        ;(slateRef as any)(node)
      } else if (slateRef) {
        ;(slateRef as any).current = node
      }
    },
    [slateRef]
  )

  return [domRef, mergedRef]
}
