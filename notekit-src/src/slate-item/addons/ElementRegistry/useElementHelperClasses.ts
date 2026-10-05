import React from 'react'
import { ElementComponentProps } from '../EditorView/EditorView'

/**
 * Add some helper css class names to control the appearance of the element
 * @param blockType
 * @param ref The ref of slate element
 */
export function useElementHelperClasses(
  blockType: string,
  ref: React.MutableRefObject<HTMLElement>,
  props: ElementComponentProps<any>
) {
  React.useEffect(() => {
    const el = ref.current as HTMLElement

    const elWrap = el?.closest('[data-slate-node="element"]')
    elWrap?.classList.add('inline-element', `element-${blockType}`)
    if (elWrap) {
      ;(elWrap as any).$props = props
    }

    const elItem = el?.closest('.node')
    elItem?.classList.add(`node-with-${blockType}`)

    const elHead = el?.closest('.node-head')
    elHead?.classList.add(`node-head-with-${blockType}`)

    const elText = el?.closest('.node-text')
    elText?.classList.add(`node-text-with-${blockType}`)

    const prev = el?.previousElementSibling
    prev?.classList.add(`element-${blockType}-prev`)

    const next = el?.nextElementSibling
    next?.classList.add(`element-${blockType}-next`)

    return () => {
      if (!elText?.querySelector(`.element-${blockType}`)) {
        elItem?.classList.remove(`node-with-${blockType}`)
        elHead?.classList.remove(`node-head-with-${blockType}`)
        elText?.classList.remove(`node-text-with-${blockType}`)
        prev?.classList.remove(`element-${blockType}-prev`)
        next?.classList.remove(`element-${blockType}-next`)
      }
    }
  })
}
