import React from 'react'
import {
  BoxInfo,
  calcSnap,
  SnapCalcOptions,
  Placement,
} from '../../utils/calcSnap'
import { getSelectionRect } from '../../utils/dom/getSelectionRect'

const px = (val: number | string) => {
  if (typeof val === 'string') {
    return val
  }
  return `${val}px`
}

export type SnapBaseBox = BoxInfo | HTMLElement | Window | Selection

export function snap(
  floatDom: HTMLElement,
  targetBox: SnapBaseBox,
  place: Placement,
  opts: SnapCalcOptions = {} as any
) {
  try {
    if (!floatDom) {
      return
    }
    const { width, height } = floatDom.getBoundingClientRect()

    if (targetBox instanceof HTMLElement) {
      targetBox = targetBox.getBoundingClientRect()
    } else if (targetBox === window) {
      targetBox = {
        top: 0,
        left: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      }
    } else if (targetBox instanceof Selection) {
      // getBoundingClientRect() for Selection
      targetBox = getSelectionRect()!
    } else {
      targetBox = targetBox as BoxInfo
    }

    const box = calcSnap({ width, height }, targetBox, place, opts, 0)
    const rect = floatDom.getBoundingClientRect()

    Object.assign(floatDom.style, {
      left: px(box.left),
      top: px(box.top),
      transform: `translate(0, 0)`,
      margin: 0,
      position: 'fixed',
    })

    if (box.height !== rect.height) {
      Object.assign(floatDom.style, {
        height: px(box.height),
      })
    }

    if (box.width !== rect.width) {
      Object.assign(floatDom.style, {
        width: px(box.width),
      })
    }

    opts.onComplete?.(box)
  } catch (e) {
    console.error(e)
  }
}

export const useSnap = (
  floatRef: React.MutableRefObject<any>,
  targetBox: SnapBaseBox,
  place: Placement,
  opts: SnapCalcOptions = {} as any
) => {
  React.useEffect(() => {
    snap(floatRef.current!, targetBox, place, opts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })
}
