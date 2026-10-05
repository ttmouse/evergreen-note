/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react'
import { isEmpty } from '../utils/isEmpty'

export function getZIndex(el: HTMLElement) {
  let myIndex: string | number = window.getComputedStyle(el).zIndex
  if (myIndex === 'auto') {
    myIndex = 0
  } else {
    myIndex = Number(myIndex)
  }
  return myIndex
}

export function topZIndex(el: HTMLElement) {
  const p = el.parentElement
  if (p) {
    const { position } = window.getComputedStyle(el)
    if (['fixed', 'absolute', 'relative'].includes(position) === false) {
      return
    }
    const myIndex = getZIndex(el)
    let max = myIndex
    for (const child of Array.from(p.children)) {
      if (child !== el) {
        const z = getZIndex(child as HTMLElement)
        if (!isEmpty(z)) {
          max = Math.max(z, max)
        }
      }
    }

    if (max > myIndex || isEmpty(myIndex)) {
      Object.assign(el.style, { 'z-index': max + 1 })
    }
    topZIndex(p)
  }
}

export enum MAX_Z_INDEX {
  DIALOG = 10000,
  SNACKBAR = 20000,
  FLOAT_MENU = 30000,
  AUTO_COMPLETE = 40000,
  BACK_TO_TOP = 50000,
}

export function useTopZIndex(
  ref: React.RefObject<HTMLElement>,
  maxIndex = 10000,
  clickToTop = false,
  clickToTopFunc?: () => void
) {
  React.useEffect(() => {
    // 设一个 timeout 让它比下面的 mousedown 靠后执行
    setTimeout(() => {
      ref.current && topZIndex(ref.current)
    }, 10)
  })

  React.useEffect(() => {
    const fn = () => {
      topZIndex(ref.current!)
      clickToTopFunc && clickToTopFunc()
    }
    if (clickToTop && ref.current) {
      ref.current.addEventListener('mousedown', fn)
    }
    return () => {
      if (clickToTop && ref.current) {
        ref.current.removeEventListener('mousedown', fn)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clickToTop])
}
